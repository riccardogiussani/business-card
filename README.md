# WebAR Marker Scanner

Static mobile web prototype for GitHub Pages. It requests the camera, detects QR codes and ArUco markers, draws outlines over the live preview, and reports an approximate pose relative to the camera.

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

Use large, flat, high-contrast ArUco markers with a white quiet border. Enter the printed black-square side length in centimeters. Avoid glossy paper, folds, dim light, and extreme viewing angles. A rigid multi-marker board can improve pose robustness; this prototype currently reports the first detected marker rather than solving a board.

## Libraries

- `js-aruco` (marker detection)
- `jsQR` (QR decoding)

