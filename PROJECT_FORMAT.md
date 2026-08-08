# `.multiview` Project Format — V8.0

`.multiview` is UTF-8 JSON with the top-level identifier:

```json
{
  "format": "multiview-camera-studio",
  "version": "8.0"
}
```

The project stores:

- `projectName`
- `savedAt`
- `asset`: asset type, primary filename, format and file manifest
- `camera`: azimuth, elevation, distance, lens preset, projection and focus target
- `viewport`: shading, grid and ground state
- `objectTransform`: position, rotation and scale
- `prompt`: angle mode, selected angles, source view, background, framing, custom instruction and generated prompt results
- `selection`: selected model object metadata when available
- `modelSummary`: lightweight geometry/material statistics

## External asset policy

V8.0 does not embed model/image binaries in `.multiview`. `asset.files` is a manifest used to tell the user which local files should be re-imported. This keeps `.multiview` files small and makes them practical even when a model bundle is hundreds of megabytes.

Future versions can extend the schema while retaining the `format` identifier and version field.
