# Phaser DevTools

Phaser DevTools is a Chrome DevTools extension that adds a dedicated `Phaser` panel for inspecting Phaser 3 games. It detects a Phaser game on the currently inspected page, shows basic game metadata, lists scenes, shows a recursive object tree for the selected scene, and exposes live inspection tools such as visibility toggling, page outline, and click-to-pick from the game canvas.

## File Structure

```text
.
├── README.md
└── extension
    ├── devtools.html
    ├── devtools.js
    ├── manifest.json
    ├── panel.css
    ├── panel.html
    ├── panel-bridge.js
    ├── panel.js
    └── page-hook.js
```

## How to Load the Extension in Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Enable `Developer mode` in the top-right corner.
3. Click `Load unpacked`.
4. Select the extension folder:
   - `/Users/tarik/Work/Other/Phaser-DevTools/extension`
5. Open any page, then open Chrome DevTools.
6. Look for the `Phaser` tab in the DevTools tab bar.

## How It Works

The extension lives in the `extension/` folder. Its `manifest.json` defines a DevTools page and a page-context hook.

`devtools.html` and `devtools.js` register a new DevTools panel named `Phaser` through `chrome.devtools.panels.create(...)`.

The panel UI lives in `panel.html`, `panel.css`, and `panel.js`. The panel never tries to hold live Phaser objects directly. Instead, `panel-bridge.js` uses `chrome.devtools.inspectedWindow.eval()` to run small helper functions inside the inspected page context.

To make detection work for Phaser apps that keep the game instance in module scope, `page-hook.js` runs at `document_start` in Chrome's `MAIN` world. It patches `window.Phaser.Game` in the page context and stores created game instances in a private registry on `window.__PHASER_DEVTOOLS__`.

Those inspected-page helpers:

- look for a Phaser game instance using common globals and simple heuristics
- serialize game metadata into plain JSON
- serialize scene data into plain JSON
- serialize display object summaries and details into plain JSON

That keeps the DevTools UI isolated from Phaser runtime objects and avoids serialization problems.

## Current MVP Features

- Manifest V3 extension with a real DevTools panel
- `Phaser` tab inside Chrome DevTools
- Detection for common Phaser game globals plus fallback heuristics
- Early page hook that records hidden Phaser game instances for module-scoped apps
- Basic game info:
  - detection state
  - width
  - height
  - renderer type
  - scene count
- Scene list with:
  - key
  - active
  - visible
- Recursive object tree for the selected scene with:
  - name
  - type
  - x
  - y
  - visible
  - child count
  - stable path identifier within the scene tree
- Object inspector with:
  - name
  - type
  - tree path
  - x
  - y
  - scaleX
  - scaleY
  - alpha
  - visible
  - rotation
  - texture key
- Show or hide the selected object from the panel
- Outline the selected object on the page
- Pick an object directly from the game canvas and sync it back into the panel
- Manual refresh button
- Lightweight auto-refresh when the panel regains focus

## Limitations

- Phaser does not expose a universal global game reference, so detection combines heuristics with an early page hook. If the extension is reloaded after the page has already started, refresh the page so the hook can run before the game is created.
- The MVP uses `scene key + object index` as the object identifier. If the display list changes, a previous selection may no longer point to the same object.
- Object identity is still path-based, so major scene tree mutations can invalidate an earlier selection.
- The page outline uses an axis-aligned bounding box derived from Phaser bounds, so rotated or unusually rendered objects may highlight approximately instead of perfectly.
- Click-to-pick uses bounds-based hit testing. It works best for common visible objects and containers, but it is not a full renderer-accurate picking system.
- The extension is read-only. It does not edit live object properties.
- The extension does not draw canvas overlays or highlight objects inside the game view.
- The extension has only been designed for Chromium DevTools with unpacked loading. It is not packaged for store distribution.
