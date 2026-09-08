/**
 * Three.js GLB/GLTF 3D Model Manager
 * Handles asynchronous model loading, progress tracking, automatic bounding-box normalization,
 * PBR material enhancement, animation playback, and scene lighting.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class ModelLoader {
  constructor() {
    this.loader = new GLTFLoader();
    this.currentModel = null;
    this.currentGltf = null;
    this.activeMixer = null;
    this.activeActions = [];
    this.modelCache = new Map(); // url -> { model, mixer, actions }
  }

  get mixer() {
    return this.activeMixer;
  }

  set mixer(m) {
    this.activeMixer = m;
  }

  /**
   * Setup production PBR lighting on a Three.js scene
   * Ensures materials appear vibrant and realistic (never black or washed out)
   * @param {THREE.Scene} scene 
   */
  static setupLighting(scene) {
    // Soft ambient hemisphere light (sky light + ground bounce)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 1.4);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    // Primary directional key light with high-precision soft shadows
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
    keyLight.position.set(5, 12, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.05;
    keyLight.shadow.camera.far = 30;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    // Secondary fill light for soft shadows and edge illumination
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.9);
    fillLight.position.set(-6, 8, -6);
    scene.add(fillLight);

    // Upward bounce light to illuminate under surfaces
    const bounceLight = new THREE.DirectionalLight(0x38bdf8, 0.5);
    bounceLight.position.set(0, -6, 0);
    scene.add(bounceLight);
  }

  /**
   * Create an attractive procedural grid/plane for generator preview
   */
  static createMarkerPreviewPlane(size = 1.0) {
    const group = new THREE.Group();

    // Base dark square representing physical QR card
    const cardGeo = new THREE.PlaneGeometry(size, size);
    const cardMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.15,
      side: THREE.DoubleSide
    });
    const cardMesh = new THREE.Mesh(cardGeo, cardMat);
    cardMesh.rotation.x = -Math.PI / 2;
    cardMesh.receiveShadow = true;
    group.add(cardMesh);

    // Glowing border
    const edges = new THREE.EdgesGeometry(cardGeo);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 });
    const wireframe = new THREE.LineSegments(edges, lineMat);
    wireframe.rotation.x = -Math.PI / 2;
    group.add(wireframe);

    // Sub-grid lines
    const grid = new THREE.GridHelper(size, 10, 0x38bdf8, 0x334155);
    grid.position.y = 0.001;
    group.add(grid);

    return group;
  }

  /**
   * Setup animation mixer and playback actions on target 3D model
   * @param {THREE.Object3D} targetModel - Model root hierarchy
   * @param {Array<THREE.AnimationClip>} animations - Animation clips
   * @returns {{ mixer: THREE.AnimationMixer|null, actions: Array<THREE.AnimationAction> }}
   */
  setupAnimations(targetModel, animations) {
    if (!targetModel || !animations || animations.length === 0) {
      return { mixer: null, actions: [] };
    }

    const mixer = new THREE.AnimationMixer(targetModel);
    const actions = [];

    // Play primary animation (or all non-conflicting animation clips)
    const primaryClip = animations[0];
    const primaryAction = mixer.clipAction(primaryClip);
    primaryAction.reset();
    primaryAction.setEffectiveTimeScale(1.0);
    primaryAction.setEffectiveWeight(1.0);
    primaryAction.setLoop(THREE.LoopRepeat, Infinity);
    primaryAction.clampWhenFinished = false;
    primaryAction.play();
    actions.push(primaryAction);

    // If there are other clips that do not conflict, play them as well
    for (let i = 1; i < animations.length; i++) {
      const clip = animations[i];
      const nameLower = (clip.name || '').toLowerCase();
      const primaryName = (primaryClip.name || '').toLowerCase();

      // Avoid simultaneous Flying & Idle conflict
      const isConflict = (primaryName.includes('fly') && nameLower.includes('idle')) ||
                         (primaryName.includes('run') && nameLower.includes('idle')) ||
                         (primaryName.includes('walk') && nameLower.includes('idle'));
      if (!isConflict) {
        const action = mixer.clipAction(clip);
        action.reset();
        action.setEffectiveTimeScale(1.0);
        action.setEffectiveWeight(1.0);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
        action.play();
        actions.push(action);
      }
    }

    return { mixer, actions };
  }

  /**
   * Activate target 3D model and resume its animation playback
   * @param {THREE.Group} model - Normalized ModelWrapper
   */
  setActiveModel(model) {
    this.currentModel = model;
    if (model && model.userData) {
      this.activeMixer = model.userData.mixer || null;
      this.activeActions = model.userData.actions || [];
      this.activeActions.forEach((action) => {
        action.paused = false;
        action.play();
      });
    } else {
      this.activeMixer = null;
      this.activeActions = [];
    }
  }

  /**
   * Load a GLB model from URL or Blob with caching, animation binding, and progress reporting
   * @param {string} url - Model URL or ObjectURL
   * @param {Function} onProgress - Progress callback: (percentage, loadedMb, totalMb) => {}
   * @param {boolean} isPreload - If true, caches model without hijacking active mixer
   * @returns {Promise<THREE.Group>}
   */
  load(url, onProgress = () => {}, isPreload = false) {
    return new Promise((resolve, reject) => {
      // 1. Instant Cache Check: Instantaneous model switching for multi-scanner sweeping
      if (this.modelCache.has(url)) {
        const cached = this.modelCache.get(url);
        if (!isPreload) {
          this.setActiveModel(cached.model);
        }
        onProgress(100, '', '');
        resolve(cached.model);
        return;
      }

      // 2. Fetch and parse GLB asset
      this.loader.load(
        url,
        (gltf) => {
          this.currentGltf = gltf;
          const rawScene = gltf.scene;

          // Process materials, high-precision textures, double-sided rendering and shadows
          rawScene.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              // Crucial for moving/flapping meshes: prevent bounding-box culling from hiding moving limbs
              child.frustumCulled = false;

              if (child.geometry && !child.geometry.attributes.normal) {
                child.geometry.computeVertexNormals();
              }

              if (child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((mat) => {
                  mat.side = THREE.DoubleSide;
                  mat.depthWrite = true;
                  mat.depthTest = true;
                  if (mat.map) {
                    mat.map.anisotropy = 16;
                    mat.map.colorSpace = THREE.SRGBColorSpace;
                  }
                  if (mat.emissiveMap) {
                    mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
                  }
                });
              }
            }
          });

          // Normalize model directly around rawScene without destructive cloning
          const normalizedWrapper = this.normalizeModel(rawScene);

          // Setup animation playback directly on rawScene
          const { mixer, actions } = this.setupAnimations(rawScene, gltf.animations || []);
          normalizedWrapper.userData.mixer = mixer;
          normalizedWrapper.userData.actions = actions;

          // Store pristine model in cache for zero-latency subsequent scans
          this.modelCache.set(url, {
            model: normalizedWrapper,
            mixer,
            actions
          });

          if (!isPreload) {
            this.setActiveModel(normalizedWrapper);
          }

          resolve(normalizedWrapper);
        },
        (xhr) => {
          if (xhr.lengthComputable && xhr.total > 0) {
            const percent = Math.min(100, Math.round((xhr.loaded / xhr.total) * 100));
            const loadedMb = (xhr.loaded / (1024 * 1024)).toFixed(1);
            const totalMb = (xhr.total / (1024 * 1024)).toFixed(1);
            onProgress(percent, loadedMb, totalMb);
          } else {
            const loadedMb = (xhr.loaded / (1024 * 1024)).toFixed(1);
            onProgress(50, loadedMb, null);
          }
        },
        (error) => {
          console.error("Error loading 3D GLB model:", error);
          reject(new Error("Unable to load GLB model. Please check file format and URL."));
        }
      );
    });
  }

  /**
   * Normalizes the model size to unit bounding box and centers its base at origin (0, 0, 0)
   * using an external pivot group to keep internal bone/mesh animation tracks 100% intact
   * @param {THREE.Object3D} model 
   */
  normalizeModel(model) {
    model.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const targetScale = (maxDim > 0 && isFinite(maxDim)) ? (1.0 / maxDim) : 1.0;

    const center = new THREE.Vector3();
    box.getCenter(center);
    const minY = box.min.y;

    // Create pivot group to apply centering and uniform unit scale without overriding model's local transforms
    const pivot = new THREE.Group();
    pivot.name = "ModelPivot";
    pivot.position.set(-center.x * targetScale, -minY * targetScale, -center.z * targetScale);
    pivot.scale.setScalar(targetScale);
    pivot.add(model);

    // Create wrapper root group
    const wrapper = new THREE.Group();
    wrapper.name = "ModelWrapper";
    wrapper.add(pivot);
    return wrapper;
  }

  /**
   * Update animation mixer per frame
   * @param {number} delta - Delta time in seconds
   */
  update(delta) {
    if (this.activeMixer) {
      // Clamp delta to prevent jerky animation frame jumps on brief system hitches
      const clampedDelta = Math.min(delta, 0.05);
      this.activeMixer.update(clampedDelta);
    }
  }

  /**
   * Stop active animation actions and unbind current model reference
   */
  stopCurrentAnimation() {
    if (this.activeMixer) {
      this.activeMixer.stopAllAction();
      this.activeMixer = null;
    }
    this.activeActions = [];
    this.currentModel = null;
  }

  /**
   * Dispose current model assets safely without corrupting cached templates
   */
  dispose() {
    this.stopCurrentAnimation();
  }
}
