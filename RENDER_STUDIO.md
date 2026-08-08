# Render Studio — V8.15 / V8.18

The Render workspace renders directly from the live Three.js scene.

## Queue workflow

1. Import a ready 3D asset.
2. Save any camera shots you want to render.
3. Open **Render**.
4. Select resolution, format, quality, tone mapping, lighting effects, and background.
5. Add **Current** or **Saved cameras** to the queue.
6. Click **Render Queue**.
7. Cancel at any time. The currently executing GPU readback may finish before cancellation takes effect.

Multiple completed jobs are packed into one ZIP.

## Quality presets

- **Draft** — 1×, lower shadow quality, fastest.
- **Standard** — 1× with anti-aliasing and AO.
- **High** — 2× supersampling, high shadows and AO.
- **Ultra** — 3× supersampling, ultra shadows, AO, and bloom.

The effective supersampling factor is automatically clamped by `WebGLRenderer.capabilities.maxTextureSize`.

## Render effects

Opaque renders use Three.js post-processing when available:

- `EffectComposer`
- `SSAOPass`
- `UnrealBloomPass`

Transparent/background-image captures use a browser-safe compositing fallback so the alpha channel remains usable.

## HDRI

Choose **HDRI** in Render Studio, then select an HDR/EXR file through Lighting Studio. The local environment texture is used for reflections/lighting and can be rendered as the background.
