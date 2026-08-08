# MultiView Camera Studio V8.9 — Production Suite

A browser-only camera and 3D asset studio built with React, Vite, and Three.js. No AI model, backend, or cloud API is required.

## What is included

### V8.1 — Production Stability & Performance

- Web Worker parsing for large OBJ / STL / PLY files so heavy parsing is moved off the main UI thread.
- Progressive scene reconstruction and mesh preparation with visible import progress.
- Cancel / retry model loading with FileReader and Worker cleanup.
- Local Draco decoder support for compressed glTF / GLB.
- Meshopt decoder support.
- Local KTX2 / Basis transcoder support.
- Each 3D loader is dynamically imported and split into its own production chunk where possible.
- Model warnings for very large bundles, high triangle counts, high vertex counts, missing dependencies, missing textures, and missing UVs.
- 500 MB model-bundle guardrail.
- Automatic performance quality selection plus FPS-based adaptive quality recovery/downgrade in Auto mode.
- Low quality disables expensive shadows automatically.
- GPU/resource diagnostics: FPS, draw calls, rendered triangles, geometry count, texture count, GPU renderer name when available, and estimated geometry/texture memory.
- Explicit cleanup of WebGL resources, model object URLs, decoder instances, temporary export targets, materials, geometries, textures, workers, and file readers.
- WebGL context-loss recovery.
- Viewport React error boundary with restart action.
- Debug/FPS panel toggle.
- Screenshot export uses an offscreen render target so normal viewport rendering does not require `preserveDrawingBuffer`.

> GPU memory is shown as an estimate of the resources owned by Camera Studio. Browsers do not provide a portable API for exact total VRAM usage.

### V8.2 — Scene / Outliner

The left editor now exposes a Blender-style hierarchy:

- Scene
  - Camera
  - Lights
  - imported model hierarchy / meshes
- Viewport click selects an object and highlights it in the Outliner.
- Outliner click selects the matching viewport object.
- Ctrl/Cmd-click multi-select.
- Double-click rename.
- Hide / show.
- Lock / unlock selection.
- Duplicate.
- Delete.
- Parent / unparent.
- Search/filter scene hierarchy.
- Isolate selected / show all.
- `F` frames the selected object(s).
- Per-selection object statistics.

### V8.4 — Material Studio

- Material slot list for the current selection.
- Base Color.
- Emissive.
- Roughness.
- Metallic.
- Opacity / transparency.
- Double-sided toggle.
- Texture slots for Base Color, Normal, Roughness, Metallic, Emissive, and Alpha.
- Replace texture from local file.
- Drag/drop a texture directly onto a material slot.
- Remove texture maps.
- Texture preview when a browser-readable source is available.
- Missing-asset list and Add / Relink Files workflow.
- Missing UV warning.
- Supports PNG/JPG/WEBP/BMP/TGA/DDS/KTX2 texture replacement.

### V8.5 — Lighting Studio

Lighting presets:

- Studio HDRI-style environment
- Neutral
- Softbox
- Outdoor
- Dark Studio
- Custom HDR / EXR environment

Controls:

- environment strength
- environment rotation
- key light intensity
- fill light intensity
- rim light intensity
- ambient light intensity
- color temperature
- shadows
- transparent background

Custom HDR/EXR environments are processed locally in the browser.

### V8.9 — Export Studio

Image export:

- PNG
- JPEG
- WebP
- transparent PNG
- 1× / 2× / 4×
- custom dimensions up to 8192×8192

Data/project export:

- Camera JSON
- Scene JSON
- Transform JSON
- Prompt TXT
- `.multiview` project
- Copy camera configuration
- Saved camera presets
- Batch screenshots from saved cameras to ZIP using the current export format/resolution settings

## Real 3D viewport

Supported model formats:

- OBJ + MTL + textures
- STL
- PLY
- GLB
- glTF + BIN + textures
- FBX
- DAE / Collada
- 3MF
- 3DS

Viewport controls:

- Left drag: orbit
- Shift + left drag: pan
- Mouse wheel: dolly / zoom
- Click mesh: select
- Ctrl/Cmd + click: multi-select
- F: frame selected
- Perspective / Orthographic
- Material / Solid / Wireframe / Normal shading
- Grid toggle
- Ground toggle
- World-axis helper

## Local decoder assets

After dependencies are installed, Camera Studio copies the decoder files shipped with the installed Three.js package into:

- `client/public/three-decoders/draco`
- `client/public/three-decoders/basis`

This keeps Draco and KTX2/Basis decoding browser-only at runtime.

## Run on Windows

Double-click:

`START_MULTIVIEW_WINDOWS.bat`

Or:

```bash
npm run install:all
npm run dev
```

Open:

`http://127.0.0.1:5173`

If dependencies are broken or missing, run:

`FIX_DEPENDENCIES_WINDOWS.bat`

## Production build

```bash
npm run build
```

Vercel configuration is included for either repository-root or `client` root deployments.

## `.multiview` projects

`.multiview` stores project/camera/viewport/lighting/prompt/export configuration and an asset manifest. Large model, texture, and HDR binaries are intentionally kept external and must be relinked when opening a project on another machine.

See `PROJECT_FORMAT.md` for the schema overview.
