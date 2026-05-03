# Changelog

## 0.1.2 - 2026-05-03

- Added a `Textures` tab with texture metadata, frame details, usage counts, preview diagnostics, source URL, and best-effort original loader URL tracking.
- Added loader asset details in the `Load` tab, including failed, inflight, pending, and recent loader event history.
- Added debug overlay controls for selected bounds, all object bounds, object origins, camera viewport, and camera world view.
- Added `Export to console` for selected Phaser references, including `$phaserGame`, `$phaserScene`, `$phaserObject`, `$phaserCamera`, and `$phaserDevTools`.
- Added an inspect-only `Physics` tab for Arcade Physics world and selected-body details.
- Improved texture tab responsiveness by avoiding unnecessary re-renders, preserving scroll position, and updating texture selection immediately.
- Improved texture source diagnostics for blob-backed assets and early loader URL capture.
- Fixed selected object title wrapping when inline inspector actions leave limited horizontal space.

## 0.1.1 - 2026-04-28

- Added `Copy breadcrumb` in the selected object header to copy the full breadcrumb path in one line.
- Added per-field copy buttons in the inline object inspector to copy settings as `Label: Value`.
- Improved copy interactions with clipboard fallback support and status feedback on copy success/failure.
- Added green modified indicators for edited object values in the inline inspector, collapsed object rows, and page outline.
- Added original-value labels beside changed inline inspector fields.
- Added `Reset all` to restore all changed object values in the selected scene.
