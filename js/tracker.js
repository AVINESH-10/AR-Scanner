/**
 * 6DOF AR Marker Tracking Engine
 * Calculates real-time 6 Degrees-of-Freedom (Position + 3D Rotation)
 * from QR Code physical marker corners using Coplanar Perspective-n-Point /
 * Homography Pose Decomposition and One-Euro jitter-reduction filtering.
 */

import * as THREE from 'three';
import { AR_CONFIG } from './config.js';

/**
 * Low-pass 1-Euro Filter for jitter-free AR tracking
 */
class OneEuroFilter {
  constructor(freq, minCutoff = 1.0, beta = 0.05, dCutoff = 1.0) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  alpha(cutoff, dt) {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(x, timestamp = performance.now()) {
    if (this.tPrev === null) {
      this.tPrev = timestamp;
      this.xPrev = x;
      this.dxPrev = 0;
      return x;
    }

    const dt = Math.max((timestamp - this.tPrev) / 1000.0, 1e-4);
    this.tPrev = timestamp;

    const dx = (x - this.xPrev) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1.0 - aD) * this.dxPrev;
    this.dxPrev = dxHat;

    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = this.alpha(cutoff, dt);
    const xHat = a * x + (1.0 - a) * this.xPrev;
    this.xPrev = xHat;

    return xHat;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
}

/**
 * Filter 3D Vector using OneEuroFilter
 */
class Vector3Filter {
  constructor(minCutoff = 1.0, beta = 0.05) {
    this.fx = new OneEuroFilter(60, minCutoff, beta);
    this.fy = new OneEuroFilter(60, minCutoff, beta);
    this.fz = new OneEuroFilter(60, minCutoff, beta);
  }

  filter(vec, time) {
    return new THREE.Vector3(
      this.fx.filter(vec.x, time),
      this.fy.filter(vec.y, time),
      this.fz.filter(vec.z, time)
    );
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
  }
}

/**
 * Geodesic Slerp-based Quaternion Filter on SO(3)
 * Eliminates orientation distortion, tilt wobble, and gimbal jitter at all camera angles
 */
class QuaternionFilter {
  constructor(minCutoff = 0.50, beta = 0.15) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.prevQuat = new THREE.Quaternion();
    this.initialized = false;
    this.tPrev = null;
    this.angularVelocity = 0;
  }

  filter(quat, time) {
    if (!this.initialized || !this.tPrev) {
      this.prevQuat.copy(quat).normalize();
      this.initialized = true;
      this.tPrev = time;
      return this.prevQuat.clone();
    }

    const dt = Math.max(0.001, (time - this.tPrev) / 1000.0);
    this.tPrev = time;

    // Ensure shortest path in quaternion space
    let target = quat.clone().normalize();
    let dot = this.prevQuat.dot(target);
    if (dot < 0) {
      target.x = -target.x;
      target.y = -target.y;
      target.z = -target.z;
      target.w = -target.w;
      dot = -dot;
    }

    // Geodesic angular distance on 3D sphere
    dot = Math.min(1.0, Math.max(-1.0, dot));
    const angle = 2.0 * Math.acos(dot); // radians
    const instantaneousVelocity = angle / dt; // rad/s

    // Low-pass filtered angular velocity
    this.angularVelocity = 0.8 * this.angularVelocity + 0.2 * instantaneousVelocity;

    // Adaptive cutoff: when camera is still/shaking gently -> strong damping; when moving -> zero lag
    const cutoff = this.minCutoff + this.beta * this.angularVelocity;
    const alpha = Math.min(1.0, Math.max(0.08, 1.0 - Math.exp(-cutoff * dt * 2.0 * Math.PI)));

    this.prevQuat.slerp(target, alpha).normalize();
    return this.prevQuat.clone();
  }

  reset() {
    this.initialized = false;
    this.tPrev = null;
    this.angularVelocity = 0;
  }
}

// Pre-allocated scratch instances to eliminate GC overhead in 60/120 FPS render loops
const _h1 = new THREE.Vector3();
const _h2 = new THREE.Vector3();
const _h3 = new THREE.Vector3();
const _r1Raw = new THREE.Vector3();
const _r2Raw = new THREE.Vector3();
const _tRaw = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _rawPos = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _rotX = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
const _rawQuat = new THREE.Quaternion();

/**
 * Main 6DOF AR Tracker
 */
