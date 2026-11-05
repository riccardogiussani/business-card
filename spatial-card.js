const radians = Math.PI / 180;
const cardRiseCm = 4;
const cardWidthCm = 9;

export function cameraUpVector(betaDegrees, gammaDegrees, screenAngle, facing) {
  const beta = betaDegrees * radians;
  const gamma = gammaDegrees * radians;
  const angle = screenAngle * radians;

  // World up in the device's natural axes, from the Z-X-Y orientation angles.
  const deviceX = -Math.cos(beta) * Math.sin(gamma);
  const deviceY = Math.sin(beta);
  const deviceZ = Math.cos(beta) * Math.cos(gamma);
  const screenX = deviceX * Math.cos(angle) - deviceY * Math.sin(angle);
  const screenY = deviceX * Math.sin(angle) + deviceY * Math.cos(angle);

  // Camera coordinates have Y down and Z into the scene. The front camera
  // faces the opposite direction and its unmirrored image reverses X as well.
  return facing === 'user' ? [-screenX, -screenY, deviceZ] : [screenX, -screenY, -deviceZ];
}

function squareToQuad([topLeft, topRight, bottomRight, bottomLeft]) {
  const dx1 = topRight.x - bottomRight.x;
  const dx2 = bottomLeft.x - bottomRight.x;
  const dx3 = topLeft.x - topRight.x + bottomRight.x - bottomLeft.x;
  const dy1 = topRight.y - bottomRight.y;
  const dy2 = bottomLeft.y - bottomRight.y;
  const dy3 = topLeft.y - topRight.y + bottomRight.y - bottomLeft.y;
  const determinant = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(determinant) < 1e-8) return null;

  // Unit-square homography. Divide both output coordinates by g*u + h*v + 1.
  const g = (dx3 * dy2 - dx2 * dy3) / determinant;
  const h = (dx1 * dy3 - dx3 * dy1) / determinant;
  return {
    a: topRight.x * (1 + g) - topLeft.x,
    b: topRight.y * (1 + g) - topLeft.y,
    c: bottomLeft.x * (1 + h) - topLeft.x,
    d: bottomLeft.y * (1 + h) - topLeft.y,
    e: topLeft.x, f: topLeft.y, g, h
  };
}

function squareCenter(corners, sideCm, focal, cx, cy) {
  const normalized = corners.map(({ x, y }) => ({ x: (x - cx) / focal, y: (y - cy) / focal }));
  const plane = squareToQuad(normalized);
  if (!plane) return null;

  // In camera coordinates the first two homography columns describe the
  // square's sides. Its printed size resolves the translation scale.
  const { a, b, c, d, e, f, g, h } = plane;
  const scale = 2 * sideCm / (Math.hypot(a, b, g) + Math.hypot(c, d, h));
  return [e + (a + c) / 2, f + (b + d) / 2, 1 + (g + h) / 2].map(value => value * scale);
}

export function verticalCardTransform(corners, { sideCm, up, focal, cx, cy, width, height }) {
  const center = squareCenter(corners, sideCm, focal, cx, cy);
  if (!center || !width || !height) return null;
  const bottom = center.map((value, i) => value + up[i] * cardRiseCm);
  const [ux, uy, uz] = up;
  const [x, y, z] = bottom;
  // Cross world up with the direction toward the camera. The resulting
  // horizontal edge makes the card face the camera while staying vertical.
  const right = [uz * y - uy * z, ux * z - uz * x, uy * x - ux * y];
  const horizontalLength = Math.hypot(...right);
  if (horizontalLength < Math.hypot(...bottom) * 0.001) return null;

  const halfWidth = right.map(value => value * cardWidthCm / (2 * horizontalLength));
  const heightCm = cardWidthCm * height / width;
  const top = bottom.map((value, i) => value + up[i] * heightCm);
  const vertices = [
    top.map((value, i) => value - halfWidth[i]),
    top.map((value, i) => value + halfWidth[i]),
    bottom.map((value, i) => value + halfWidth[i]),
    bottom.map((value, i) => value - halfWidth[i])
  ];
  if (vertices.some(point => point[2] <= 0.1 || !point.every(Number.isFinite))) return null;

  const screenCorners = vertices.map(([px, py, depth]) => ({
    x: cx + focal * px / depth,
    y: cy + focal * py / depth
  }));
  const projection = squareToQuad(screenCorners);
  if (!projection) return null;
  const { a, b, c, d, e, f, g, h } = projection;
  return `matrix3d(${a / width}, ${b / width}, 0, ${g / width}, ${c / height}, ${d / height}, 0, ${h / height}, 0, 0, 1, 0, ${e}, ${f}, 0, 1)`;
}
