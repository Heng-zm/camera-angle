# MultiView Scripting SDK — V8.18

Scripts execute inside a browser Web Worker and communicate with Camera Studio through a permission-aware command bridge.

## Camera

```js
studio.camera.get();
studio.camera.set({ azimuth: 45, elevation: 18, distance: 36, lens: "85mm", focus: "center" });
studio.camera.reset();
```

## Scene

```js
const ids = studio.scene.selection();
studio.scene.select(ids);
studio.scene.frame(ids);
studio.scene.hide(ids);
studio.scene.show(ids);
studio.scene.showAll();
studio.scene.isolate(ids);
studio.scene.duplicate(ids);
studio.scene.delete(ids);
studio.scene.rename(id, "New Name");
studio.scene.transform(id, { position: { x: 1 } });
studio.scene.parent([childId], parentId);
studio.scene.analyze3DPrint(ids);
```

## Generators

```js
studio.generate.terrain(options);
studio.generate.tree(options);
studio.generate.ivy(options);
studio.generate.cloud(options);
studio.generate.metaRig(options);
studio.generate.primitive("cube", options);
```

## Materials / lighting

```js
studio.material.update(materialId, { roughness: 0.4 });
studio.lighting.get();
studio.lighting.set({ preset: "softbox", keyIntensity: 2.5 });
```

## Extension settings

```js
studio.settings.get("mySetting", "fallback");
studio.settings.all();
```

## Extension importer input

Requires `file:read`:

```js
studio.input.name();
studio.input.type();
studio.input.text();
studio.input.json();
```

## Export / project

```js
studio.export.camera();
studio.export.scene();
studio.export.transform();
studio.export.prompt();
studio.export.unrealCamera();
studio.project.save();
```

## Runtime

- no direct DOM access
- no `fetch`, XHR, WebSocket, EventSource, dynamic import, or nested workers
- extension actions receive only manifest permissions
- extension profiler measures action execution time
- host stops extension action workers after 12 seconds

See `EXTENSION_FORMAT.md` for V2 registration points.
