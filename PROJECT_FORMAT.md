# `.multiview` Project Format — V8.9

`.multiview` is a UTF-8 JSON document.

```json
{
  "format": "multiview-camera-studio",
  "version": "8.9"
}
```

## Top-level data

- `projectName`
- `savedAt`
- `asset`
  - asset type
  - primary filename
  - model/image format
  - external file manifest
  - `embedded: false`
- `camera`
  - azimuth
  - elevation
  - distance
  - lens preset
  - projection
  - focus target and position
- `viewport`
  - shading mode
  - grid
  - ground
  - quality mode
  - debug panel state
- `lighting`
  - environment preset
  - environment strength/rotation
  - key/fill/rim/ambient intensities
  - temperature
  - shadows
  - transparent background
  - custom environment filename when one was used
- `exportSettings`
  - image format
  - scale/custom size
  - transparency
  - quality
- `savedCameras`
- `objectTransform`
  - position XYZ
  - rotation XYZ
  - scale XYZ
- `prompt`
  - preset/custom 3D mode
  - selected target angles
  - source view for image workflows
  - background/framing
  - custom prompt instruction
  - generated prompt results
- `selection`
- `modelSummary`

## External asset policy

Model binaries, texture binaries, `.bin` resources, and HDR/EXR files are not embedded in `.multiview`. The project contains filenames and configuration so the original local assets can be relinked.

This keeps project files small even when a 3D bundle is hundreds of megabytes.

## Compatibility

Importers should check `format` first and then use `version` for optional migrations. Unknown future fields should be ignored rather than treated as an error.
