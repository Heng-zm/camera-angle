# MultiView Camera Prompt Builder — No AI Model

This edition removes all AI/model dependencies from the website.

## Removed

- Ollama
- qwen / moondream
- Stable Diffusion / Forge
- Gemini
- OpenAI API
- API keys
- model downloads
- backend AI server

## How it works now

Everything needed to build prompts runs directly in the browser.

1. Upload the reference image you will later use on ChatGPT.
2. Select the **Current/source camera view** manually.
3. Select one or more target preset angles, or use **3D Camera Control** for a custom target view.
4. Choose background and framing.
5. Click **Build prompt**.
6. Copy the generated prompt and use it on ChatGPT with the same image.

Because there is no AI model, the website does **not automatically inspect the uploaded image**. The source camera view is selected manually by the user.

## Run on Windows

Double-click:

`START_MULTIVIEW_WINDOWS.bat`

Or run manually:

```bash
npm run install:all
npm run dev
```

Then open:

`http://127.0.0.1:5173`

## Build

```bash
npm run build
```

## Important

This version is a prompt builder only. It does not generate images itself. Use the generated prompt together with the same uploaded image on the ChatGPT website.


## Optimized 3D Camera Control UI

This update redesigns the 3D Camera Control area for a cleaner workflow:

- clearer source view vs target view cards
- larger preview stage with cleaner guidance
- active quick-view buttons
- precision sliders plus direct numeric inputs
- step/nudge controls for fast adjustment
- better mobile responsiveness and cleaner panel grouping
- no backend or AI model required


## UI Optimization V2

This release further optimizes the browser-only prompt builder UI:

- smaller hero and reduced vertical whitespace
- denser four-column desktop angle grid
- more compact source-view and workflow cards
- refined 3D Camera Control sizing and hierarchy
- tighter quick-view, precision, numeric, and nudge controls
- cleaner settings and prompt-result cards
- improved tablet and mobile breakpoints
- no AI model and no backend API


## Recommended 3D Camera update

This version adds the requested next-step features for the browser-only prompt builder:

- **FOV / Lens Control** with 24mm, 35mm, 50mm, 85mm, and 105mm presets
- **Camera Preset Cards** such as Product Hero, Food Top-down, Side Profile, and Close Product
- **Better Prompt Output** that now includes current view, target view, lens/FOV, and focus point
- **Camera Target / Focus Point** controls with a visible focus marker in the 3D stage
- **Camera Gizmo** quick buttons for Top, Left, Front, Right, Back, and Low views

No AI model or backend is required. Everything still runs locally in the browser and builds a ChatGPT-ready prompt.


## 3D Pro Editor V2

The 3D Camera Control has been reorganized around a professional source-to-target camera workflow:

- large camera preview on the left and compact controls on the right
- clear **SOURCE → TARGET** comparison bar
- clickable 3D-style **Camera Gizmo** in the preview
- live HUD for azimuth, elevation, lens, and zoom
- **Camera Preset Cards** with full camera recipes
- combined sliders and exact numeric inputs
- compact segmented **24mm / 35mm / 50mm / 85mm / 105mm** lens selector
- focus shortcuts plus **click the preview to set a custom focus target**
- collapsible fine-tune controls
- sticky camera setup summary with **Use this camera setup** action
- generated prompts include exact target camera values, lens/FOV, and focus target information

The app remains browser-only with no AI model, backend, or API key.


## Clean UI + icons + motion V4

This update focuses on clarity and polish without adding backend or AI dependencies:

- removed the redundant single-mode selector to reduce clutter
- compacted the hero and renumbered the workflow to 4 clear steps
- refreshed section icons across preset, 3D position, lens/FOV, focus, fine tune, and camera setup controls
- cleaner source upload / drag / paste toolbar
- refined preset and 3D camera cards with one soft green accent
- lighter borders, fewer heavy shadows, and more consistent corner radii
- subtle reveal, hover, focus-target, drop-zone, status, and button animations
- animated fine-tune disclosure and camera-control feedback
- improved responsive layout, including sticky source panel only on large desktop
- honors `prefers-reduced-motion` for accessibility

The app remains browser-only with no AI model, backend, or API key.


## Studio Pro V5

The interface has been rebuilt in a neutral professional editor style:

