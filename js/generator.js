/**
 * AR Experience Studio & QR Code Generator
 * Provides 3D GLB previewing with OrbitControls, interactive scale/height/rotation tuning,
 * GLB file upload handling, and high-resolution printable QR code generation.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ModelLoader } from './model-loader.js';
import { AR_CONFIG } from './config.js';
import { getModelBlobUrl } from './procedural-models.js';

export class GeneratorStudio {
  constructor() {
    this.selectedModelId = 'helicopter';
    this.customModelBlobUrl = null;
    this.modelLoader = new ModelLoader();
    this.previewModel = null;
    this.clock = new THREE.Clock();

    // Configuration values
    this.config = {
      scale: AR_CONFIG.defaults.scale,
      height: AR_CONFIG.defaults.height,
      offsetX: AR_CONFIG.defaults.offsetX,
      offsetZ: AR_CONFIG.defaults.offsetZ,
      rotationY: AR_CONFIG.defaults.rotationY,
      autoRotate: AR_CONFIG.defaults.autoRotate,
      autoRotateSpeed: AR_CONFIG.defaults.autoRotateSpeed
    };

    // Initialize 3D Viewport and UI
    this.initElements();
    this.initThree();
    this.bindEvents();
    this.loadPresetModel(this.selectedModelId);
    this.generateQrCode();
  }

  initElements() {
    this.container = document.getElementById('preview-canvas-container');
    this.loadingOverlay = document.getElementById('preview-loading');
    this.loadingBar = document.getElementById('preview-progress-bar');
    this.loadingText = document.getElementById('preview-progress-text');

    // Controls
    this.modelSelect = document.getElementById('model-select');
    this.modelUrlInput = document.getElementById('input-model-url');
    this.fileDropzone = document.querySelector('.file-dropzone');
    this.fileInput = document.getElementById('file-upload');
    this.uploadHint = document.getElementById('upload-status-hint');
    this.scaleInput = document.getElementById('ctrl-scale');
    this.scaleVal = document.getElementById('val-scale');
    this.heightInput = document.getElementById('ctrl-height');
    this.heightVal = document.getElementById('val-height');
    this.offsetXInput = document.getElementById('ctrl-offset-x');
    this.offsetXVal = document.getElementById('val-offset-x');
    this.offsetZInput = document.getElementById('ctrl-offset-z');
    this.offsetZVal = document.getElementById('val-offset-z');
    this.rotationInput = document.getElementById('ctrl-rotation');
    this.rotationVal = document.getElementById('val-rotation');
    this.autoRotateInput = document.getElementById('ctrl-auto-rotate');
    this.rotateSpeedInput = document.getElementById('ctrl-rotate-speed');
    this.rotateSpeedVal = document.getElementById('val-rotate-speed');
    this.resetBtn = document.getElementById('btn-reset-params');

    // QR Output & Update Button
    this.btnUpdateQr = document.getElementById('btn-update-qr');
    this.baseUrlInput = document.getElementById('input-base-url');
    this.qrCanvas = document.getElementById('qr-output-canvas');
    this.qrUrlText = document.getElementById('qr-url-text');
    this.btnDownloadPng = document.getElementById('btn-download-qr-png');
    this.btnLaunchAr = document.getElementById('btn-launch-ar');

    // Set default base URL for AR (prioritizing hosted GitHub Pages)
    const currentOrigin = window.location.origin;
    let currentPath = window.location.pathname;
    if (currentPath.endsWith('generator.html') || currentPath.endsWith('index.html')) {
      currentPath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
    } else if (!currentPath.endsWith('/')) {
      currentPath += '/';
    }
    
    // Default to hosted GitHub Pages URL or current origin
    if (currentOrigin.includes('github.io')) {
      this.defaultBaseUrl = `${currentOrigin}${currentPath}ar.html`;
    } else {
      this.defaultBaseUrl = AR_CONFIG.hostedBaseUrl || `${currentOrigin}${currentPath}ar.html`;
    }

    if (this.baseUrlInput) {
      this.baseUrlInput.value = this.defaultBaseUrl;
    }
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0f19);

    const width = this.container.clientWidth || 600;
    const height = this.container.clientHeight || 450;

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(2.2, 1.8, 2.5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.1; // Don't go below floor
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 8.0;
    this.controls.target.set(0, 0.3, 0);

    // Add PBR lighting
    ModelLoader.setupLighting(this.scene);

    // Add marker representation plane
    this.markerPlane = ModelLoader.createMarkerPreviewPlane(1.2);
    this.scene.add(this.markerPlane);

    // Anchor group for preview model
    this.anchorGroup = new THREE.Group();
    this.scene.add(this.anchorGroup);

    // Handle resize
    window.addEventListener('resize', () => this.onResize());
    if (window.ResizeObserver && this.container) {
      new ResizeObserver(() => this.onResize()).observe(this.container);
    }

    // Start render loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  onResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  bindEvents() {
    // Preset model selector
    this.modelSelect?.addEventListener('change', (e) => {
      this.selectedModelId = e.target.value;
      this.remoteModelUrl = null;
      if (this.modelUrlInput) this.modelUrlInput.value = '';
      if (this.uploadHint) this.uploadHint.style.display = 'none';

      if (this.customModelBlobUrl) {
        URL.revokeObjectURL(this.customModelBlobUrl);
        this.customModelBlobUrl = null;
      }
      this.loadPresetModel(this.selectedModelId);
      this.generateQrCode();
    });

    // Direct Remote Model URL Input (.glb)
    this.modelUrlInput?.addEventListener('input', (e) => {
      const url = e.target.value.trim();
      if (url.length > 5 && (url.startsWith('http://') || url.startsWith('https://'))) {
        this.remoteModelUrl = url;
        this.selectedModelId = 'custom';
        if (this.uploadHint) {
          this.uploadHint.style.display = 'block';
          this.uploadHint.innerHTML = '🌐 <span style="color:#34d399;">Remote Model URL linked</span> for AR QR code.';
        }
        this.loadModelFromUrl(this.remoteModelUrl, "Remote GLB Model");
        this.generateQrCode();
      } else if (url.length === 0) {
        this.remoteModelUrl = null;
        if (this.uploadHint) this.uploadHint.style.display = 'none';
        this.loadPresetModel(this.selectedModelId === 'custom' ? 'helicopter' : this.selectedModelId);
        this.generateQrCode();
      }
    });

    // File handling helper (0 - 50 MB validation)
    const handleUploadedFile = (file) => {
      if (!file) return;

      if (!file.name.toLowerCase().endsWith('.glb') && !file.name.toLowerCase().endsWith('.gltf')) {
        alert("Please upload a valid .glb or .gltf 3D model file.");
        return;
      }

      const maxMb = AR_CONFIG.maxUploadSizeMb || 50;
      const maxBytes = maxMb * 1024 * 1024;

      if (file.size === 0) {
        alert("The selected file is empty (0 MB). Please choose a valid 3D model file between 0 - 50 MB.");
        return;
      }

      if (file.size > maxBytes) {
        const actualMb = (file.size / (1024 * 1024)).toFixed(1);
        alert(`File size (${actualMb} MB) exceeds the maximum allowed limit of ${maxMb} MB.\nPlease select a 3D model within the 0 - ${maxMb} MB range.`);
        if (this.fileInput) this.fileInput.value = '';
        return;
      }

      const fileSizeMb = (file.size / (1024 * 1024)).toFixed(1);

      if (this.customModelBlobUrl) {
        URL.revokeObjectURL(this.customModelBlobUrl);
      }

      this.customModelBlobUrl = URL.createObjectURL(file);
      this.customFileName = file.name;
      this.selectedModelId = file.name.replace(/\.[^/.]+$/, "");
      
      if (this.uploadHint) {
        this.uploadHint.style.display = 'block';
        this.uploadHint.innerHTML = `✅ <strong>${file.name}</strong> (${fileSizeMb} MB) loaded in 3D preview!<br><span style="color:#94a3b8;">Click <strong>Update &amp; Generate QR Code</strong> to generate the AR QR marker.</span>`;
      }

      this.loadModelFromUrl(this.customModelBlobUrl, `${file.name} (${fileSizeMb} MB)`);
      this.generateQrCode();
    };

    // Custom File Upload input change
    this.fileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      handleUploadedFile(file);
    });

    // Drag-and-drop support on dropzone
    if (this.fileDropzone) {
      ['dragenter', 'dragover'].forEach((eventName) => {
        this.fileDropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.fileDropzone.classList.add('drag-active');
        });
      });

      ['dragleave', 'drop'].forEach((eventName) => {
        this.fileDropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.fileDropzone.classList.remove('drag-active');
        });
      });

      this.fileDropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length > 0) {
          handleUploadedFile(dt.files[0]);
        }
      });
    }

    // Configuration Sliders
    this.scaleInput?.addEventListener('input', (e) => {
      this.config.scale = parseFloat(e.target.value);
      if (this.scaleVal) this.scaleVal.textContent = `${this.config.scale.toFixed(2)}x`;
      this.updateModelTransform();
      this.generateQrCode();
    });

    this.heightInput?.addEventListener('input', (e) => {
      this.config.height = parseFloat(e.target.value);
      if (this.heightVal) this.heightVal.textContent = `${this.config.height.toFixed(2)} m`;
      this.updateModelTransform();
      this.generateQrCode();
    });

    this.offsetXInput?.addEventListener('input', (e) => {
      this.config.offsetX = parseFloat(e.target.value);
      if (this.offsetXVal) this.offsetXVal.textContent = `${this.config.offsetX.toFixed(2)} m`;
      this.updateModelTransform();
      this.generateQrCode();
    });

    this.offsetZInput?.addEventListener('input', (e) => {
      this.config.offsetZ = parseFloat(e.target.value);
      if (this.offsetZVal) this.offsetZVal.textContent = `${this.config.offsetZ.toFixed(2)} m`;
      this.updateModelTransform();
      this.generateQrCode();
    });

    this.rotationInput?.addEventListener('input', (e) => {
      const deg = parseFloat(e.target.value);
      this.config.rotationY = (deg * Math.PI) / 180.0;
      if (this.rotationVal) this.rotationVal.textContent = `${deg}°`;
      this.updateModelTransform();
      this.generateQrCode();
    });

    this.autoRotateInput?.addEventListener('change', (e) => {
      this.config.autoRotate = e.target.checked;
      this.generateQrCode();
    });

    this.rotateSpeedInput?.addEventListener('input', (e) => {
      this.config.autoRotateSpeed = parseFloat(e.target.value);
      if (this.rotateSpeedVal) {
        const mult = (this.config.autoRotateSpeed / 0.015).toFixed(1);
        const label = this.config.autoRotateSpeed >= 0.08 ? 'Very Fast' : this.config.autoRotateSpeed >= 0.04 ? 'Fast' : 'Normal';
        this.rotateSpeedVal.textContent = `${mult}x (${label})`;
      }
      this.generateQrCode();
    });

    // Reset Parameters
    this.resetBtn?.addEventListener('click', () => {
      this.config = { ...AR_CONFIG.defaults };
      this.updateControlsUI();
      this.updateModelTransform();
      this.generateQrCode();
    });

    // Base URL changes
    this.baseUrlInput?.addEventListener('input', () => {
      this.generateQrCode();
    });

    // Update & Generate QR Code Button
    this.btnUpdateQr?.addEventListener('click', async () => {
      this.updateModelTransform();
      await this.generateQrCode();
      if (this.btnUpdateQr) {
        const originalHtml = this.btnUpdateQr.innerHTML;
        this.btnUpdateQr.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          ✓ QR Code Updated!
        `;
        this.btnUpdateQr.style.background = 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
        setTimeout(() => {
          this.btnUpdateQr.innerHTML = originalHtml;
          this.btnUpdateQr.style.background = 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)';
        }, 1800);
      }
    });

    // Download PNG
    this.btnDownloadPng?.addEventListener('click', () => {
      this.downloadQrPng();
    });

    // Launch AR
    this.btnLaunchAr?.addEventListener('click', () => {
      const targetUrl = this.buildArUrl();
      window.open(targetUrl, '_blank');
    });
  }

  updateControlsUI() {
    if (this.scaleInput) this.scaleInput.value = this.config.scale;
    if (this.scaleVal) this.scaleVal.textContent = `${this.config.scale.toFixed(2)}x`;

    if (this.heightInput) this.heightInput.value = this.config.height;
    if (this.heightVal) this.heightVal.textContent = `${this.config.height.toFixed(2)} m`;

    if (this.offsetXInput) this.offsetXInput.value = this.config.offsetX;
    if (this.offsetXVal) this.offsetXVal.textContent = `${this.config.offsetX.toFixed(2)} m`;

    if (this.offsetZInput) this.offsetZInput.value = this.config.offsetZ;
    if (this.offsetZVal) this.offsetZVal.textContent = `${this.config.offsetZ.toFixed(2)} m`;

    const deg = Math.round((this.config.rotationY * 180) / Math.PI);
    if (this.rotationInput) this.rotationInput.value = deg;
    if (this.rotationVal) this.rotationVal.textContent = `${deg}°`;

    if (this.autoRotateInput) this.autoRotateInput.checked = this.config.autoRotate;

    if (this.rotateSpeedInput) this.rotateSpeedInput.value = this.config.autoRotateSpeed;
    if (this.rotateSpeedVal) {
      const mult = (this.config.autoRotateSpeed / 0.015).toFixed(1);
      const label = this.config.autoRotateSpeed >= 0.08 ? 'Very Fast' : this.config.autoRotateSpeed >= 0.04 ? 'Fast' : 'Normal';
      this.rotateSpeedVal.textContent = `${mult}x (${label})`;
    }
  }

  showLoading(show, percent = 0, text = "Loading 3D Model...") {
    if (!this.loadingOverlay) return;
    this.loadingOverlay.style.display = show ? 'flex' : 'none';
    if (this.loadingBar) this.loadingBar.style.width = `${percent}%`;
    if (this.loadingText) this.loadingText.textContent = `${text} (${percent}%)`;
  }

  async loadPresetModel(modelId) {
    const preset = AR_CONFIG.models[modelId];
    if (preset) {
      // Apply preset defaults
      this.config.scale = preset.scale;
      this.config.height = preset.height;
      this.config.offsetX = preset.offsetX || 0;
      this.config.offsetZ = preset.offsetZ || 0;
      this.config.rotationY = preset.rotationY || 0;
      this.config.autoRotate = preset.autoRotate || false;
      this.updateControlsUI();
    }

    let sourceUrl;
    if (preset?.isProcedural || ['helicopter', 'drone', 'robot', 'car'].includes(modelId)) {
      sourceUrl = getModelBlobUrl(modelId);
    } else if (preset?.file) {
      sourceUrl = preset.file;
    } else {
      sourceUrl = `models/${modelId}.glb`;
    }

    await this.loadModelFromUrl(sourceUrl, preset ? preset.name : modelId);
  }

  async loadModelFromUrl(url, label) {
    this.showLoading(true, 10, `Loading ${label}`);
    try {
      this.modelLoader.dispose();
      while (this.anchorGroup.children.length > 0) {
        this.anchorGroup.remove(this.anchorGroup.children[0]);
      }

      const model = await this.modelLoader.load(url, (percent, loadedMb, totalMb) => {
        const mbInfo = totalMb ? ` (${loadedMb} / ${totalMb} MB)` : loadedMb ? ` (${loadedMb} MB)` : '';
        this.showLoading(true, percent, `Loading ${label}${mbInfo}`);
      });

      this.previewModel = model;
      this.anchorGroup.add(model);
      this.updateModelTransform();
      this.showLoading(false);
    } catch (err) {
      console.error(err);
      this.showLoading(false);
      alert("Failed to load 3D model. Please check the file format.");
    }
  }

  updateModelTransform() {
    if (!this.previewModel) return;

    // Apply scale
    this.previewModel.scale.setScalar(this.config.scale);

    // Apply position (Centered on QR Plane, elevated by height)
    this.previewModel.position.set(
      this.config.offsetX,
      this.config.height,
      this.config.offsetZ
    );

    // Apply base rotation
    this.previewModel.rotation.y = this.config.rotationY;
  }

  buildArUrl() {
    let baseUrl = this.baseUrlInput ? this.baseUrlInput.value.trim() : this.defaultBaseUrl;
    if (!baseUrl) baseUrl = this.defaultBaseUrl;

    const url = new URL(baseUrl, window.location.href);
    url.searchParams.set('id', this.selectedModelId);
    if (this.remoteModelUrl) {
      url.searchParams.set('modelUrl', this.remoteModelUrl);
    }
    url.searchParams.set('scale', this.config.scale.toFixed(2));
    url.searchParams.set('height', this.config.height.toFixed(2));
    if (this.config.offsetX !== 0) url.searchParams.set('ox', this.config.offsetX.toFixed(2));
    if (this.config.offsetZ !== 0) url.searchParams.set('oz', this.config.offsetZ.toFixed(2));
    if (this.config.rotationY !== 0) url.searchParams.set('rot', Math.round((this.config.rotationY * 180) / Math.PI));
    if (this.config.autoRotate) {
      url.searchParams.set('ar', '1');
      url.searchParams.set('spd', this.config.autoRotateSpeed.toFixed(3));
    }

    return url.toString();
  }

  /**
   * Draw high contrast QR code on canvas with printable framing & instructions
   */
  async generateQrCode() {
    if (!this.qrCanvas) return;
    const targetUrl = this.buildArUrl();

    if (this.qrUrlText) {
      this.qrUrlText.textContent = targetUrl;
      this.qrUrlText.title = targetUrl;
    }

    try {
      // Dynamic import or global QRCode generator
      const QRCode = window.QRCode || (await import('qrcode')).default;

      // Render high resolution QR to temporary canvas with clean quiet zone
      const qrSize = 400;
      const qrTempCanvas = document.createElement('canvas');
      await QRCode.toCanvas(qrTempCanvas, targetUrl, {
        width: qrSize,
        margin: 3,
        color: {
          dark: '#000000',
          light: '#ffffff'
        },
        errorCorrectionLevel: 'M' // Medium error correction level for maximum module contrast and fast CV detection
      });

      // Composite onto final canvas with card frame, instructions & brand styling
      const totalWidth = 520;
      const totalHeight = 640;
      this.qrCanvas.width = totalWidth;
      this.qrCanvas.height = totalHeight;
      const ctx = this.qrCanvas.getContext('2d');

      // Card Background (Pure crisp white with subtle border)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, totalWidth, totalHeight);

      // Card Header Banner
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(16, 16, totalWidth - 32, 60);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CUSTOM WEBAR 3D AR', totalWidth / 2, 44);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`MODEL: ${this.selectedModelId.toUpperCase()}`, totalWidth / 2, 64);

      // Draw QR Code
      const qrOffset = (totalWidth - qrSize) / 2;
      ctx.drawImage(qrTempCanvas, qrOffset, 90, qrSize, qrSize);

      // Corner target registration brackets cleanly outside the QR quiet zone
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 3;
      const bracketLen = 20;
      const pad = 8;
      const bLeft = qrOffset - pad;
      const bTop = 90 - pad;
      const bRight = qrOffset + qrSize + pad;
      const bBottom = 90 + qrSize + pad;

      // Top-Left
      ctx.beginPath();
      ctx.moveTo(bLeft, bTop + bracketLen);
      ctx.lineTo(bLeft, bTop);
      ctx.lineTo(bLeft + bracketLen, bTop);
      ctx.stroke();

      // Top-Right
      ctx.beginPath();
      ctx.moveTo(bRight - bracketLen, bTop);
      ctx.lineTo(bRight, bTop);
      ctx.lineTo(bRight, bTop + bracketLen);
      ctx.stroke();

      // Bottom-Right
      ctx.beginPath();
      ctx.moveTo(bRight, bBottom - bracketLen);
      ctx.lineTo(bRight, bBottom);
      ctx.lineTo(bRight - bracketLen, bBottom);
      ctx.stroke();

      // Bottom-Left
      ctx.beginPath();
      ctx.moveTo(bLeft + bracketLen, bBottom);
      ctx.lineTo(bLeft, bBottom);
      ctx.lineTo(bLeft, bBottom - bracketLen);
      ctx.stroke();

      // Card Footer Instruction Box
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(16, totalHeight - 120, totalWidth - 32, 104);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.strokeRect(16, totalHeight - 120, totalWidth - 32, 104);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('1. SCAN QR WITH MOBILE CAMERA', totalWidth / 2, totalHeight - 92);

      ctx.fillStyle = '#64748b';
      ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('2. Allow camera access & point camera at this QR code', totalWidth / 2, totalHeight - 68);
      ctx.fillText('3. Move phone around marker to view 3D model in 360°', totalWidth / 2, totalHeight - 48);
      ctx.fillText('Recommended print size: 10 × 10 cm or 15 × 15 cm', totalWidth / 2, totalHeight - 28);
    } catch (err) {
      console.error("Error generating QR code:", err);
    }
  }

  downloadQrPng() {
    if (!this.qrCanvas) return;
    const link = document.createElement('a');
    link.download = `webar-qr-${this.selectedModelId}.png`;
    link.href = this.qrCanvas.toDataURL('image/png');
    link.click();
  }

  animate() {
    requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.05);

    // Update animations (if any)
    this.modelLoader.update(delta);

    // Auto-rotation simulation in preview (time-normalized)
    if (this.config.autoRotate && this.previewModel) {
      const spd = this.config.autoRotateSpeed || 0.05;
      this.previewModel.rotation.y += spd * (delta * 60.0);
      if (this.rotationInput) {
        const deg = Math.round((this.previewModel.rotation.y * 180 / Math.PI) % 360);
        this.rotationVal.textContent = `${deg}°`;
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// Auto-boot when DOM ready
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('preview-canvas-container')) {
      window.generatorStudio = new GeneratorStudio();
    }
  });
}
