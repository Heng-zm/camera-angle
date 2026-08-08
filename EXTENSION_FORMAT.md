# `.mvext` Extension Format — Platform V2

A `.mvext` file is UTF-8 JSON.

```json
{
  "format": "multiview-extension",
  "formatVersion": 2,
  "manifest": {
    "id": "yourname.my-extension",
    "name": "My Extension",
    "version": "1.0.0",
    "author": "Your Name",
    "category": "Custom",
    "description": "What the extension does.",
    "permissions": ["scene:read", "scene:write"],
    "dependencies": [
      { "id": "other.extension", "version": "1.2.0" }
    ],
    "settings": [
      { "id": "amount", "label": "Amount", "type": "number", "default": 4, "min": 1, "max": 20, "step": 1 },
      { "id": "mode", "label": "Mode", "type": "select", "default": "fast", "options": ["fast", "quality"] }
    ]
  },
  "actions": [
    {
      "id": "run-tool",
      "label": "Run Tool",
      "description": "Example action.",
      "script": "studio.log('Hello');"
    }
  ],
  "contributions": {
    "toolbar": [
      { "id": "tool-button", "label": "My Tool", "actionId": "run-tool" }
    ],
    "inspectorPanels": [
      { "id": "tool-panel", "title": "My Tools", "actionIds": ["run-tool"] }
    ],
    "outlinerMenu": [
      { "id": "outliner-action", "label": "Run on Selection", "actionId": "run-tool" }
    ],
    "importers": [
      { "id": "json-import", "label": "My JSON", "extensions": [".json"], "script": "const data = studio.input.json(); studio.log(data);" }
    ],
    "exporters": [],
    "generators": [],
    "renderHooks": [
      { "id": "before-render", "phase": "before", "label": "Before Render", "script": "studio.log('before render');" }
    ],
    "shortcuts": [
      { "id": "shortcut", "label": "Run Tool", "combo": "Alt+Shift+M", "actionId": "run-tool" }
    ]
  }
}
```

## Permissions

- `scene:read`
- `scene:write`
- `camera:read`
- `camera:write`
- `material:write`
- `lighting:read`
- `lighting:write`
- `render:write`
- `export:write`
- `project:write`
- `file:read` — required by extension text/JSON importers

## Settings API

```js
const value = studio.settings.get("amount", 4);
const all = studio.settings.all();
```

Settings are stored locally per extension.

## Importer API

V2 includes a browser-safe text/JSON importer bridge. The selected file is limited to 5 MB and is exposed only inside the worker:

```js
const filename = studio.input.name();
const text = studio.input.text();
const data = studio.input.json();
```

Importer actions require `file:read`.

## Render hooks

`renderHooks` support `phase: "before"` and `phase: "after"`. Enabled custom/library extensions are read by Render Studio before each queued render.

## Dependencies / updates

Dependencies use extension IDs plus minimum versions. The local library validates dependencies before installation. The update checker compares an installed library extension against the version bundled with the current Camera Studio build.

## Safety model

Extension action scripts run in a dedicated Web Worker with common network/DOM globals blocked. Commands are sent through the host permission bridge. A 12-second runtime limit protects the editor from accidental infinite work. This is defense-in-depth, not a perfect security boundary; install only extensions you trust.
