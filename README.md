# AR Business Card

Static mobile web prototype for GitHub Pages. It requests the camera, detects QR codes and ArUco markers, draws outlines over the live preview, and reports an approximate pose relative to the camera.

## Try the business card

1. Create a QR code with the full URL of this page and `?card=riccardo`. For example, use `https://YOUR-USER.github.io/business-card/?card=riccardo` if that is your GitHub Pages address.
2. Scan the QR with the phone camera to open the page, tap **Avvia fotocamera**, and allow access to motion and orientation if prompted, then to the camera.
3. Set **Lato QR** to the measured width of the printed code in centimeters, excluding the white margin, and point the in-page camera at the same QR.
4. Keep the QR in view while the robot moves the pieces. When the exit jams, tap **Sblocca uscita** and watch the line resume. The contact card appears at the end. **Contatto** in the demo opens it directly.

With phone orientation available, the card's bottom edge appears approximately 4 cm above the center of the QR, perpendicular to the ground. The card turns horizontally toward the camera. Try it with the QR flat on a table and the phone at an angle. The offset uses estimated camera intrinsics and the entered QR width. When orientation data is unavailable, the page uses the 2D card.

The QR must match the origin and path of the page serving the scanner. The site URL and its `index.html` form are both accepted. Edit the profile in `app.js` and the downloadable contact in `riccardo.vcf` to customize the demo.

## Robot model and animation

`robot-cell.js` builds the cell from lightweight meshes and drives the wrist through a timed pick-and-place path. The elbow is solved from the wrist position and the two link lengths. The jam, warnings, sensor beam and recovery are simulated in the same cycle. Three.js loads from a pinned CDN release. If WebGL is unavailable, the profile card remains available.

To use a CAD-derived robot later, export a compact GLB with separate base, arm links and gripper, with the pivots at their joints. These parts can replace the procedural meshes while retaining the timing and alert logic.

## Run / publish

1. Push this folder to the `main` branch of a GitHub repository.
2. In **Settings → Pages**, select **GitHub Actions** as the build and deployment source.
3. Open the published HTTPS URL on the phone and grant camera access. Camera access generally requires a secure context; GitHub Pages provides HTTPS.

The included workflow publishes the repository root. No install or build step is required.

## What the numbers mean

- ArUco pose is estimated from the detected square, a user-entered physical marker size, and an approximate camera focal length inferred from a 60° horizontal field of view.
- QR position is estimated from its four corners and the entered QR side length. It is an approximate monocular pose, **not a surveyed position in a shared room coordinate frame**.
- Values are camera-relative: `x` and `y` are lateral/vertical offsets, `distance` is the estimated range, and rotation is a rough in-plane angle.
- Calibration, camera selection, focus, perspective, lighting, motion blur, and print-size accuracy affect results. The page does not create persistent spatial anchors, map the room, or share a common coordinate system between phones.

## Limitations

- Uses JavaScript computer vision, not native ARKit/ARCore plane tracking. It does not detect room planes.
- ArUco tracking is strongest while the marker is visible. If it leaves the image, the pose is no longer refreshed.
- The QR decoder and ArUco detector load from public CDNs, so first use requires internet access. For offline reliability, vendor audited, pinned copies locally.
- The camera stream stays in the browser; this prototype does not upload frames.
- Mobile browsers may throttle camera processing. Test the actual iPhone and Android models before relying on it during a game.

## Marker setup

Use large, flat, high-contrast Original ArUco markers (`DICT_ARUCO_ORIGINAL`) with a white margin. Enter the printed black-square side length in centimeters. Avoid glossy paper, folds, dim light, and extreme viewing angles. The scanner outlines each detected ArUco marker and QR code and estimates its pose individually. Each size setting applies to all detections of that type.

## Libraries

- `js-aruco` (marker detection)
- `jsQR` (QR decoding)

