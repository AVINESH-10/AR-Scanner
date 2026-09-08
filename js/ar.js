/**
 * WebAR 3D Experience Controller
 * Mobile camera pipeline, 6DOF marker pose updates, Three.js 3D GLB rendering,
 * spatial anchoring, HUD tracking notifications, and interactive controls.
 */

import * as THREE from 'three';
import { AR_CONFIG } from './config.js';
import { ARTracker } from './tracker.js';
import { ModelLoader } from './model-loader.js';
import { getModelBlobUrl } from './procedural-models.js';

export class ArExperience {
  constructor() {
    this.modelId = 'helicopter';
    this.customModelUrl = null;
    this.modelLoader = new ModelLoader();
    this.model = null;
    this.markerGroup = new THREE.Group();
    this.clock = new THREE.Clock();

    // Configuration parsed from URL or defaults
    this.config = {
      scale: AR_CONFIG.defaults.scale,
      height: AR_CONFIG.defaults.height,
      offsetX: AR_CONFIG.defaults.offsetX,
      offsetZ: AR_CONFIG.defaults.offsetZ,
      rotationY: AR_CONFIG.defaults.rotationY,
      autoRotate: AR_CONFIG.defaults.autoRotate,
      autoRotateSpeed: AR_CONFIG.defaults.autoRotateSpeed
    };

    // Tracking & Scanner Switching State
    this.isTrackingActive = false;
    this.isLoadingModel = false;
    this.scannerToastTimeout = null;
    this.lastDecodedRaw = null;
    this.lastFrameTime = performance.now();

    // Initialize UI & Components
    this.parseUrlParams();
    this.initElements();
    this.initThree();
    this.initTracker();
    this.initCamera();
    this.load3dModel();
    this.bindControls();
    this.preloadRegisteredModels();
  }

  parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('id')) this.modelId = params.get('id');
    if (params.has('modelUrl')) this.customModelUrl = params.get('modelUrl');

    const preset = AR_CONFIG.models[this.modelId] || AR_CONFIG.models.helicopter;
    if (preset) {
      this.config.scale = preset.scale;
      this.config.height = preset.height;
      this.config.offsetX = preset.offsetX || 0;
      this.config.offsetZ = preset.offsetZ || 0;
      this.config.rotationY = preset.rotationY || 0;
      this.config.autoRotate = preset.autoRotate || false;
    }

    if (params.has('scale')) this.config.scale = parseFloat(params.get('scale'));
    if (params.has('height')) this.config.height = parseFloat(params.get('height'));
    if (params.has('ox')) this.config.offsetX = parseFloat(params.get('ox'));
    if (params.has('oz')) this.config.offsetZ = parseFloat(params.get('oz'));
    if (params.has('rot')) this.config.rotationY = (parseFloat(params.get('rot')) * Math.PI) / 180.0;
    if (params.has('ar')) this.config.autoRotate = params.get('ar') === '1' || params.get('ar') === 'true';
    if (params.has('spd')) this.config.autoRotateSpeed = parseFloat(params.get('spd'));
    if (params.has('speed')) this.config.autoRotateSpeed = parseFloat(params.get('speed'));

    // Store defaults for Reset function
    this.initialConfig = { ...this.config };
  }

  initElements() {
    this.videoElement = document.getElementById('camera-feed');
    this.arCanvasContainer = document.getElementById('ar-viewport');
    this.statusPill = document.getElementById('tracking-status-pill');
    this.statusText = document.getElementById('tracking-status-text');
    this.statusDot = document.getElementById('tracking-status-dot');
    this.lostBanner = document.getElementById('tracking-lost-banner');
    this.loadingOverlay = document.getElementById('ar-loading');
    this.loadingBar = document.getElementById('ar-progress-bar');
    this.loadingText = document.getElementById('ar-progress-text');
    this.errorModal = document.getElementById('error-modal');
    this.errorMsg = document.getElementById('error-modal-msg');
    this.modelNameLabel = document.getElementById('hud-model-name');

    // Auto-Scanner Toast notification
    this.scannerToast = document.getElementById('scanner-detected-toast');
    this.scannerToastTitle = document.getElementById('scanner-toast-title');
    this.scannerToastSubtitle = document.getElementById('scanner-toast-subtitle');

    // Controls
    this.btnScaleMinus = document.getElementById('btn-scale-minus');
    this.btnScalePlus = document.getElementById('btn-scale-plus');
    this.scaleLabel = document.getElementById('val-hud-scale');
    this.btnAutoRotate = document.getElementById('btn-toggle-auto-rotate');
    this.btnReset = document.getElementById('btn-ar-reset');
    this.btnFullscreen = document.getElementById('btn-ar-fullscreen');

    if (this.modelNameLabel) {
      const preset = AR_CONFIG.models[this.modelId];
      this.modelNameLabel.textContent = preset ? preset.name : this.modelId.toUpperCase();
    }

    this.updateControlsUI();
  }

  initThree() {
    this.scene = new THREE.Scene();

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Target positions for smooth continuous interpolation
    this.targetPosition = new THREE.Vector3();
    this.targetQuaternion = new THREE.Quaternion();
    this.hasTrackedPose = false;

    // Perspective Camera matching assumed vertical FOV
    this.camera = new THREE.PerspectiveCamera(AR_CONFIG.cameraFov, width / height, 0.05, 50);
    this.camera.position.set(0, 0, 0); // AR Camera is at origin
    this.scene.add(this.camera);

    // Alpha transparent WebGL renderer over the video element (optimized for mobile 60/120 FPS)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', precision: 'mediump' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.id = 'threejs-ar-canvas';

    this.arCanvasContainer.appendChild(this.renderer.domElement);

    // Setup production PBR lighting
    ModelLoader.setupLighting(this.scene);

    // Marker Anchor Group (Anchored to physical QR marker in 3D real space)
    this.markerGroup = new THREE.Group();
    this.markerGroup.visible = false; // Initially hidden until QR detected
    this.scene.add(this.markerGroup);

    // Offscreen Canvas for ultra-fast downscaled jsQR image extraction
    this.scanCanvas = document.createElement('canvas');
    this.scanContext = this.scanCanvas.getContext('2d', { willReadFrequently: true });
    this.isScanning = false;

    // Resize listener
    window.addEventListener('resize', () => this.onResize());

    // Start render loop
    this.renderLoop = this.renderLoop.bind(this);
    requestAnimationFrame(this.renderLoop);
  }

  onResize() {
    this.updateCameraFov();
  }

  updateCameraFov() {
    const sw = window.innerWidth;
    const sh = window.innerHeight;
    const screenAspect = sw / sh;

    const vw = this.videoElement?.videoWidth || 1280;
    const vh = this.videoElement?.videoHeight || 720;
    const videoAspect = vw / vh;

    const baseFov = AR_CONFIG.cameraFov || 50.0;
    let effectiveFov = baseFov;

    if (screenAspect < videoAspect) {
      // Screen is narrower than video (e.g. portrait phone) -> Video cropped horizontally
      effectiveFov = baseFov;
    } else {
      // Screen is wider than video -> Video cropped vertically
      const tanBase = Math.tan((baseFov * Math.PI) / 360.0);
      const tanEffective = tanBase * (screenAspect / videoAspect);
      effectiveFov = (2.0 * Math.atan(tanEffective) * 180.0) / Math.PI;
    }

    this.camera.fov = effectiveFov;
    this.camera.aspect = screenAspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(sw, sh);
  }

  initTracker() {
    this.tracker = new ARTracker({
      markerSize: AR_CONFIG.markerSize,
      cameraFov: AR_CONFIG.cameraFov,
      onStatusChange: (status) => this.handleTrackingStatus(status),
      onPoseUpdate: (pose) => this.handlePoseUpdate(pose),
      onQrDecoded: (data) => this.handleQrDecoded(data)
    });
  }

  /**
   * Parse arbitrary QR payload: URLs, query parameters, JSON, or direct model names
   */
  parseQrData(data) {
    if (typeof data !== 'string') return null;
    const trimmed = data.trim();
    if (!trimmed) return null;

    let targetId = null;
    let customModelUrl = null;
    let params = null;
    let hasCustomParams = false;

    // 1. JSON payload
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const obj = JSON.parse(trimmed);
        if (obj.id || obj.modelId || obj.model) {
          targetId = obj.id || obj.modelId || obj.model;
        }
        if (obj.modelUrl) customModelUrl = obj.modelUrl;
        const config = {};
        if (obj.scale !== undefined) { config.scale = parseFloat(obj.scale); hasCustomParams = true; }
        if (obj.height !== undefined) { config.height = parseFloat(obj.height); hasCustomParams = true; }
        if (obj.ox !== undefined) { config.offsetX = parseFloat(obj.ox); hasCustomParams = true; }
        if (obj.oz !== undefined) { config.offsetZ = parseFloat(obj.oz); hasCustomParams = true; }
        if (obj.rot !== undefined) { config.rotationY = (parseFloat(obj.rot) * Math.PI) / 180.0; hasCustomParams = true; }
        if (obj.ar !== undefined) { config.autoRotate = obj.ar === true || obj.ar === 1 || obj.ar === '1'; hasCustomParams = true; }
        if (obj.spd !== undefined) { config.autoRotateSpeed = parseFloat(obj.spd); hasCustomParams = true; }
        return { modelId: targetId, customModelUrl, config, hasCustomParams };
      } catch (e) {}
    }

    // 2. Full URL, Relative URL or Query string
    try {
      let urlObj = null;
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        urlObj = new URL(trimmed);
      } else if (trimmed.includes('?') || trimmed.startsWith('ar.html') || trimmed.startsWith('/ar.html')) {
        urlObj = new URL(trimmed, window.location.origin);
      }
      if (urlObj) {
        params = urlObj.searchParams;
      }
    } catch (e) {}

    if (!params && (trimmed.includes('id=') || trimmed.includes('&') || trimmed.includes('='))) {
      try {
        params = new URLSearchParams(trimmed.startsWith('?') ? trimmed.slice(1) : trimmed);
      } catch (e) {}
    }

    if (params) {
      if (params.has('id')) targetId = params.get('id');
      if (params.has('model')) targetId = params.get('model');
      if (params.has('modelUrl')) customModelUrl = params.get('modelUrl');

      const config = {};
      if (params.has('scale')) { config.scale = parseFloat(params.get('scale')); hasCustomParams = true; }
      if (params.has('height')) { config.height = parseFloat(params.get('height')); hasCustomParams = true; }
      if (params.has('ox')) { config.offsetX = parseFloat(params.get('ox')); hasCustomParams = true; }
      if (params.has('oz')) { config.offsetZ = parseFloat(params.get('oz')); hasCustomParams = true; }
      if (params.has('rot')) { config.rotationY = (parseFloat(params.get('rot')) * Math.PI) / 180.0; hasCustomParams = true; }
      if (params.has('ar')) { config.autoRotate = params.get('ar') === '1' || params.get('ar') === 'true'; hasCustomParams = true; }
      if (params.has('spd')) { config.autoRotateSpeed = parseFloat(params.get('spd')); hasCustomParams = true; }
      if (params.has('speed')) { config.autoRotateSpeed = parseFloat(params.get('speed')); hasCustomParams = true; }

      if (targetId || customModelUrl) {
        return { modelId: targetId || this.modelId, customModelUrl, config, hasCustomParams };
      }
    }

    // 3. Direct model identifier or known alias
    const cleanKey = trimmed.toLowerCase().replace(/[\s-]+/g, '_');
    if (AR_CONFIG.models[cleanKey]) {
      return { modelId: cleanKey, customModelUrl: null, config: {}, hasCustomParams: false };
    }

    for (const key of Object.keys(AR_CONFIG.models)) {
      if (cleanKey.includes(key)) {
        return { modelId: key, customModelUrl: null, config: {}, hasCustomParams: false };
      }
    }

    return null;
  }

  /**
   * Handle QR decoded callback from 6DOF tracker
   */
  handleQrDecoded(rawDecodedData) {
    if (!rawDecodedData) return;
    if (rawDecodedData === this.lastDecodedRaw) return;
    this.lastDecodedRaw = rawDecodedData;

    const parsed = this.parseQrData(rawDecodedData);
    if (!parsed || !parsed.modelId) return;

    // Check if it matches current active model and config
    if (parsed.modelId === this.modelId && parsed.customModelUrl === this.customModelUrl && !parsed.hasCustomParams) {
      return;
    }

    console.log(`[Auto-Scanner] Detected new scanner code -> Switching to model: ${parsed.modelId}`);
    this.switchModel(parsed);
  }

  /**
   * Seamlessly switch the active 3D model while camera is open and running
   */
  async switchModel(parsed) {
    const { modelId, customModelUrl, config: customConfig } = parsed;
    if (this.isLoadingModel) return;
    this.isLoadingModel = true;

    this.modelId = modelId;
    this.customModelUrl = customModelUrl || null;

    const preset = AR_CONFIG.models[this.modelId];
    const modelDisplayName = preset ? preset.name : (this.modelId ? this.modelId.toUpperCase() : 'Custom Model');

    // Update configuration parameters
    if (preset) {
      this.config.scale = customConfig?.scale !== undefined ? customConfig.scale : preset.scale;
      this.config.height = customConfig?.height !== undefined ? customConfig.height : preset.height;
      this.config.offsetX = customConfig?.offsetX !== undefined ? customConfig.offsetX : (preset.offsetX || 0);
      this.config.offsetZ = customConfig?.offsetZ !== undefined ? customConfig.offsetZ : (preset.offsetZ || 0);
      this.config.rotationY = customConfig?.rotationY !== undefined ? customConfig.rotationY : (preset.rotationY || 0);
      this.config.autoRotate = customConfig?.autoRotate !== undefined ? customConfig.autoRotate : (preset.autoRotate || false);
      if (customConfig?.autoRotateSpeed !== undefined) {
        this.config.autoRotateSpeed = customConfig.autoRotateSpeed;
      }
    } else {
      if (customConfig?.scale !== undefined) this.config.scale = customConfig.scale;
      if (customConfig?.height !== undefined) this.config.height = customConfig.height;
      if (customConfig?.offsetX !== undefined) this.config.offsetX = customConfig.offsetX;
      if (customConfig?.offsetZ !== undefined) this.config.offsetZ = customConfig.offsetZ;
      if (customConfig?.rotationY !== undefined) this.config.rotationY = customConfig.rotationY;
      if (customConfig?.autoRotate !== undefined) this.config.autoRotate = customConfig.autoRotate;
      if (customConfig?.autoRotateSpeed !== undefined) this.config.autoRotateSpeed = customConfig.autoRotateSpeed;
    }

    this.initialConfig = { ...this.config };

    // Update HUD Model Label
    if (this.modelNameLabel) {
      this.modelNameLabel.textContent = modelDisplayName.toUpperCase();
    }
    this.updateControlsUI();

    // Show scanner detection toast immediately
    this.showScannerToast(modelDisplayName, "SCANNER IDENTIFIED");

    // Update browser URL state without page reload
    try {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('id', this.modelId);
      if (this.customModelUrl) newUrl.searchParams.set('modelUrl', this.customModelUrl);
      else newUrl.searchParams.delete('modelUrl');
      window.history.replaceState({}, '', newUrl.toString());
    } catch (e) {}

    // Resolve model source URL
    let modelSourceUrl;
    if (this.customModelUrl) {
      modelSourceUrl = this.customModelUrl;
    } else if (preset?.isProcedural || ['helicopter', 'drone', 'robot', 'car'].includes(this.modelId)) {
      modelSourceUrl = getModelBlobUrl(this.modelId);
    } else if (preset?.file) {
      modelSourceUrl = preset.file;
    } else {
      modelSourceUrl = `models/${this.modelId}.glb`;
    }

    try {
      const newModel = await this.modelLoader.load(modelSourceUrl, (percent) => {
        if (percent < 100) {
          this.showScannerToast(`Loading ${modelDisplayName}... ${percent}%`, "SCANNER IDENTIFIED", 1500);
        }
      });

      // Swap model in 3D scene smoothly
      if (this.model && this.markerGroup) {
        this.markerGroup.remove(this.model);
      }

      this.model = newModel;
      this.markerGroup.add(newModel);
      this.updateModelTransform();
      this.showScannerToast(modelDisplayName, "3D MODEL ACTIVE", 2500);
    } catch (err) {
      console.error("Failed to switch model in real time:", err);
      this.showScannerToast(`Failed to load ${modelDisplayName}`, "ERROR", 3000);
    } finally {
      this.isLoadingModel = false;
    }
  }

  /**
   * Display HUD Toast Notification for Scanner Detection
   */
  showScannerToast(title, subtitle = "SCANNER DETECTED", duration = 2500) {
    if (!this.scannerToast) return;
    if (this.scannerToastTitle) this.scannerToastTitle.textContent = title;
    if (this.scannerToastSubtitle) this.scannerToastSubtitle.textContent = subtitle;

    this.scannerToast.style.display = 'flex';
    this.scannerToast.classList.add('active');

    if (this.scannerToastTimeout) clearTimeout(this.scannerToastTimeout);
    this.scannerToastTimeout = setTimeout(() => {
      if (this.scannerToast) {
        this.scannerToast.style.display = 'none';
        this.scannerToast.classList.remove('active');
      }
    }, duration);
  }

  /**
   * Preload registered models in background to make multi-scanner sweeps instant (< 10ms)
   */
  preloadRegisteredModels() {
    setTimeout(() => {
      const modelKeys = Object.keys(AR_CONFIG.models || {});
      modelKeys.forEach((key) => {
        if (key === this.modelId) return;
        const preset = AR_CONFIG.models[key];
        let url;
        if (preset?.isProcedural || ['helicopter', 'drone', 'robot', 'car'].includes(key)) {
          url = getModelBlobUrl(key);
        } else if (preset?.file) {
          url = preset.file;
        } else {
          url = `models/${key}.glb`;
        }
        if (url) {
          this.modelLoader.load(url).catch(() => {});
        }
      });
    }, 2500);
  }

  async initCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        this.showError("Camera access requires a secure HTTPS connection. Please deploy to GitHub Pages (HTTPS) or use an HTTPS tunnel.");
      } else {
        this.showError("Your browser does not support camera access (getUserMedia API). Please update to the latest Chrome or Safari.");
      }
      return;
    }

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: AR_CONFIG.camera?.idealWidth || 1920, min: AR_CONFIG.camera?.minWidth || 1280 },
        height: { ideal: AR_CONFIG.camera?.idealHeight || 1080, min: AR_CONFIG.camera?.minHeight || 720 },
        frameRate: { ideal: AR_CONFIG.camera?.frameRate || 60, min: 30 }
      }
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = stream;
      await this.videoElement.play();

      this.videoElement.onloadedmetadata = () => {
        this.updateCameraFov();
      };
    } catch (err) {
      console.error("Camera access error:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.showError("Camera permission denied. Please enable camera permissions in your mobile browser settings to view 3D models in AR.");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        this.showError("No camera device detected on your mobile device.");
      } else if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        this.showError("Mobile browsers require HTTPS for camera access. Please open the live GitHub Pages link: https://avinesh-10.github.io/AR-Scanner/ar.html");
      } else {
        this.showError(`Unable to start camera: ${err.message || 'Unknown error'}`);
      }
    }
  }

  async load3dModel() {
    this.showLoading(true, 15, "Loading 3D Model...");
    try {
      let modelSourceUrl;
      if (this.customModelUrl) {
        modelSourceUrl = this.customModelUrl;
      } else if (AR_CONFIG.models[this.modelId]?.isProcedural || ['helicopter', 'drone', 'robot', 'car'].includes(this.modelId)) {
        modelSourceUrl = getModelBlobUrl(this.modelId);
      } else if (AR_CONFIG.models[this.modelId]?.file) {
        modelSourceUrl = AR_CONFIG.models[this.modelId].file;
      } else {
        modelSourceUrl = `models/${this.modelId}.glb`;
      }

      const model = await this.modelLoader.load(modelSourceUrl, (percent, loadedMb, totalMb) => {
        const mbInfo = totalMb ? ` (${loadedMb} / ${totalMb} MB)` : loadedMb ? ` (${loadedMb} MB)` : '';
        this.showLoading(true, percent, `Loading 3D Model...${mbInfo}`);
      });

      this.model = model;
      this.markerGroup.add(model);
      this.updateModelTransform();
      this.showLoading(false);
    } catch (err) {
      console.error("Failed to load model:", err);
      this.showLoading(false);
      this.showError("Failed to load 3D model. Please verify GLB asset URL and format.");
    }
  }

  updateModelTransform() {
    if (!this.model) return;
    this.model.scale.setScalar(this.config.scale);
    this.model.position.set(this.config.offsetX, this.config.height, this.config.offsetZ);
    this.model.rotation.y = this.config.rotationY;
  }

  handleTrackingStatus(status) {
    if (!this.statusPill || !this.statusText) return;

    this.statusPill.className = 'status-pill ' + status;

    switch (status) {
      case 'searching':
        this.statusText.textContent = 'SEARCHING FOR QR...';
        if (this.lostBanner) this.lostBanner.style.display = 'none';
        this.isTrackingActive = false;
        break;
      case 'detected':
        this.statusText.textContent = 'QR DETECTED ✓';
        if (this.lostBanner) this.lostBanner.style.display = 'none';
        this.isTrackingActive = true;
        this.markerGroup.visible = true;
        break;
      case 'tracking':
        this.statusText.textContent = 'TRACKING ACTIVE ✓';
        if (this.lostBanner) this.lostBanner.style.display = 'none';
        this.isTrackingActive = true;
        this.markerGroup.visible = true;
        break;
      case 'lost':
        this.statusText.textContent = 'QR LOST';
        if (this.lostBanner) this.lostBanner.style.display = 'flex';
        this.isTrackingActive = false;
        // Keep visible briefly for smoother visual continuity
        setTimeout(() => {
          if (!this.isTrackingActive) {
            this.markerGroup.visible = false;
          }
        }, 500);
        break;
    }
  }

  handlePoseUpdate(pose) {
    // Continuous target tracking coordinates
    this.targetPosition.copy(pose.position);
    this.targetQuaternion.copy(pose.quaternion);

    if (!this.hasTrackedPose) {
      // First frame detected: snap directly to prevent startup transition
      this.markerGroup.position.copy(pose.position);
      this.markerGroup.quaternion.copy(pose.quaternion);
      this.hasTrackedPose = true;
    }
    this.markerGroup.visible = true;
  }

  bindControls() {
    this.btnScaleMinus?.addEventListener('click', () => {
      this.config.scale = Math.max(0.2, this.config.scale - 0.1);
      this.updateControlsUI();
      this.updateModelTransform();
    });

    this.btnScalePlus?.addEventListener('click', () => {
      this.config.scale = Math.min(3.0, this.config.scale + 0.1);
      this.updateControlsUI();
      this.updateModelTransform();
    });

    this.btnAutoRotate?.addEventListener('click', () => {
      if (!this.config.autoRotate) {
        this.config.autoRotate = true;
        this.config.autoRotateSpeed = this.config.autoRotateSpeed || 0.05;
      } else if (this.config.autoRotateSpeed < 0.07) {
        // Step to Very Fast
        this.config.autoRotateSpeed = 0.09;
      } else if (this.config.autoRotateSpeed < 0.11) {
        // Step to Max Speed
        this.config.autoRotateSpeed = 0.14;
      } else {
        // Turn OFF
        this.config.autoRotate = false;
        this.config.autoRotateSpeed = 0.05;
      }
      this.updateControlsUI();
    });

    this.btnReset?.addEventListener('click', () => {
      this.resetAr();
    });

    this.btnFullscreen?.addEventListener('click', () => {
      this.toggleFullscreen();
    });
  }

  updateControlsUI() {
    if (this.scaleLabel) {
      this.scaleLabel.textContent = `${this.config.scale.toFixed(1)}x`;
    }
    if (this.btnAutoRotate) {
      if (this.config.autoRotate) {
        this.btnAutoRotate.classList.add('active');
        const mult = ((this.config.autoRotateSpeed || 0.05) / 0.015).toFixed(1);
        this.btnAutoRotate.textContent = `Rotate: ${mult}x`;
      } else {
        this.btnAutoRotate.classList.remove('active');
        this.btnAutoRotate.textContent = 'Auto Rotate: OFF';
      }
    }
  }

  resetAr() {
    this.config = { ...this.initialConfig };
    this.tracker.reset();
    this.hasTrackedPose = false;
    this.markerGroup.visible = false;
    this.updateControlsUI();
    this.updateModelTransform();
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn("Fullscreen request error:", err);
      });
    } else {
      document.exitFullscreen().catch(console.warn);
    }
  }

  showLoading(show, percent = 0, text = "Loading...") {
    if (!this.loadingOverlay) return;
    this.loadingOverlay.style.display = show ? 'flex' : 'none';
    if (this.loadingBar) this.loadingBar.style.width = `${percent}%`;
    if (this.loadingText) this.loadingText.textContent = `${text} (${percent}%)`;
  }

  showError(msg) {
    if (!this.errorModal || !this.errorMsg) {
      alert(msg);
      return;
    }
    this.errorMsg.textContent = msg;
    this.errorModal.style.display = 'flex';
  }

  renderLoop(timestamp) {
    requestAnimationFrame(this.renderLoop);

    const delta = Math.min(this.clock.getDelta(), 0.1);

    // 1. Decoupled ultra-fast CV processing (never blocks 60/120 FPS render pipeline)
    if (!this.isScanning && this.videoElement && this.videoElement.readyState === this.videoElement.HAVE_ENOUGH_DATA) {
      const vw = this.videoElement.videoWidth;
      const vh = this.videoElement.videoHeight;

      if (vw > 0 && vh > 0) {
        this.isScanning = true;
        const maxScanDim = AR_CONFIG.cv?.maxScanDimension || 512;
        let scanW, scanH;
        if (vw >= vh) {
          scanW = Math.min(vw, maxScanDim);
          scanH = Math.round(scanW * (vh / vw));
        } else {
          scanH = Math.min(vh, maxScanDim);
          scanW = Math.round(scanH * (vw / vh));
        }

        if (this.scanCanvas.width !== scanW || this.scanCanvas.height !== scanH) {
          this.scanCanvas.width = scanW;
          this.scanCanvas.height = scanH;
        }

        this.scanContext.drawImage(this.videoElement, 0, 0, scanW, scanH);
        const imageData = this.scanContext.getImageData(0, 0, scanW, scanH);

        const scaleX = vw / scanW;
        const scaleY = vh / scanH;

        if (window.jsQR) {
          this.tracker.processFrame(imageData, window.jsQR, timestamp, scaleX, scaleY, vw, vh);
        }
        this.isScanning = false;
      }
    }

    // 2. Smooth continuous Slerp/Lerp pose interpolation (eliminates hand tremor & jitter)
    if (this.isTrackingActive && this.hasTrackedPose) {
      const lerpFactor = Math.min(1.0, 1.0 - Math.exp(-28.0 * delta));
      this.markerGroup.position.lerp(this.targetPosition, lerpFactor);
      this.markerGroup.quaternion.slerp(this.targetQuaternion, lerpFactor);
    }

    // 3. Update Model Animations (skeletal characters, dancing skeleton, fluttering butterfly wings, rotors, etc.)
    this.modelLoader.update(delta);

    // 4. Time-normalized Model Auto-Rotation (consistent fast speed on mobile & desktop)
    if (this.config.autoRotate && this.model) {
      const spd = this.config.autoRotateSpeed || 0.05;
      this.model.rotation.y += spd * (delta * 60.0);
    }

    // 5. Render 3D Three.js Scene directly overlaying the camera view
    this.renderer.render(this.scene, this.camera);
  }
}

// Auto-boot when DOM ready
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('camera-feed')) {
      window.arExperience = new ArExperience();
    }
  });
}
