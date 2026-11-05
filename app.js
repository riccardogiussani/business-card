(() => {
  const video = document.querySelector('#video');
  const canvas = document.querySelector('#overlay');
  const ctx = canvas.getContext('2d');
  const work = document.createElement('canvas');
  const wctx = work.getContext('2d', { willReadFrequently: true });
  const status = document.querySelector('#status');
  const startButton = document.querySelector('#start');
  const stopButton = document.querySelector('#stop');
  const placeholder = document.querySelector('#placeholder');
  const qrText = document.querySelector('#qrResult');
  const qrPose = document.querySelector('#qrPose');
  const markerText = document.querySelector('#arucoResult');
  const markerPose = document.querySelector('#arucoPose');
  let stream;
  let detector;
  let animation;
  let lastQR = '';
  let lastMarker = '';
  let busy = false;

  function setStatus(message, kind = '') {
    status.textContent = message;
    status.className = `status ${kind}`;
  }

  function focalLengthPx(width, height) {
    // Approximation from a 60° horizontal field of view; calibrated intrinsics
    // can be added for a particular phone/camera when tighter accuracy is needed.
    return width / (2 * Math.tan(Math.PI / 6));
  }

  function drawPolygon(points, color, label) {
    if (!points || points.length < 4) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(3, canvas.width / 240);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.max(16, canvas.width / 32)}px system-ui`;
    ctx.fillText(label, points[0].x + 6, points[0].y - 8);
  }

  function solveSquarePose(corners, sideCm) {
    const edge = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const widthPx = (edge(corners[0], corners[1]) + edge(corners[2], corners[3])) / 2;
    const heightPx = (edge(corners[1], corners[2]) + edge(corners[3], corners[0])) / 2;
    const cx = corners.reduce((sum, p) => sum + p.x, 0) / 4;
    const cy = corners.reduce((sum, p) => sum + p.y, 0) / 4;
    const focal = focalLengthPx(canvas.width, canvas.height);
    const z = focal * sideCm / Math.max(1, (widthPx + heightPx) / 2);
    const x = (cx - canvas.width / 2) * z / focal;
    const y = (cy - canvas.height / 2) * z / focal;
    const top = corners[1];
    const left = corners[0];
    const yaw = Math.atan2(top.y - left.y, top.x - left.x) * 180 / Math.PI;
    return { x, y, z, yaw };
  }

  function showPose(el, p) {
    el.textContent = `x ${p.x.toFixed(1)} cm · y ${p.y.toFixed(1)} cm · distanza ${p.z.toFixed(1)} cm · rot. ${p.yaw.toFixed(0)}°`;
  }

  function frame() {
    if (!stream || video.readyState < 2 || busy) {
      animation = requestAnimationFrame(frame);
      return;
    }
    busy = true;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      busy = false;
      animation = requestAnimationFrame(frame);
      return;
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = work.width = width;
      canvas.height = work.height = height;
    }
    ctx.clearRect(0, 0, width, height);
    wctx.drawImage(video, 0, 0, width, height);
    const image = wctx.getImageData(0, 0, width, height);

    try {
      if (detector) {
        const markers = detector.detect(image);
        if (markers.length) {
          const marker = markers[0];
          drawPolygon(marker.corners, '#59f0bd', `ArUco ${marker.id}`);
          const key = String(marker.id);
          if (key !== lastMarker) {
            markerText.textContent = `Marker ${marker.id}`;
            markerText.classList.remove('empty');
            lastMarker = key;
          }
          const size = Number(document.querySelector('#markerSize').value) || 10;
          showPose(markerPose, solveSquarePose(marker.corners, size));
        } else {
          markerText.textContent = 'Nessun marker rilevato';
          markerText.classList.add('empty');
          markerPose.textContent = '—';
          lastMarker = '';
        }
      }

      if (window.jsQR) {
        const code = jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' });
        if (code?.location) {
          const loc = code.location;
          const corners = [
            { x: loc.topLeftCorner.x, y: loc.topLeftCorner.y },
            { x: loc.topRightCorner.x, y: loc.topRightCorner.y },
            { x: loc.bottomRightCorner.x, y: loc.bottomRightCorner.y },
            { x: loc.bottomLeftCorner.x, y: loc.bottomLeftCorner.y }
          ];
          drawPolygon(corners, '#ffc45b', 'QR');
          const compact = code.data.length > 52 ? `${code.data.slice(0, 52)}…` : code.data;
          qrText.textContent = compact;
          qrText.classList.remove('empty');
          if (code.data !== lastQR) {
            lastQR = code.data;
            qrText.title = code.data;
          }
          const size = Number(document.querySelector('#qrSize').value) || 5;
          showPose(qrPose, solveSquarePose(corners, size));
        } else {
          qrText.textContent = 'Nessun QR rilevato';
          qrText.classList.add('empty');
          qrPose.textContent = '—';
          lastQR = '';
        }
      }
    } catch (error) {
      console.warn('Frame detection failed', error);
    }
    busy = false;
    animation = requestAnimationFrame(frame);
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Fotocamera non disponibile', 'error');
      return;
    }
    try {
      stream?.getTracks().forEach(track => track.stop());
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: document.querySelector('#camera').value }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      video.srcObject = stream;
      await video.play();
      placeholder.hidden = true;
      startButton.disabled = true;
      stopButton.disabled = false;
      setStatus('Camera attiva', 'live');
      if (window.AR?.Detector) detector = new AR.Detector();
      else setStatus('Camera attiva · libreria ArUco non caricata', 'error');
      frame();
    } catch (error) {
      console.error(error);
      setStatus(error.name === 'NotAllowedError' ? 'Permesso camera negato' : 'Errore avvio camera', 'error');
    }
  }

  function stopCamera() {
    cancelAnimationFrame(animation);
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    placeholder.hidden = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    setStatus('Camera spenta');
  }

  startButton.addEventListener('click', startCamera);
  stopButton.addEventListener('click', stopCamera);
  document.querySelector('#camera').addEventListener('change', () => { if (stream) startCamera(); });
  window.addEventListener('pagehide', stopCamera);
  if (!window.isSecureContext) setStatus('Apri la pagina in HTTPS', 'error');
})();
