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
  const qrResults = document.querySelector('#qrResults');
  const markerResults = document.querySelector('#arucoResults');
  const markerSize = document.querySelector('#markerSize');
  const qrSize = document.querySelector('#qrSize');
  const maxScanSide = 960;
  let stream;
  let session;

  function setStatus(message, kind = '') {
    status.textContent = message;
    status.className = `status ${kind}`;
  }

  function focalLengthPx(width, height) {
    // Approximation from a 60° horizontal field of view; calibrated intrinsics
    // can be added for a particular phone/camera when tighter accuracy is needed.
    return width / (2 * Math.tan(Math.PI / 6));
  }

  function tracePolygon(context, points) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y);
    context.closePath();
  }

  function drawPolygon(points, color, label) {
    tracePolygon(ctx, points);
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

  function showDetections(list, detections, size) {
    list.previousElementSibling.hidden = detections.length > 0;
    while (list.children.length > detections.length) list.lastElementChild.remove();

    detections.forEach(({ corners, label, title = '' }, index) => {
      let row = list.children[index];
      if (!row) {
        row = document.createElement('li');
        const pose = document.createElement('div');
        pose.className = 'pose';
        row.append(document.createElement('p'), pose);
        list.append(row);
      }
      const text = row.firstElementChild;
      const compact = title.length > 52 ? `${title.slice(0, 52)}…` : title;
      const caption = compact ? `${label} · ${compact}` : label;
      if (text.textContent !== caption) text.textContent = caption;
      if (text.title !== title) text.title = title;
      showPose(row.lastElementChild, solveSquarePose(corners, size));
    });
  }

  function drawOverlay(scanners) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const { detections, color } of scanners) {
      for (const { corners, label } of detections) drawPolygon(corners, color, label);
    }
  }

  function addScanner(current, { mode, interval, list, size, defaultSize, color }) {
    const worker = new Worker(`scanner-worker.js?mode=${mode}`);
    const scanner = { worker, interval, list, color, busy: false, lastScan: -Infinity, detections: [] };
    current.scanners.push(scanner);

    worker.onmessage = ({ data }) => {
      if (session !== current) return;
      scanner.busy = false;
      if (data.error) {
        console.warn('Frame detection failed', data.error);
        return;
      }
      if (data.width !== canvas.width || data.height !== canvas.height) return;
      scanner.detections = data.detections;
      showDetections(list, scanner.detections, Number(size.value) || defaultSize);
      drawOverlay(current.scanners);
    };
    worker.onerror = error => {
      if (session !== current) return;
      worker.terminate();
      scanner.worker = null;
      scanner.detections = [];
      showDetections(list, []);
      drawOverlay(current.scanners);
      console.warn('Scanner unavailable', error);
      setStatus(`Camera attiva · lettore ${mode === 'aruco' ? 'ArUco' : 'QR'} non disponibile`, 'error');
    };
  }

  function scheduleFrame(current) {
    const callback = time => scanFrame(current, time);
    current.frame = current.useVideoFrames ? video.requestVideoFrameCallback(callback) : requestAnimationFrame(callback);
  }

  function scanFrame(current, time) {
    if (session !== current) return;
    scheduleFrame(current);
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    if (!current.useVideoFrames && video.currentTime === current.lastFrameTime) return;
    current.lastFrameTime = video.currentTime;

    // Keep at most one frame in flight per scanner so old frames cannot queue up.
    const ready = current.scanners.filter(scanner => scanner.worker && !scanner.busy && time - scanner.lastScan >= scanner.interval);
    if (!ready.length) return;
    const scale = Math.min(1, maxScanSide / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    if (work.width !== width || work.height !== height || canvas.width !== width || canvas.height !== height) {
      canvas.width = work.width = width;
      canvas.height = work.height = height;
      for (const scanner of current.scanners) {
        scanner.detections = [];
        showDetections(scanner.list, []);
      }
    }
    wctx.drawImage(video, 0, 0, width, height);
    const image = wctx.getImageData(0, 0, width, height);

    ready.forEach((scanner, index) => {
      // Only the last worker can take ownership of the original buffer.
      const data = index === ready.length - 1 ? image.data : image.data.slice();
      scanner.worker.postMessage({ width, height, data }, [data.buffer]);
      scanner.busy = true;
      scanner.lastScan = time;
    });
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Fotocamera non disponibile', 'error');
      return;
    }
    stopCamera();
    const current = { scanners: [], useVideoFrames: typeof video.requestVideoFrameCallback === 'function' };
    session = current;
    startButton.disabled = true;
    setStatus('Avvio fotocamera');
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: document.querySelector('#camera').value }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (session !== current) {
        nextStream.getTracks().forEach(track => track.stop());
        return;
      }
      stream = nextStream;
      video.srcObject = stream;
      await video.play();
      if (session !== current) return;
      placeholder.hidden = true;
      stopButton.disabled = false;
      setStatus('Camera attiva', 'live');
      addScanner(current, { mode: 'aruco', interval: 0, list: markerResults, size: markerSize, defaultSize: 10, color: '#59f0bd' });
      addScanner(current, { mode: 'qr', interval: 90, list: qrResults, size: qrSize, defaultSize: 5, color: '#ffc45b' });
      scheduleFrame(current);
    } catch (error) {
      if (session !== current) return;
      stopCamera();
      console.error(error);
      setStatus(error.name === 'NotAllowedError' ? 'Permesso camera negato' : 'Errore avvio camera', 'error');
    }
  }

  function stopCamera() {
    const current = session;
    session = null;
    if (current) {
      if (current.useVideoFrames) video.cancelVideoFrameCallback(current.frame);
      else cancelAnimationFrame(current.frame);
      for (const scanner of current.scanners) scanner.worker?.terminate();
    }
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    showDetections(markerResults, []);
    showDetections(qrResults, []);
    placeholder.hidden = false;
    startButton.disabled = false;
    stopButton.disabled = true;
    setStatus('Camera spenta');
  }

  startButton.addEventListener('click', startCamera);
  stopButton.addEventListener('click', stopCamera);
  document.querySelector('#camera').addEventListener('change', () => { if (session) startCamera(); });
  window.addEventListener('pagehide', stopCamera);
  if (!window.isSecureContext) setStatus('Apri la pagina in HTTPS', 'error');
})();
