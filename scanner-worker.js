const mode = new URL(self.location.href).searchParams.get('mode');
let scan;

if (mode === 'aruco') {
  importScripts(
    'https://cdn.jsdelivr.net/gh/jcmellado/js-aruco@master/src/cv.js',
    'https://cdn.jsdelivr.net/gh/jcmellado/js-aruco@master/src/aruco.js'
  );
  const detector = new AR.Detector();
  scan = image => detectMarkers(detector, image);
} else {
  importScripts('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');
  scan = detectQRCodes;
}

function sameSquare(a, b) {
  return a.every((point, i) => Math.hypot(point.x - b[i].x, point.y - b[i].y) < 10);
}

function detectMarkers(detector, image) {
  const markers = detector.detect(image);
  // The same printed marker can produce both an outer and an inner contour.
  markers.sort((a, b) => CV.perimeter(b.corners) - CV.perimeter(a.corners));
  const detections = [];
  for (const { id, corners } of markers) {
    const label = `ArUco ${id}`;
    if (!detections.some(item => item.label === label && sameSquare(item.corners, corners))) {
      detections.push({ corners, label });
    }
  }
  return detections;
}

function coverCode({ data, width, height }, corners) {
  const top = Math.max(0, Math.ceil(Math.min(...corners.map(point => point.y))));
  const bottom = Math.min(height, Math.ceil(Math.max(...corners.map(point => point.y))));

  // Whiten the quadrilateral directly in the RGBA buffer before the next scan.
  for (let y = top; y < bottom; y++) {
    let left = width;
    let right = 0;
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      if ((a.y > y) !== (b.y > y)) {
        const x = a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    const start = Math.max(0, Math.floor(left) - 2);
    const end = Math.min(width, Math.ceil(right) + 2);
    if (start < end) data.fill(255, (y * width + start) * 4, (y * width + end) * 4);
  }
}

function detectQRCodes(image) {
  const detections = [];
  const { data, width, height } = image;
  const options = { inversionAttempts: 'dontInvert' };

  while (true) {
    const code = jsQR(data, width, height, options);
    if (!code?.location) break;
    const loc = code.location;
    const corners = [loc.topLeftCorner, loc.topRightCorner, loc.bottomRightCorner, loc.bottomLeftCorner];
    if (detections.some(item => sameSquare(item.corners, corners))) break;
    detections.push({ corners, label: `QR ${detections.length + 1}`, title: code.data });
    coverCode(image, corners);
  }
  return detections;
}

self.onmessage = ({ data: image }) => {
  const { width, height } = image;
  try {
    self.postMessage({ width, height, detections: scan(image) });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
