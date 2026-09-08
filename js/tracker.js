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
 * Filter Quaternion using Slerp-based OneEuroFilter
 */
class QuaternionFilter {
  constructor(minCutoff = 1.0, beta = 0.05) {
    this.fqx = new OneEuroFilter(60, minCutoff, beta);
    this.fqy = new OneEuroFilter(60, minCutoff, beta);
    this.fqz = new OneEuroFilter(60, minCutoff, beta);
    this.fqw = new OneEuroFilter(60, minCutoff, beta);
    this.prevQuat = new THREE.Quaternion();
    this.initialized = false;
  }

  filter(quat, time) {
    // Ensure shortest path in quaternion space
    let target = quat.clone();
    if (this.initialized && this.prevQuat.dot(target) < 0) {
      target.x = -target.x;
      target.y = -target.y;
      target.z = -target.z;
      target.w = -target.w;
    }

    const qx = this.fqx.filter(target.x, time);
    const qy = this.fqy.filter(target.y, time);
    const qz = this.fqz.filter(target.z, time);
    const qw = this.fqw.filter(target.w, time);

    const res = new THREE.Quaternion(qx, qy, qz, qw).normalize();
    this.prevQuat.copy(res);
    this.initialized = true;
    return res;
  }

  reset() {
    this.fqx.reset();
    this.fqy.reset();
    this.fqz.reset();
    this.fqw.reset();
    this.initialized = false;
  }
}

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

      // Adaptive dual-zone smoothing:
      // Micro hand tremor (< 2px): heavy low-pass filtering (alpha ~0.10) for rock-solid stability
      // Moving (< 6px): smooth responsive tracking
      // Rapid sweep (> 6px): near-instant response (alpha ~0.95) with zero lag
      let alpha;
      if (dist < 1.8) {
        alpha = 0.10;
      } else if (dist < 6.0) {
        alpha = 0.10 + 0.65 * ((dist - 1.8) / 4.2);
      } else {
        alpha = Math.min(0.98, 0.75 + 0.23 * (1.0 - Math.exp(-(dist - 6.0) / 6.0)));
      }

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
    const v1 = new THREE.Vector3(r1.x, r1.y, r1.z).normalize();
    const dot = r2.dot(v1);
    const v2 = new THREE.Vector3(r2.x - dot * v1.x, r2.y - dot * v1.y, r2.z - dot * v1.z).normalize();
    const v3 = new THREE.Vector3().crossVectors(v1, v2).normalize();

    // Re-verify orthogonality
    v2.crossVectors(v3, v1).normalize();

    return { v1, v2, v3 };
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

    // Column vectors of Homography in normalized camera coordinates
    const h1 = new THREE.Vector3(H[0][0], H[1][0], H[2][0]);
    const h2 = new THREE.Vector3(H[0][1], H[1][1], H[2][1]);
    const h3 = new THREE.Vector3(H[0][2], H[1][2], H[2][2]);

    const l1 = h1.length();
    const l2 = h2.length();
    if (l1 === 0 || l2 === 0) return false;

    // Geometric mean scaling factor for optimal isometric projection
    const lambda = 1.0 / Math.sqrt(l1 * l2);

    // Initial rotation columns
    const r1Raw = h1.clone().multiplyScalar(lambda);
    const r2Raw = h2.clone().multiplyScalar(lambda);
    const tRaw = h3.clone().multiplyScalar(lambda);

    // Ensure object is in front of camera (Z depth > 0)
    if (tRaw.z < 0) {
      r1Raw.negate();
      r2Raw.negate();
      tRaw.negate();
    }

    // Orthonormalize rotation matrix to pure SO(3)
    const { v1, v2, v3 } = this.orthonormalize(r1Raw, r2Raw);

    // Construct 3D pose in Three.js coordinate system
    // OpenCV: +X Right, +Y Down, +Z Forward
    // Three.js: +X Right, +Y Up, +Z Backwards
    // Coordinate conversion: Y_three = -Y_cv, Z_three = -Z_cv
    const rawPos = new THREE.Vector3(tRaw.x, -tRaw.y, -tRaw.z);

    // Rotation matrix in Three.js space
    // We orient the marker such that +Y is the normal out of the physical marker (pointing UP from table)
    // and +Z points toward user, +X points to right of marker
    const m = new THREE.Matrix4();
    m.set(
       v1.x, -v2.x, -v3.x, 0,
      -v1.y,  v2.y,  v3.y, 0,
      -v1.z,  v2.z,  v3.z, 0,
       0,     0,     0,    1
    );

    // Orient marker coordinate system so standing upright models look natural on a flat table
    const rotX = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    m.multiply(rotX);

    const rawQuat = new THREE.Quaternion().setFromRotationMatrix(m);

    // Apply One-Euro filter for smooth, low-jitter motion
    this.currentPosition = this.posFilter.filter(rawPos, timestamp);
    this.currentQuaternion = this.quatFilter.filter(rawQuat, timestamp);

    this.lastDetectedTime = timestamp;
    return true;
  }

  /**
   * Process a video frame with downscale scaling support for instant 60 FPS CV tracking
   * @param {ImageData} imageData - Downscaled or full image data from canvas
   * @param {Function} jsQRFunction - Reference to jsQR library function
   * @param {number} timestamp - Performance timestamp
   * @param {number} scaleX - Horizontal scale factor from scan canvas to full video
   * @param {number} scaleY - Vertical scale factor from scan canvas to full video
   * @param {number} originalWidth - Full camera video width
   * @param {number} originalHeight - Full camera video height
   */
  processFrame(imageData, jsQRFunction, timestamp = performance.now(), scaleX = 1.0, scaleY = 1.0, originalWidth = null, originalHeight = null) {
    if (!imageData || !jsQRFunction) return;

    // When searching or lost, attemptBoth ensures instant lock even under screen glare or dim lighting
    const inversionMode = (this.status === 'searching' || this.status === 'lost') ? "attemptBoth" : "dontInvert";
    let code = jsQRFunction(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: inversionMode
    });

    const imgW = originalWidth || (imageData.width * scaleX);
    const imgH = originalHeight || (imageData.height * scaleY);

    if (code && code.location) {
      // Map detected corners accurately back to full video coordinates
      const corners = {
        topLeft: { x: code.location.topLeftCorner.x * scaleX, y: code.location.topLeftCorner.y * scaleY },
        topRight: { x: code.location.topRightCorner.x * scaleX, y: code.location.topRightCorner.y * scaleY },
        bottomRight: { x: code.location.bottomRightCorner.x * scaleX, y: code.location.bottomRightCorner.y * scaleY },
        bottomLeft: { x: code.location.bottomLeftCorner.x * scaleX, y: code.location.bottomLeftCorner.y * scaleY }
      };

      this.rawCorners = corners;

      // Notify QR URL / data decoded
      if (code.data && code.data !== this.lastDecodedData) {
        this.lastDecodedData = code.data;
        this.onQrDecoded(code.data);
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
        return;
      }
    }

    // Check decay timeout for tracking lost (smooth hysteresis hold)
    if (this.status === 'tracking' || this.status === 'detected') {
      const lostTimeout = AR_CONFIG.cv?.trackingLostTimeoutMs || AR_CONFIG.trackingLostTimeoutMs || 380;
      if (timestamp - this.lastDetectedTime > lostTimeout) {
        this.setStatus('lost');
        this.prevSmoothedCorners = null;
        this.posFilter.reset();
        this.quatFilter.reset();
      }
    }
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
