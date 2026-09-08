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
  const code = self.jsQR(clampedData, width, height, {
    inversionAttempts: inversionAttempts
  });

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
