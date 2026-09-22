# Castle on the Hill

A self-contained browser 3D animation: a medieval castle on a hilltop plateau surrounded by a
large pine forest. The camera orbits the castle continuously and the flag on the main tower
waves in the wind. There are no controls.

## Run

Open `index.html` in any modern browser (double-click works; no server or network needed).

## Files

- `index.html` – page shell, WebGL check, loads the scripts.
- `app.js` – the whole scene: procedural terrain, instanced forest, castle, flag animation, orbit camera.
- `lib/three.global.js` – three.js r170 (MIT) repackaged as a classic script exposing `window.THREE`
  so the page runs from `file://` without ES-module CORS issues.
