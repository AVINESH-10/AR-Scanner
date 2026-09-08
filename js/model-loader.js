/**
 * Three.js GLB/GLTF 3D Model Manager
 * Handles asynchronous model loading, progress tracking, automatic bounding-box normalization,
 * PBR material enhancement, animation playback, and scene lighting.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export class ModelLoader {
  constructor() {
    this.loader = new GLTFLoader();
    this.currentModel = null;
    this.currentGltf = null;
    this.mixer = null;
    this.animations = [];
    this.activeActions = [];
    this.modelCache = new Map(); // url -> { scene, animations }
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
   * Load a GLB model from URL or Blob with caching, animation binding, and progress reporting
   * @param {string} url - Model URL or ObjectURL
   * @param {Function} onProgress - Progress callback: (percentage, loadedMb, totalMb) => {}
   * @returns {Promise<THREE.Group>}
   */
  load(url, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
      // 1. Instant Cache Check: Instantaneous model switching for multi-scanner sweeping
      if (this.modelCache.has(url)) {
        const cached = this.modelCache.get(url);
        // Use SkeletonUtils to cleanly clone skinned meshes, bones, and hierarchies
        const clonedModel = SkeletonUtils.clone ? SkeletonUtils.clone(cached.scene) : cached.scene.clone(true);

        if (cached.animations && cached.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(clonedModel);
          this.animations = cached.animations;
          this.activeActions = [];
          cached.animations.forEach((clip) => {
            const action = this.mixer.clipAction(clip);
            action.reset();
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.clampWhenFinished = false;
            action.play();
            this.activeActions.push(action);
          });
        } else {
          this.mixer = null;
          this.animations = [];
          this.activeActions = [];
        }

        this.currentModel = clonedModel;
        onProgress(100, '', '');
        resolve(clonedModel);
        return;
      }

      // 2. Fetch and parse GLB asset
      this.loader.load(
        url,
        (gltf) => {
          this.currentGltf = gltf;
          const rawScene = gltf.scene;

          // Process materials, high-precision textures and shadows
          rawScene.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;

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

          // Normalize model size and center bounding box precisely at bottom center (Y=0)
          const normalizedWrapper = this.normalizeModel(rawScene);

          // Store template in cache for zero-latency subsequent scans
          this.modelCache.set(url, {
            scene: normalizedWrapper.clone(true),
            animations: gltf.animations || []
          });

          // Setup animation playback for all animation tracks
          if (gltf.animations && gltf.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(normalizedWrapper);
            this.animations = gltf.animations;
            this.activeActions = [];
            gltf.animations.forEach((clip) => {
              const action = this.mixer.clipAction(clip);
              action.reset();
              action.setLoop(THREE.LoopRepeat, Infinity);
              action.clampWhenFinished = false;
              action.play();
              this.activeActions.push(action);
            });
          } else {
            this.mixer = null;
            this.animations = [];
            this.activeActions = [];
          }

          this.currentModel = normalizedWrapper;
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
   * with exact mathematical precision across complex mesh hierarchies
   * @param {THREE.Object3D} model 
   */
  normalizeModel(model) {
    model.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0 && isFinite(maxDim)) {
      const targetScale = 1.0 / maxDim;
      model.scale.setScalar(targetScale);
      model.updateMatrixWorld(true);
    }

    // Recompute box with accurate transformed bounds
    const normalizedBox = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    normalizedBox.getCenter(center);

    // Center X and Z precisely at 0, and align model base at Y = 0
    model.position.x -= center.x;
    model.position.y -= normalizedBox.min.y;
    model.position.z -= center.z;
    model.updateMatrixWorld(true);

    // Wrap in a parent group so position offset stays clean
    const wrapper = new THREE.Group();
    wrapper.add(model);
    return wrapper;
  }

  /**
   * Update animation mixer per frame
   * @param {number} delta - Delta time in seconds
   */
  update(delta) {
    if (this.mixer) {
      this.mixer.update(delta);
    }
  }

  /**
   * Stop active animation actions and unbind current model reference
   */
  stopCurrentAnimation() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.currentModel = null;
  }

  /**
   * Dispose current model assets
   */
  dispose() {
    this.stopCurrentAnimation();
    if (this.currentModel) {
      this.currentModel.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
      this.currentModel = null;
    }
  }
}