- white and charcoal surfaces with no decorative gradients
- tighter 6–10px radii and thin gray borders
- compact left reference panel and large camera workspace
- dark 3D viewport with light camera inspector
- monochrome camera presets, lens, focus, and gizmo controls
- black primary actions and minimal motion
- source-to-target toolbar and sticky camera status bar
- responsive inspector layout for tablet and mobile
- drag/drop and clipboard image paste remain supported
- browser only: no AI model, backend, or API key


## V6.1 Bug Fix / Stability Update

Fixed issues found during the Power Orbit V6 audit:

- manual sliders, wheel zoom, keyboard nudges, and presets now take exclusive camera control instead of fighting auto-loop or inertia
- Space-key auto-loop now cancels active inertia/drag first
- switching between Preset and 3D modes stops transient orbit state cleanly
- pointer cancellation/lost capture no longer creates an accidental custom focus point
- inertia release velocity is capped to prevent sudden camera jumps
- pausing before mouse release no longer reuses stale momentum
- generated prompts are invalidated when camera/settings/source/selection inputs change, preventing stale prompt output
- global Ctrl+V image capture no longer hijacks paste while typing in inputs or textareas
- empty numeric camera fields no longer collapse unexpectedly to zero
- window blur / hidden-tab cleanup stops transient drag/inertia state and clears stuck drag-drop overlays
- removed obsolete camera-control code and unused state from earlier UI generations

Validation performed:

- JSX/JS syntax transpile check: passed with 0 diagnostics
- JavaScript semantic check found no undefined local identifiers; only expected missing React/Lucide modules in this sandbox because npm registry access is unavailable
- CSS brace integrity check: passed


## V7 — Blender-inspired UI redesign

The interface has been rebuilt into a Blender-inspired camera workspace while preserving the V6.1 Power Orbit bug fixes.

- Blender-style top menu and workspace tabs
- three-pane editor layout: Image Editor / 3D Viewport / Properties
- dark viewport with Blender-like grid
- left viewport tool shelf
- compact 3D camera HUD and orientation gizmo
- blue active states and compact property fields
- scrollable camera properties inspector
- bottom status bar with live camera values and shortcuts
- prompt output styled like an editor area
- responsive collapse for laptop, tablet, and mobile widths
- all browser-only image paste/drag-drop, camera presets, lens/FOV, focus, and Power Orbit features preserved


## V7.1 — Bug fix + UI cleanup

- replaced the accumulated multi-version stylesheet with one clean Blender-inspired stylesheet
- fixed viewport keyboard shortcuts firing from nested gizmo/tool buttons
- fixed nested double-clicks accidentally resetting the camera
- improved auto-orbit toggle handoff so inertia/drag state is cancelled consistently
- prompt generation now cancels any active camera drag before capturing camera settings
- added clipboard copy fallback for browsers where `navigator.clipboard.writeText` is unavailable
- stopped object URLs from being revoked twice during image replacement/removal
- reduced clipboard listener churn when the reference preview changes
- clamped typed azimuth input to 0–359 instead of wrapping unexpected out-of-range values
- made top Camera / Prompt / Layout navigation controls functional
- removed fake/inactive Blender menu items and redundant Processing control
- exposed Lens/FOV and Focus controls in preset mode so preset prompts cannot inherit hidden camera settings
- added active styling for Left / Back / Low gizmo views
- removed the redundant footer; the Blender status bar is now the persistent status surface
- simplified responsive behavior for desktop, laptop, tablet, and mobile

The app remains browser-only and uses no AI model, backend, or API.


## V7.1 Optimized

This build intentionally stays on the V7.1 Blender-style UI and optimizes it instead of using the later V7.2/V7.3 redesigns.

- preserves the V7.1 three-pane Image Editor / 3D Viewport / Properties workspace
- fixes the old six-full-plane preview geometry by using a thin 3D reference slab, preventing huge crossing planes at steep camera angles
- increases usable viewport size and reference preview readability
- compacts Power Orbit controls without removing the engine
- makes camera preset recipes a denser 2×2 inspector grid
- keeps the right camera inspector visible on laptop widths longer before stacking
- moves outer Properties below the source panel earlier to give the camera viewport more horizontal space
- improves sticky source/properties behavior on wide desktop screens
- slightly increases text/control readability while preserving Blender-like density
- improves tablet/mobile breakpoints and keeps the sticky camera summary predictable
- retains all V7.1 bug fixes, drag/drop, clipboard paste, lens/FOV, focus targeting, gizmo, presets, Power Orbit, and browser-only prompt generation


## V7.1 3D Asset Support

