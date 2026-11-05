import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const transferSeconds = 2.8;
const releaseSeconds = 1.82;
const partY = 1.06;
const pickX = -4.4;
const dropX = 4.4;
const sensorX = 6;
const exitX = 7.35;
const path = [
  [0, pickX, 3.15], [.38, pickX, partY + .62], [.58, pickX, partY + .62],
  [.88, pickX, 3.25], [1.34, dropX, 3.25], [1.66, dropX, partY + .62],
  [releaseSeconds, dropX, partY + .62], [2.08, dropX, 3.15], [transferSeconds, pickX, 3.15]
];

function wristAt(time, point) {
  let next = 1;
  while (next < path.length - 1 && path[next][0] < time) next++;
  const [start, x0, y0] = path[next - 1];
  const [end, x1, y1] = path[next];
  const fraction = THREE.MathUtils.clamp((time - start) / (end - start), 0, 1);
  const eased = fraction * fraction * (3 - 2 * fraction);
  point.set(THREE.MathUtils.lerp(x0, x1, eased), THREE.MathUtils.lerp(y0, y1, eased), .18);
}

function buildCell(root) {
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(.5, .5, 1, 18);
  const ballGeometry = new THREE.SphereGeometry(.5, 12, 8);
  const paint = color => new THREE.MeshStandardMaterial({ color, roughness: .58 });
  const steel = paint(0x9cacc0);
  const frame = paint(0x273747);
  const belt = paint(0x121d2b);
  const stripe = paint(0x5f748a);
  const orange = paint(0xffa335);
  const mint = paint(0x58eed3);
  const white = paint(0xf6fafb);

  function mesh(geometry, material, x, y, z, width, height, depth, parent = root) {
    const result = new THREE.Mesh(geometry, material);
    result.position.set(x, y, z);
    result.scale.set(width, height, depth);
    parent.add(result);
    return result;
  }
  const box = (material, x, y, z, w, h, d, parent) => mesh(boxGeometry, material, x, y, z, w, h, d, parent);

  box(frame, 0, -.22, 0, 15.35, .44, 5.3);
  box(stripe, 0, -.05, 0, 15.45, .09, 5.38);
  box(mint, 0, -.2, 2.69, 11.8, .07, .02);

  const rollers = new THREE.InstancedMesh(boxGeometry, stripe, 18);
  const stripMatrix = new THREE.Matrix4();
  const stripScale = new THREE.Matrix4().makeScale(.065, .035, 1.7);
  const beltCenters = [-4.8, 4.8];
  root.add(rollers);
  beltCenters.forEach(x => {
    box(steel, x, .34, .18, 5.25, .68, 2.15);
    box(belt, x, .67, .18, 5.05, .17, 1.86);
    for (const z of [-.86, 1.22]) box(frame, x, .76, z, 5.28, .24, .13);
  });

  const turret = new THREE.Group();
  turret.position.set(0, 0, -1.42);
  root.add(turret);
  mesh(cylinderGeometry, frame, 0, .25, 0, 2.25, .5, 2.25, turret);
  mesh(cylinderGeometry, orange, 0, .63, 0, 1.7, .43, 1.7, turret);
  box(steel, 0, 1.28, 0, 1.15, 1.35, 1.05, turret);
  box(mint, 0, 1.26, .54, .56, .14, .04, turret);
  const shoulder = new THREE.Vector3(0, 2.05, -1.42);
  mesh(ballGeometry, orange, ...shoulder.toArray(), 1.32, 1.32, 1.32);
  const elbow = mesh(ballGeometry, frame, 0, 0, 0, .95, .95, .95);
  const upper = box(orange, 0, 0, 0, .74, 1, .72);
  const lower = box(steel, 0, 0, 0, .57, 1, .56);
  const gripper = new THREE.Group();
  root.add(gripper);
  box(frame, 0, 0, 0, .93, .32, .8, gripper);
  const jaws = [-1, 1].map(side => box(steel, side * .46, -.36, 0, .16, .48, .45, gripper));
  const part = new THREE.Group();
  root.add(part);
  box(mint, 0, 0, 0, .93, .57, .85, part);
  box(white, 0, .29, 0, .62, .025, .54, part);

  const beamMaterial = new THREE.MeshBasicMaterial({ color: 0x58eed3 });
  for (const z of [-.95, 1.31]) {
    box(frame, sensorX, 1.02, z, .35, .7, .27);
    box(beamMaterial, sensorX, 1.21, z, .17, .17, .28);
  }
  const beam = box(beamMaterial, sensorX, 1.2, .18, .035, .035, 2.25);
  const warningLight = mesh(ballGeometry, beamMaterial, 0, 1.03, -2.38, .36, .4, .36);
  const vertical = new THREE.Vector3(0, 1, 0);
  const wrist = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const bend = new THREE.Vector3();
  const link = new THREE.Vector3();

  function aim(segment, start, end) {
    segment.position.copy(start).lerp(end, .5);
    link.subVectors(end, start);
    segment.scale.y = link.length();
    segment.quaternion.setFromUnitVectors(vertical, link.normalize());
  }

  function update({ cycle, beltTime, exitProgress, jammed, blocked }) {
    wristAt(cycle, wrist);
    const gripping = cycle >= .58 && cycle < releaseSeconds;
    turret.rotation.y = Math.atan2(wrist.x, wrist.z - shoulder.z);
    direction.subVectors(wrist, shoulder);
    const halfReach = direction.length() / 2;
    direction.normalize();
    bend.copy(vertical).addScaledVector(direction, -direction.y).normalize();
    // Equal-length links meet at the upper solution of a two-link chain.
    elbow.position.copy(shoulder).addScaledVector(direction, halfReach)
      .addScaledVector(bend, Math.sqrt(Math.max(0, 2.95 ** 2 - halfReach ** 2)));
    aim(upper, shoulder, elbow.position);
    aim(lower, elbow.position, wrist);
    gripper.position.copy(wrist);
    jaws.forEach((jaw, i) => { jaw.position.x = (i ? 1 : -1) * (gripping ? .38 : .55); });

    part.visible = exitProgress < 1;
    if (gripping) part.position.copy(wrist).y -= .62;
    else part.position.set(cycle < releaseSeconds ? pickX : THREE.MathUtils.lerp(dropX, exitX, exitProgress), partY, .18);
    beam.visible = !blocked;
    beamMaterial.color.setHex(blocked ? 0xff9f32 : 0x58eed3);
    warningLight.scale.y = jammed ? .65 : .36;
    beltCenters.forEach((x, beltIndex) => {
      for (let i = 0; i < 9; i++) {
        const offset = (i * .54 + beltTime * 1.55) % 4.86;
        stripMatrix.makeTranslation(x - 2.43 + offset, .76, .18).multiply(stripScale);
        rollers.setMatrixAt(beltIndex * 9 + i, stripMatrix);
      }
    });
    rollers.instanceMatrix.needsUpdate = true;
  }

  return update;
}

