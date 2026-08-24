# Discord Video Hide

A small Chrome extension that lets you hide individual participant cameras in Discord voice calls. Hidden videos can be blurred, covered with a black overlay, or cropped to a locally tracked face while audio continues as normal.

## Capabilities

- Completely hide a participant’s video, blur it, or show only a tracked face crop.
- Store per-person visibility choices locally so the chosen action is applied automatically when they appear again.
- Adapt the crop and tracking-failure tolerance for participants who move often or repeatedly cover their face.
- Keep hidden-video settings in sync across multiple Discord tabs.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select this folder.
5. Open Discord in Chrome and join a voice call.

There is no build step or `npm install` required.

## Use

Open the extension popup to choose blur, full black, or face-only mode. Face-only mode activates automatically for every participant camera. In face-only mode, the eye button toggles tracking versus the full feed and the square button toggles a complete blackout for that person. Those choices are remembered. Blur and full black remain per-participant: hover over a camera tile and click the eye button to hide or show it.

The extension works on Discord Web, including the regular, PTB, and Canary sites. It only changes what you see locally; it does not stop the video stream or save bandwidth. Settings are stored locally in Chrome.

## Limitations

- The extension only adds an overlay. It does not cut off or reduce the participant’s video traffic.
- Face-only mode uses an on-device MediaPipe face detector. Frames are processed locally and are not uploaded or stored.
- Face-only mode activates automatically and requires three stable face detections before showing a crop. A sparse optical-flow tracker and Kalman filter follow short head movements when the face is covered; the complete video returns if detection and motion tracking remain unavailable beyond that person's adaptive tolerance.
- Repeated movement or face covering gradually widens that person's crop and extends loss/occlusion tolerances. The profile returns to the tight default only after ten stable minutes; its level and event counters are stored locally.

## Preview

![Hidden video overlay](screenshots/video-hidden.png)

![Extension popup](screenshots/popup.png)

## Tests

```sh
node --test tests/*.test.js
```
