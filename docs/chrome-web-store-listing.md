# Chrome Web Store Listing Template

Use this as your submission source-of-truth when filling the listing.

## Required Inputs You Must Provide

- Developer Dashboard account (one-time registration done)
- Public support URL
- Public privacy policy URL (host `docs/privacy-policy.md`)
- At least one screenshot of the extension UI
- Final release zip filename and version

## Recommended Inputs You Should Provide

- 3 to 5 screenshots showing key workflows
- Optional promo images if you want better store presentation
- Contact email for support

## Suggested Listing Copy

### Name

Phaser DevTools

### Short Description

Inspect Phaser 3 scenes and display objects directly inside Chrome DevTools.

### Detailed Description

Phaser DevTools adds a dedicated Phaser panel to Chrome DevTools for inspecting Phaser 3 games in real time.

Key features:
- Detect Phaser games using globals and early hook heuristics
- Inspect game metadata (renderer, size, scene count)
- Browse scenes and view quick scene state
- Explore display object trees and inspect object properties
- Highlight and pick objects directly from the page

This extension is intended for development and debugging workflows.

### Category

Developer Tools

## Permissions and Data-Use Declaration Notes

When completing Chrome Web Store forms:
- Explain that broad page matching is required to detect Phaser games on arbitrary developer/test domains.
- Explain that data inspection is local-only and not transmitted.
- Declare no sale/share of personal data.

## Pre-Submit Verification

- `manifest.json` version incremented
- `extension/icon.png` exists and loads
- `popup.html`, `devtools.html`, `panel.html` and all referenced scripts/styles exist
- Privacy policy URL is publicly accessible
- Support URL is publicly accessible