This update keeps the V7.1 Optimized Blender-style camera workspace and adds real local 3D model rendering.

### Supported source assets

**Images**
- PNG
- JPG / JPEG
- WEBP

**3D models**
- OBJ
- STL (ASCII or binary)
- PLY
- GLB
- glTF
- FBX
- DAE / Collada
- 3MF
- 3DS

### Companion files

For formats that reference external files, select or drag all files together:
- OBJ: `.obj` + optional `.mtl` + texture images
- glTF: `.gltf` + `.bin` + texture images
- FBX / DAE: referenced texture images when used by the model

GLB, STL, and PLY are normally single-file imports.

### 3D workflow

1. Click **Open asset / Browse files**, or drag files into the Asset Editor.
2. Choose the model and its companion files together when needed.
3. The app automatically switches to **3D Camera Control** for a 3D model.
4. Use Power Orbit, camera presets, azimuth/elevation/distance, lens/FOV, focus, and the camera gizmo as before.
5. The central viewport renders the real mesh with local lighting and grid helpers.
6. Prompt output changes its source wording for 3D assets so it treats the model as geometry/material reference instead of a fixed source photograph.

### Privacy / architecture

- Model files stay in the browser.
- No upload backend was added.
- No AI model or API key is required.
- 3D rendering is provided by `three` and Three.js addon loaders.
- Image paste (`Ctrl+V` / `Cmd+V`) remains available for image sources.
- Model bundle limit: 250 MB total.


## V7.1.3 dependency fix

This build fixes the Vite error:

```text
Failed to resolve import "three" from "src/ThreeModelViewport.jsx"
```

The earlier Windows launcher only checked whether `client/node_modules` existed. When upgrading over an older build, that directory could exist without the newly-added `three` package, so dependency installation was skipped.

### Fixed behavior

- `three` remains declared in `client/package.json`.
- `npm run dev`, `npm run build`, and `npm run preview` now run a dependency check first.
- Missing dependencies are installed automatically.
- The stale `client/node_modules/.vite` dependency cache is cleared after repair.
- `START_MULTIVIEW_WINDOWS.bat` always runs the dependency repair check before Vite starts.
- `FIX_DEPENDENCIES_WINDOWS.bat` is included for a manual one-click repair.

If you are repairing an existing extracted folder manually, run:

```bash
npm install --prefix client
npm run dev
```

or from inside `client`:

```bash
npm install
npm run dev
```


## V7.2 + V7.3 — Import Stability + Real 3D Viewport

This combined update keeps the V7.1 Blender-style workspace and upgrades the actual 3D workflow.

### V7.2 — 3D Import Stability

- multi-file drag/drop and file picker bundles
- OBJ + MTL + texture dependency scanning
- glTF external BIN/image dependency scanning
- DAE texture reference scanning
- missing dependency warnings
- staged model loading progress
- cancel loading plus retry/reload controls
- large-file, high-vertex, and high-triangle warnings
- automatic centering, uniform scaling, and ground alignment
- reset model transform action
- clearer unsupported/corrupt model errors
- recent 3D import metadata history stored in localStorage

### V7.3 — Real 3D Viewport

- real Three.js PerspectiveCamera and OrthographicCamera modes
- OrbitControls around the actual imported model
- Shift + left-drag panning
- wheel dolly/zoom
- Material / Solid / Wireframe / Normal shading modes
- grid and ground plane toggles
- world-axis helper/gizmo
- click-to-select mesh objects with a selection box
- selected-object display in the Properties panel
- model projection mode included in generated prompts

Everything still runs locally in the browser. No AI model, backend, or cloud API is required.

## V8.0.1 — Vercel deployment + bundle optimization

- Adds a root `vercel.json` with the correct output directory: `client/dist`.
- Uses the root build command (`npm run build`) and client install command (`npm run install:all`).
- Adds SPA fallback routing for Vite on Vercel.
- Lazy-loads the Three.js 3D viewport only when a 3D model is opened.
- Splits React, Three.js core, Three.js loaders/controls, and icons into cache-friendly production chunks.
- Raises the chunk warning threshold only for the intentionally isolated Three.js bundle; it does not change runtime behavior.

### Vercel Root Directory

The package supports both Vercel setups:

- Repository root selected as Root Directory: root `vercel.json` deploys `client/dist`.
- `client` selected as Root Directory: `client/vercel.json` deploys `dist`.

Do not set the Vercel Output Directory to `public`; Vite's production output is `dist`.
