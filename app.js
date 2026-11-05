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
  const viewer = document.querySelector('.viewer');
  const businessCard = document.querySelector('#businessCard');
  const businessCardName = document.querySelector('#businessCardName');
  const businessCardInitials = document.querySelector('#businessCardInitials');
  const businessCardContact = document.querySelector('#businessCardContact');
  const businessCardLink = document.querySelector('#businessCardLink');
  const pageUrl = new URL(window.location.href);
  const profiles = new Map([
    ['riccardo', {
      name: 'Riccardo Giussani',
      initials: 'RG',
      contact: './riccardo.vcf',
      website: 'https://github.com/riccardogiussani'
    }]
  ]);
  let stream;
  let detector;
  let animation;
  let busy = false;
  let displayedProfile;
  let lastCardSeen = -Infinity;

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

  function showDetections(list, detections, size, color) {
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
      drawPolygon(corners, color, label);
      const text = row.firstElementChild;
      const compact = title.length > 52 ? `${title.slice(0, 52)}…` : title;
      const caption = compact ? `${label} · ${compact}` : label;
      if (text.textContent !== caption) text.textContent = caption;
      if (text.title !== title) text.title = title;
      showPose(row.lastElementChild, solveSquarePose(corners, size));
    });
  }

  function sameSquare(a, b) {
    return a.every((point, i) => Math.hypot(point.x - b[i].x, point.y - b[i].y) < 10);
  }

  function detectMarkers(image) {
    if (!detector) return [];
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

  function detectQRCodes(image) {
    const detections = [];
    if (!window.jsQR) return detections;
    const { width, height } = image;
    const options = { inversionAttempts: 'dontInvert' };

    while (true) {
      const code = jsQR(image.data, width, height, options);
      if (!code?.location) break;
      const loc = code.location;
      const corners = [loc.topLeftCorner, loc.topRightCorner, loc.bottomRightCorner, loc.bottomLeftCorner];
      if (detections.some(item => sameSquare(item.corners, corners))) break;
      detections.push({ corners, label: `QR ${detections.length + 1}`, title: code.data });

      // jsQR returns one result per call. Cover it on the working copy and scan again.
      tracePolygon(wctx, corners);
      wctx.fillStyle = wctx.strokeStyle = '#fff';
      wctx.lineWidth = 4;
      wctx.fill();
      wctx.stroke();
      image = wctx.getImageData(0, 0, width, height);
    }
    return detections;
  }

  function pagePath(url) {
    return url.pathname.replace(/(?:\/index\.html|\/)$/, '');
  }

  function profileForQRCode(value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      return undefined;
    }
    if (url.origin !== pageUrl.origin || pagePath(url) !== pagePath(pageUrl)) return undefined;
    const id = url.searchParams.get('card');
    const requestedId = pageUrl.searchParams.get('card');
    if (requestedId && id !== requestedId) return undefined;
    return profiles.get(id);
  }

  function updateBusinessCard(codes) {
    const now = performance.now();
    const width = viewer.clientWidth;
    const height = viewer.clientHeight;
    // The preview is center-cropped by object-fit: cover.
    const scale = Math.max(width / canvas.width, height / canvas.height);
    const offsetX = (width - canvas.width * scale) / 2;
    const offsetY = (height - canvas.height * scale) / 2;

    for (const { corners, title } of codes) {
      const profile = profileForQRCode(title);
      if (!profile) continue;
      const xs = corners.map(point => point.x * scale + offsetX);
      const ys = corners.map(point => point.y * scale + offsetY);
      const left = Math.min(...xs);
      const right = Math.max(...xs);
      const top = Math.min(...ys);
      const bottom = Math.max(...ys);
      if (right <= 0 || left >= width || bottom <= 0 || top >= height) continue;

      if (displayedProfile !== profile) {
        businessCardName.textContent = profile.name;
        businessCardInitials.textContent = profile.initials;
        businessCardContact.href = profile.contact;
        businessCardLink.href = profile.website;
        displayedProfile = profile;
      }
      businessCard.hidden = false;
      const inset = 8;
      const gap = 12;
      const cardWidth = businessCard.offsetWidth;
      const cardHeight = businessCard.offsetHeight;
      const x = Math.max(inset, Math.min((left + right - cardWidth) / 2, width - cardWidth - inset));
      const above = top - gap - cardHeight;
      const y = Math.max(inset, Math.min(above >= inset ? above : bottom + gap, height - cardHeight - inset));
      businessCard.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      lastCardSeen = now;
      return;
    }
    if (now - lastCardSeen >= 250) businessCard.hidden = true;
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
      const markers = detectMarkers(image);
      const codes = detectQRCodes(image);
      updateBusinessCard(codes);
      const markerSize = Number(document.querySelector('#markerSize').value) || 10;
      showDetections(markerResults, markers, markerSize, '#59f0bd');
      const qrSize = Number(document.querySelector('#qrSize').value) || 5;
      showDetections(qrResults, codes, qrSize, '#ffc45b');
    } catch (error) {
      updateBusinessCard([]);
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
    showDetections(markerResults, []);
    showDetections(qrResults, []);
    businessCard.hidden = true;
    lastCardSeen = -Infinity;
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
