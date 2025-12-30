# Template Sync Plugin

Use this as a starting point for new sync plugins.

## Quick Start

1. Copy this folder:
   ```bash
   cp -r plugins/_template plugins/my-source
   ```

2. Update `plugin.json`:
   - Change `name` to your plugin name
   - Change `icon` to an appropriate [Tabler icon](https://tabler.io/icons)
   - Update `description`

3. Update `plugin.js`:
   - Replace `PLUGIN_ID` with your unique ID (e.g., `my-source-sync`)
   - Replace `PLUGIN_NAME` with display name (e.g., `My Source`)
   - Replace `PLUGIN_ICON` with icon class (e.g., `ti-cloud`)
   - Replace `TARGET_COLLECTION` with target (e.g., `Issues`)
   - Implement `fetchFromSource()` to call your API
   - Implement `mapItemToRecord()` to transform data

4. Test in Thymer:
   - Create a Global Plugin
   - Paste your plugin.json and plugin.js
   - Create a Sync Hub record with your plugin_id
   - Run: `window.syncHub.requestSync('my-source-sync')`

## Configuration

Your plugin reads config from its Sync Hub record:

| Field | Usage |
|-------|-------|
| plugin_id | Must match your PLUGIN_ID |
| token | API token/key for authentication |
| config | JSON object with source-specific settings |

Example config JSON:
```json
{
    "workspace": "my-workspace",
    "filters": ["active", "assigned-to-me"]
}
```
