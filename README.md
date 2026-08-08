# MultiView Camera Studio V8.18 — Render Studio + Extension Platform V2

V8.18 combines the requested **V8.15 Render Studio** and **V8.18 Extension Platform V2** on top of the browser-only Camera Studio production suite.

No AI model, backend, or cloud API is required.

## V8.15 — Render Studio

Open the new **Render** workspace from the top workspace bar.

### Output

- PNG
- JPEG
- WebP
- transparent PNG
- resolution presets up to UHD
- custom dimensions up to 8192 × 8192
- supersampling from 1× to 4×, automatically clamped to the browser/GPU render-target limit
- anti-aliasing
- Draft / Standard / High / Ultra quality presets

### Lighting / image quality

- shadow quality: Off / Draft / Medium / High / Ultra
- ACES Filmic / Neutral / Reinhard / Cineon / Linear / None tone mapping
- exposure control
- UnrealBloomPass bloom on opaque renders with a browser-safe fallback for transparent compositing
- SSAOPass ambient occlusion on opaque renders with a browser-safe fallback for transparent compositing
- contact shadow toggle
- scene background
- transparent background
- custom background color
- local background image
- HDR/EXR environment background through Lighting Studio

### Render queue

- queue the current camera
- queue all saved cameras
- per-shot state: Waiting / Rendering / Done / Cancelled
- per-shot progress
- overall progress
- cancel queue
- single render downloads directly
- multiple completed camera renders are packaged into a ZIP
- enabled extension render hooks can execute before/after render jobs

### Export Studio remains available

- Camera JSON
- Scene JSON
- Transform JSON
- Prompt TXT
- `.multiview` project
- copy camera configuration
- saved camera batch export

See `RENDER_STUDIO.md`.

## V8.18 — Extension Platform V2

The Scripting workspace now contains a local Blender-inspired extension library.

### Extension library

- Installed / Available tabs
- categories
- local search
- dependency declarations and dependency validation
- semantic version comparison
- local update checker
- per-extension settings UI
- install `.mvext`
- export any installed extension back to `.mvext`
- uninstall custom/library extensions
- permission list
- local performance profiler: runs, last time, average time, peak time, errors
- 12 second worker runtime guard

### Host registration points

V2 extension packages can declare:

- toolbar actions
- inspector panels
- Outliner context-menu actions
- text/JSON file importers
- exporters
- generators
- before/after render hooks
- custom keyboard shortcuts

Enabled toolbar registrations can appear in the global application toolbar. Inspector registrations appear in the camera inspector. Outliner actions are available from the scene tree and its right-click context menu.

### Local Extension Library

Included locally:

- ArchViz Tools
- Product Studio
- Procedural Rocks

The library works offline and does not contact an extension marketplace server.

### Script APIs added in V8.18

```js
const enabled = studio.settings.get("enabledFeature", true);
const allSettings = studio.settings.all();

const name = studio.input.name();
const json = studio.input.json();
```

`studio.input.*` is only available to extension importer actions that request `file:read`.

See `SCRIPTING_SDK.md` and `EXTENSION_FORMAT.md`.

## Existing production features retained

- real Three.js 3D viewport
- OBJ + MTL + textures
- STL / PLY / GLB / glTF / FBX / DAE / 3MF / 3DS
- Draco / Meshopt / KTX2-Basis support
- worker parsing for large OBJ/STL/PLY files
- progressive import and cancellation
- adaptive quality / FPS monitor
- Scene / Outliner system
- Material Studio
- Lighting Studio
- professional camera controls
- camera presets
- Target Camera Prompt Engine
- `.multiview` projects
- camera JSON and viewport exports
- browser-only Scripting workspace

## Run on Windows

Double-click:

```text
START_MULTIVIEW_WINDOWS.bat
```

Or:

```bash
npm run install:all
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

If dependencies are missing, run:

```text
FIX_DEPENDENCIES_WINDOWS.bat
```

## Production build

```bash
npm run build
```

Vercel configuration is included.