export function createRobotCell(layer) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  layer.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 1500);
  scene.add(root, new THREE.HemisphereLight(0xf0f7ff, 0x8393a3, 2.1));
  const key = new THREE.DirectionalLight(0xfff3dc, 2.6);
  key.position.set(-2, 5, 5);
  scene.add(key);
  const updateCell = buildCell(root);
  const unlock = layer.querySelector('#cellUnlock');
  const contact = layer.querySelector('#cellContact');
  const exitWarning = layer.querySelector('#cellExitWarning');
  const cycleWarning = layer.querySelector('#cellCycleWarning');
  const count = layer.querySelector('#cellCount');
  const timer = layer.querySelector('#cellTimer');

  const up = new THREE.Vector3();
  const front = new THREE.Vector3();
  const right = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const screenPoint = new THREE.Vector3();
  let elapsed = 0;
  let recoveryAt;
  let lastFrame;
  let complete = false;
  let previousWidth;
  let previousHeight;
  let previousFocal;

  unlock.addEventListener('click', () => {
    if (!layer.hidden && !unlock.hidden && recoveryAt === undefined) recoveryAt = elapsed;
  });
  contact.addEventListener('click', () => { complete = true; });

  function pause() {
    lastFrame = undefined;
    layer.hidden = true;
  }

  function reset() {
    pause();
    elapsed = 0;
    recoveryAt = undefined;
    complete = false;
  }

  function placeLabel(element, x, y, z, width, height) {
    screenPoint.set(x, y, z);
    root.localToWorld(screenPoint).project(camera);
    const left = (screenPoint.x + 1) * width / 2;
    const top = (1 - screenPoint.y) * height / 2;
    element.style.left = `${THREE.MathUtils.clamp(left, 72, Math.max(72, width - 72))}px`;
    element.style.top = `${THREE.MathUtils.clamp(top, 48, Math.max(48, height - 75))}px`;
  }

  function render(now, { center, worldUp, width, height, focal }) {
    if (complete || renderer.getContext().isContextLost() || !center.every(Number.isFinite) || center[2] <= 0) {
      pause();
      return false;
    }
    if (lastFrame !== undefined) elapsed += Math.min(.15, Math.max(0, now - lastFrame) / 1000);
    lastFrame = now;
    const secondCycle = elapsed >= transferSeconds;
    const jamStart = transferSeconds + releaseSeconds + .54;
    const recovering = recoveryAt !== undefined;
    const jammed = elapsed >= jamStart && !recovering;
    const recovery = recovering ? elapsed - recoveryAt : 0;
    if (recovering && recovery >= .8 + transferSeconds + .35) {
      complete = true;
      pause();
      return false;
    }

    const jamCycle = jamStart - transferSeconds;
    const transfer = recovering ? THREE.MathUtils.clamp(recovery - .8, 0, transferSeconds)
      : secondCycle ? Math.min(elapsed - transferSeconds, jamCycle) : elapsed;
    let exitProgress = THREE.MathUtils.clamp((transfer - releaseSeconds) / .8, 0, 1);
    if (secondCycle && !recovering) exitProgress = Math.min(exitProgress, (sensorX - dropX) / (exitX - dropX));
    if (recovering && recovery < .8) {
      exitProgress = THREE.MathUtils.lerp((sensorX - dropX) / (exitX - dropX), 1, recovery / .8);
    }
    const clearing = recovering && recovery < .8;
    const armTime = clearing ? THREE.MathUtils.lerp(jamCycle, transferSeconds, recovery / .8) : transfer;
    const onExit = clearing || transfer >= releaseSeconds;
    const outputX = THREE.MathUtils.lerp(dropX, exitX, exitProgress);
    const blocked = jammed || (onExit && Math.abs(outputX - sensorX) < .5);
    const beltTime = recovering ? jamStart + recovery : Math.min(elapsed, jamStart);
    updateCell({ cycle: armTime, beltTime, exitProgress, jammed, blocked });

    const pieces = (secondCycle ? 1 : Number(exitProgress >= 1)) + Number(recovery >= .8) + Number(recovery >= .8 + transferSeconds);
    const status = `${pieces} / 3 pezzi`;
    if (count.textContent !== status) count.textContent = status;
    const clock = `Ciclo ${(jammed ? elapsed - transferSeconds : transfer).toFixed(1).replace('.', ',')} s`;
    if (timer.textContent !== clock) timer.textContent = clock;
    exitWarning.hidden = !jammed;
    cycleWarning.hidden = !jammed || elapsed < jamStart + .9;
    unlock.hidden = !jammed;

    if (width !== previousWidth || height !== previousHeight || focal !== previousFocal) {
      if (width !== previousWidth || height !== previousHeight) renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(height / (2 * focal)));
      camera.updateProjectionMatrix();
      previousWidth = width;
      previousHeight = height;
      previousFocal = focal;
    }
    const [x, y, z] = center;
    const [ux, uy, uz] = worldUp ?? [0, -.82, -.57];
    up.set(ux, -uy, -uz).normalize();
    root.position.set(x, -y, -z).addScaledVector(up, 1);
    front.copy(root.position).negate().addScaledVector(up, root.position.dot(up));
    if (front.lengthSq() < .0001) front.set(0, 0, 1).addScaledVector(up, -up.z);
    if (front.lengthSq() < .0001) front.set(0, 1, 0).addScaledVector(up, -up.y);
    front.normalize();
    right.crossVectors(up, front).normalize();
    root.quaternion.setFromRotationMatrix(basis.makeBasis(right, up, front));
    renderer.render(scene, camera);

    if (jammed) {
      placeLabel(exitWarning, sensorX, 2.7, .18, width, height);
      placeLabel(unlock, sensorX, .5, 1.45, width, height);
      if (!cycleWarning.hidden) placeLabel(cycleWarning, -2.3, 4.3, -.3, width, height);
    }
    layer.hidden = false;
    return true;
  }

  return { render, pause, reset, get complete() { return complete; } };
}
