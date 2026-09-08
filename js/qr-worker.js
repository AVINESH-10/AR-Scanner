/**
 * High-Performance AR QR Computer Vision Web Worker
 * Offloads heavy jsQR pixel analysis from the main UI thread to a background worker,
 * allowing Three.js WebGL rendering to maintain an uninterrupted, silky-smooth 60/120 FPS.
 */

// Load jsQR library within worker scope
importScripts('libs/jsQR.js');

self.onmessage = function(e) {
  const {
    data,
    width,
    height,
    timestamp,
    scaleX = 1.0,
    scaleY = 1.0,
    originalWidth,
    originalHeight,
    roiOffset = null,
    inversionAttempts = 'dontInvert'
  } = e.data;

  if (!data || !self.jsQR) {
    self.postMessage({ found: false, timestamp, wasRoi: !!roiOffset });
    return;
  }

  const clampedData = new Uint8ClampedArray(data);

  // Pass 1: Standard detection (ultra-fast)
  let code = self.jsQR(clampedData, width, height, {
    inversionAttempts: inversionAttempts
  });

  // Pass 2: Inverted / High contrast attempt (essential for screen glare & dark backgrounds)
  if (!code && inversionAttempts === 'dontInvert') {
    code = self.jsQR(clampedData, width, height, {
      inversionAttempts: 'attemptBoth'
    });
  }

  // Pass 3: Adaptive Contrast Enhancement for oblique camera angles and uneven lighting
  if (!code && width <= 360 && height <= 360) {
    const len = clampedData.length;
    let minL = 255, maxL = 0;
    // Fast step-sampling of luminance to determine dynamic range
    for (let i = 0; i < len; i += 16) {
      const lum = (clampedData[i] * 77 + clampedData[i + 1] * 150 + clampedData[i + 2] * 29) >> 8;
      if (lum < minL) minL = lum;
      if (lum > maxL) maxL = lum;
    }
    const range = maxL - minL;
    if (range > 15 && range < 225) {
      const enhanced = new Uint8ClampedArray(len);
      const scale = 255.0 / range;
      for (let i = 0; i < len; i += 4) {
        enhanced[i]     = Math.min(255, Math.max(0, ((clampedData[i]     - minL) * scale)));
        enhanced[i + 1] = Math.min(255, Math.max(0, ((clampedData[i + 1] - minL) * scale)));
        enhanced[i + 2] = Math.min(255, Math.max(0, ((clampedData[i + 2] - minL) * scale)));
        enhanced[i + 3] = 255;
      }
      code = self.jsQR(enhanced, width, height, { inversionAttempts: 'dontInvert' });
    }
  }

  if (code && code.location) {
    const ox = roiOffset ? roiOffset.x : 0;
    const oy = roiOffset ? roiOffset.y : 0;

    const corners = {
      topLeft: {
        x: (code.location.topLeftCorner.x * scaleX) + ox,
        y: (code.location.topLeftCorner.y * scaleY) + oy
      },
      topRight: {
        x: (code.location.topRightCorner.x * scaleX) + ox,
        y: (code.location.topRightCorner.y * scaleY) + oy
      },
      bottomRight: {
        x: (code.location.bottomRightCorner.x * scaleX) + ox,
        y: (code.location.bottomRightCorner.y * scaleY) + oy
      },
      bottomLeft: {
        x: (code.location.bottomLeftCorner.x * scaleX) + ox,
        y: (code.location.bottomLeftCorner.y * scaleY) + oy
      }
    };

    self.postMessage({
      found: true,
      data: code.data,
      corners: corners,
      originalWidth: originalWidth,
      originalHeight: originalHeight,
      timestamp: timestamp,
      wasRoi: !!roiOffset
    });
  } else {
    self.postMessage({
      found: false,
      timestamp: timestamp,
      wasRoi: !!roiOffset
    });
  }
};