export class ARTracker {
  constructor(options = {}) {
    this.markerSize = options.markerSize || AR_CONFIG.markerSize;
    this.cameraFov = options.cameraFov || AR_CONFIG.cameraFov;
    
    // Status callbacks
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onPoseUpdate = options.onPoseUpdate || (() => {});
    this.onQrDecoded = options.onQrDecoded || (() => {});

    // State
    this.status = 'searching'; // searching | detected | tracking | lost
    this.lastDetectedTime = 0;
    this.lastDecodedData = null;
    this.rawCorners = null;

    // Filters for smooth 6DOF
    this.posFilter = new Vector3Filter(AR_CONFIG.filter.minCutoff, AR_CONFIG.filter.beta);
    this.quatFilter = new QuaternionFilter(AR_CONFIG.filter.minCutoff, AR_CONFIG.filter.beta);

    // Reusable Math objects
    this.targetPosition = new THREE.Vector3();
    this.targetQuaternion = new THREE.Quaternion();
    this.currentPosition = new THREE.Vector3();
    this.currentQuaternion = new THREE.Quaternion();
    this.tempMatrix = new THREE.Matrix4();
    this.rotMatrix = new THREE.Matrix4();
    this.prevSmoothedCorners = null;
  }

  /**
   * Set status with notification trigger
   */
  setStatus(newStatus) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.onStatusChange(this.status);
    }
  }

  /**
   * Subpixel corner stabilization with continuous adaptive smoothing
   * Eliminates pixel discretization noise, hand-shaking jitter and micro-tremor without lag
   */
  stabilizeCorners(corners) {
    if (!this.prevSmoothedCorners) {
      this.prevSmoothedCorners = {
        topLeft: { ...corners.topLeft },
        topRight: { ...corners.topRight },
        bottomRight: { ...corners.bottomRight },
        bottomLeft: { ...corners.bottomLeft }
      };
      return corners;
    }

    const keys = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
    const smoothed = {};

    for (const key of keys) {
      const cur = corners[key];
      const prev = this.prevSmoothedCorners[key];
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      const dist = Math.hypot(dx, dy);

      // Continuous exponential sigmoid smoothing:
      // Stationary / micro-shake (< 1.5px): alpha ~ 0.12 (rock-solid hold, no tremor)
      // Natural motion (2px - 6px): smooth responsive tracking
      // Fast camera motion (> 8px): near-instant alpha ~ 0.95 (zero lag)
      const alpha = Math.min(0.98, Math.max(0.12, 1.0 - Math.exp(-dist / 3.2)));

      smoothed[key] = {
        x: prev.x + dx * alpha,
        y: prev.y + dy * alpha
      };
    }

    this.prevSmoothedCorners = smoothed;
    return smoothed;
  }

  /**
   * Solve 3x3 Homography from 4 planar marker points to normalized camera coordinates
   */
  computeHomography(srcPts, dstPts) {
    // 8x8 Linear system A * h = b
    const A = [];
    const b = [];

    for (let i = 0; i < 4; i++) {
      const x = srcPts[i].x;
      const y = srcPts[i].y;
      const u = dstPts[i].x;
      const v = dstPts[i].y;

      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
      b.push(u);

      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
      b.push(v);
    }

    // Solve via Gaussian Elimination
    const h = this.solveGaussian(A, b);
    if (!h) return null;

    return [
      [h[0], h[1], h[2]],
      [h[3], h[4], h[5]],
      [h[6], h[7], 1.0]
    ];
  }

  /**
   * Gaussian elimination solver for Ax = b
   */
  solveGaussian(A, b) {
    const n = b.length;
    const M = [];
    for (let i = 0; i < n; i++) {
      M.push([...A[i], b[i]]);
    }

    for (let p = 0; p < n; p++) {
      // Find pivot
      let max = p;
      for (let i = p + 1; i < n; i++) {
        if (Math.abs(M[i][p]) > Math.abs(M[max][p])) max = i;
      }
      const temp = M[p];
      M[p] = M[max];
      M[max] = temp;

      if (Math.abs(M[p][p]) <= 1e-10) return null;

      for (let i = p + 1; i < n; i++) {
        const alpha = M[i][p] / M[p][p];
        for (let j = p; j <= n; j++) {
          M[i][j] -= alpha * M[p][j];
        }
      }
    }

    // Back-substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let sum = 0.0;
      for (let j = i + 1; j < n; j++) {
        sum += M[i][j] * x[j];
      }
      x[i] = (M[i][n] - sum) / M[i][i];
    }
    return x;
  }

  /**
   * Gram-Schmidt Orthonormalization for 3x3 rotation matrix to ensure strict SO(3)
   */
  orthonormalize(r1, r2) {
    _v1.set(r1.x, r1.y, r1.z).normalize();
    const dot = r2.dot(_v1);
    _v2.set(r2.x - dot * _v1.x, r2.y - dot * _v1.y, r2.z - dot * _v1.z).normalize();
    _v3.crossVectors(_v1, _v2).normalize();

    // Re-verify orthogonality
    _v2.crossVectors(_v3, _v1).normalize();

    return { v1: _v1, v2: _v2, v3: _v3 };
  }

  /**
   * Calculate 6DOF Pose Matrix from detected 4 corners
   * @param {Object} corners - { topLeft, topRight, bottomRight, bottomLeft }
   * @param {number} imgWidth - Video/Canvas width
   * @param {number} imgHeight - Video/Canvas height
   * @param {number} timestamp - Performance timestamp
   */
  estimatePose(corners, imgWidth, imgHeight, timestamp) {
    const half = this.markerSize / 2.0;

    // Stabilize corners to reduce micro-jitter
    const stableCorners = this.stabilizeCorners(corners);

    // Physical marker planar coordinates centered at (0,0,0)
    // Ordered: Top-Left, Top-Right, Bottom-Right, Bottom-Left
    const srcPts = [
      { x: -half, y: half },
      { x: half, y: half },
      { x: half, y: -half },
      { x: -half, y: -half }
    ];

    // Normalized camera plane coordinates
    // Compute focal length from assumed/specified FOV
    const fovRad = (this.cameraFov * Math.PI) / 180.0;
    const fy = (imgHeight / 2.0) / Math.tan(fovRad / 2.0);
    const fx = fy; // Assume square pixels
    const cx = imgWidth / 2.0;
    const cy = imgHeight / 2.0;

    const dstPts = [
      { x: (stableCorners.topLeft.x - cx) / fx, y: (stableCorners.topLeft.y - cy) / fy },
      { x: (stableCorners.topRight.x - cx) / fx, y: (stableCorners.topRight.y - cy) / fy },
      { x: (stableCorners.bottomRight.x - cx) / fx, y: (stableCorners.bottomRight.y - cy) / fy },
      { x: (stableCorners.bottomLeft.x - cx) / fx, y: (stableCorners.bottomLeft.y - cy) / fy }
    ];

    const H = this.computeHomography(srcPts, dstPts);
    if (!H) return false;

    // Column vectors of Homography in normalized camera coordinates (reusing scratch objects to avoid GC pressure)
    _h1.set(H[0][0], H[1][0], H[2][0]);
    _h2.set(H[0][1], H[1][1], H[2][1]);
    _h3.set(H[0][2], H[1][2], H[2][2]);

    const l1 = _h1.length();
    const l2 = _h2.length();
    if (l1 === 0 || l2 === 0) return false;

    // Geometric mean scaling factor for optimal isometric projection
    const lambda = 1.0 / Math.sqrt(l1 * l2);

    // Initial rotation columns
    _r1Raw.copy(_h1).multiplyScalar(lambda);
    _r2Raw.copy(_h2).multiplyScalar(lambda);
    _tRaw.copy(_h3).multiplyScalar(lambda);

    // Ensure object is in front of camera (Z depth > 0)
    if (_tRaw.z < 0) {
      _r1Raw.negate();
      _r2Raw.negate();
      _tRaw.negate();
    }

    // Orthonormalize rotation matrix to pure SO(3)
    const { v1, v2, v3 } = this.orthonormalize(_r1Raw, _r2Raw);

    // Construct 3D pose in Three.js coordinate system
    _rawPos.set(_tRaw.x, -_tRaw.y, -_tRaw.z);

    // Rotation matrix in Three.js space
    _mat4.set(
       v1.x, -v2.x, -v3.x, 0,
      -v1.y,  v2.y,  v3.y, 0,
      -v1.z,  v2.z,  v3.z, 0,
       0,     0,     0,    1
    );

    // Orient marker coordinate system so standing upright models look natural on a flat table
    _mat4.multiply(_rotX);

    _rawQuat.setFromRotationMatrix(_mat4);

    // Apply One-Euro filter for smooth, low-jitter motion
    this.currentPosition = this.posFilter.filter(_rawPos, timestamp);
    this.currentQuaternion = this.quatFilter.filter(_rawQuat, timestamp);

    this.lastDetectedTime = timestamp;
    return true;
  }

  /**
   * Universal corner handler for both main-thread and Web Worker CV results
   */
  handleDetectedCorners(corners, qrData, imgW, imgH, timestamp) {
    this.rawCorners = corners;

    // Notify QR URL / data decoded
    if (qrData && qrData !== this.lastDecodedData) {
      this.lastDecodedData = qrData;
      this.onQrDecoded(qrData);
    }

    // Compute 6DOF pose in full video coordinate space
    const success = this.estimatePose(corners, imgW, imgH, timestamp);

    if (success) {
      if (this.status === 'searching' || this.status === 'lost') {
        this.setStatus('detected');
        setTimeout(() => {
          if (this.status === 'detected') this.setStatus('tracking');
        }, 150);
      } else {
        this.setStatus('tracking');
      }

      this.onPoseUpdate({
        position: this.currentPosition,
        quaternion: this.currentQuaternion,
        corners: this.rawCorners,
        timestamp
      });
      return true;
    }
    return false;
  }

  /**
   * Check decay timeout for tracking lost (smooth hysteresis hold)
   */
  checkDecayTimeout(timestamp = performance.now()) {
    if (this.status === 'tracking' || this.status === 'detected') {
      const lostTimeout = AR_CONFIG.cv?.trackingLostTimeoutMs || AR_CONFIG.trackingLostTimeoutMs || 1500;
      if (timestamp - this.lastDetectedTime > lostTimeout) {
        this.setStatus('lost');
        this.prevSmoothedCorners = null;
        this.posFilter.reset();
        this.quatFilter.reset();
      }
    }
  }

  /**
   * Process results received asynchronously from the background QR Web Worker
   */
  processWorkerResult(msg) {
    if (!msg) return;
    if (msg.found && msg.corners) {
      this.handleDetectedCorners(msg.corners, msg.data, msg.originalWidth, msg.originalHeight, msg.timestamp);
    } else {
      this.checkDecayTimeout(msg.timestamp);
    }
  }

  /**
   * Process a video frame synchronously (fallback when Web Worker is unavailable)
   */
  processFrame(imageData, jsQRFunction, timestamp = performance.now(), scaleX = 1.0, scaleY = 1.0, originalWidth = null, originalHeight = null, roiOffset = null) {
    if (!imageData || !jsQRFunction) return;

    // When searching or lost, attemptBoth ensures instant lock even under screen glare or dim lighting
    const inversionMode = (this.status === 'searching' || this.status === 'lost') ? "attemptBoth" : "dontInvert";
    let code = jsQRFunction(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: inversionMode
    });

    const imgW = originalWidth || (imageData.width * scaleX);
    const imgH = originalHeight || (imageData.height * scaleY);
    const ox = roiOffset ? roiOffset.x : 0;
    const oy = roiOffset ? roiOffset.y : 0;

    if (code && code.location) {
      // Map detected corners accurately back to full video coordinates
      const corners = {
        topLeft: { x: (code.location.topLeftCorner.x * scaleX) + ox, y: (code.location.topLeftCorner.y * scaleY) + oy },
        topRight: { x: (code.location.topRightCorner.x * scaleX) + ox, y: (code.location.topRightCorner.y * scaleY) + oy },
        bottomRight: { x: (code.location.bottomRightCorner.x * scaleX) + ox, y: (code.location.bottomRightCorner.y * scaleY) + oy },
        bottomLeft: { x: (code.location.bottomLeftCorner.x * scaleX) + ox, y: (code.location.bottomLeftCorner.y * scaleY) + oy }
      };

      this.handleDetectedCorners(corners, code.data, imgW, imgH, timestamp);
      return;
    }

    this.checkDecayTimeout(timestamp);
  }

  /**
   * Reset tracker state
   */
  reset() {
    this.status = 'searching';
    this.lastDetectedTime = 0;
    this.lastDecodedData = null;
    this.rawCorners = null;
    this.prevSmoothedCorners = null;
    this.posFilter.reset();
    this.quatFilter.reset();
    this.setStatus('searching');
  }
}
