# Thymer SDK Notes

Gotchas, workarounds, and lessons learned while building sync plugins.

## Record Creation Timing

### The Problem

After calling `collection.createRecord(title)`, the record exists but `data.getRecord(guid)` returns `null`:

```javascript
const recordGuid = collection.createRecord(title);
const record = data.getRecord(recordGuid);  // null!
```

### The Workaround

Wait briefly, then find the record via `getAllRecords()`:

```javascript
const recordGuid = collection.createRecord(title);
await new Promise(resolve => setTimeout(resolve, 50));
const records = await collection.getAllRecords();
const record = records.find(r => r.guid === recordGuid);
```

This is documented in the Thymer legacy plugin with the comment: "might need a moment to sync".

### Line Items Have the Same Issue

After `createLineItem()`, subsequent `getLineItems()` calls may not immediately see the new item:

```javascript
// Create heading
const heading = await journal.createLineItem(null, lastItem, 'heading');

// PROBLEM: getLineItems() might not see the heading yet!
const items = await journal.getLineItems();
const found = items.find(i => i.guid === heading.guid); // might be null!
```

**Workaround**: Cache the GUID of created items to avoid relying on search:

```javascript
const headingCache = new Map(); // journalGuid -> headingGuid

// After creating
headingCache.set(journal.guid, heading.guid);

// On subsequent calls, find by cached GUID first
const cachedGuid = headingCache.get(journal.guid);
const heading = items.find(i => i.guid === cachedGuid);
```

## Choice Fields

### setChoice Matches by Label

`prop.setChoice()` matches by the choice **label**, not the **id**:

```json
{
    "id": "github",
    "label": "GitHub"
}
```

```javascript
// WRONG - won't match
prop.setChoice('github');

// RIGHT - matches the label
prop.setChoice('GitHub');
```

### setChoice Returns Success Boolean

Check if the choice was set successfully:

```javascript
const success = prop.setChoice('GitHub');
if (!success) {
    // Not a choice field, use regular set
    prop.set(value);
}
```

## Property Access Pattern

Always use optional chaining when accessing properties:

```javascript
// SAFE
record.prop('field_id')?.set(value);

// DANGEROUS - will throw if field doesn't exist
record.prop('field_id').set(value);
```

## CollectionPlugin vs AppPlugin

### CollectionPlugin

- Has `this.data` - full DataAPI access
- Tied to a specific collection
- Good for: orchestrators, collection-specific logic

### AppPlugin

- Receives `data` as parameter in callbacks
- Global scope, not tied to a collection
- Good for: sync plugins, cross-collection operations

### Finding Your Own Collection

CollectionPlugins don't have `this.collection`. Find yourself via:

```javascript
const collections = await this.data.getAllCollections();
this.myCollection = collections.find(c => c.getName() === this.getName());
```

## Reading Field Values

```javascript
// Text fields
const value = record.text('field_id');

// Choice fields (returns the choice ID, not label)
const choiceId = record.prop('field_id')?.choice();

// All properties
const props = record.getAllProperties();
for (const prop of props) {
    console.log(prop.name, prop.text());
}
```

## Datetime Fields

Use JavaScript Date objects:

```javascript
record.prop('created_at')?.set(new Date(isoString));
```

For DateTime ranges, use Thymer's DateTime class (available globally):

```javascript
const startDt = new DateTime(startDate);
const endDt = new DateTime(endDate);
startDt.setRangeTo(endDt);
record.prop('time_period')?.set(startDt.value());
```

## Line Item Segments

Line items contain `text_segments` as a flat array of type-value pairs:

```javascript
// Format: [type1, value1, type2, value2, ...]
['text', 'a task with a date ', 'datetime', { d: '20260105', t: { t: '234730', tz: 50 } }]
```

### Segment Types

| Type | Value | Example |
|------|-------|---------|
| `text` | string | `'some text'` |
| `datetime` | object | `{ d: '20260105', t: {...} }` |
| `link` | string | `'https://github.com/...'` |
| `ref` | object | `{ guid: 'abc123...' }` |

### Datetime Segment Format

```javascript
{
  "d": "20260105",      // Date: YYYYMMDD (empty string = time only)
  "t": {                // Time (optional)
    "t": "234730",      // HHMMSS
    "tz": 50            // Timezone offset
  },
  "r": {                // Range end (optional)
    "d": "20260108",    // End date YYYYMMDD
    "t": {...}          // End time (optional)
  }
}
```

**Examples:**

| Display | d | t | r |
|---------|---|---|---|
| `23:46` (time only) | `""` | `{ t: "234616", tz: 50 }` | - |
| `Mon Jan 5` (date only) | `"20260105"` | - | - |
| `Mon Jan 5 23:47` (full) | `"20260105"` | `{ t: "234730", tz: 50 }` | - |
| `Mon Jan 5 — Thu Jan 8` (range) | `"20260105"` | - | `{ d: "20260108" }` |

### Parsing Dates from Line Items

```javascript
function extractDate(textSegments) {
    // textSegments is flat array: [type, value, type, value, ...]
    for (let i = 0; i < textSegments.length; i += 2) {
        if (textSegments[i] === 'datetime') {
            const dt = textSegments[i + 1];
            if (dt.d) {
                // Parse YYYYMMDD
                const year = dt.d.slice(0, 4);
                const month = dt.d.slice(4, 6);
                const day = dt.d.slice(6, 8);
                return new Date(`${year}-${month}-${day}`);
            }
            // Time-only segment (no date)
            return null;
        }
    }
    return null;  // No datetime segment
}
```

### Creating Datetime Segments

When writing line items with dates:

```javascript
// Create a task with a date
item.setSegments([
    { type: 'text', text: 'call Bob ' },
    { type: 'datetime', text: { d: '20260110' } }  // Jan 10, 2026
]);

// With time
item.setSegments([
    { type: 'text', text: 'meeting ' },
    { type: 'datetime', text: { d: '20260110', t: { t: '140000', tz: 50 } } }
]);

// Date range
item.setSegments([
    { type: 'text', text: 'vacation ' },
    { type: 'datetime', text: { d: '20260115', r: { d: '20260120' } } }
]);
```

## Line Item Types and State

### Item Types

| Type | Description |
|------|-------------|
| `document` | The page/record container itself |
| `task` | A checkbox task |
| `text` | Plain text line |
| `heading` | Section heading |
| `ref` | Transclusion (reference to item in another note) |
| `br` | Line break |

### Tags/Mentions

Thymer uses `@@` prefix for tags/mentions:

```javascript
// In text_segments:
['text', '@@projectname']  // Tag syntax

// These appear to create backlinks/references
```

### Document (Page) Structure

The `document` type is the page/record container:

```javascript
// Document item structure
{
    type: 'document',
    guid: '17BNRHYY...',      // Document's own GUID
    rpguid: '1D7YAK7C...',    // Parent record GUID
    children: [item, item, ...],  // Child line items
    kv: {
        title: ['text', 'Page Title']  // Page title in KV store!
    },
    props: {},
    backlinks: [...],
}

// Access page title
const doc = Object.values(g_universe.itemsByGuid)
    .find(i => i.state?.type === 'document');
const titleSegments = doc.state.kv?.title;  // ['text', 'Page Title']
```

### Task Status Values

Task status is stored in `state.props.done` as a number:

| `props.done` | Status | Icon |
|--------------|--------|------|
| `undefined` | Todo (unchecked) | - |
| `0` | Unchecked (explicit) | - |
| `1` | In Progress | `ti-player-play` |
| `2` | Blocked / Waiting | `ti-player-pause` |
| `3` | Cost related | `ti-currency-dollar` |
| `4` | Important | `ti-alert-square` |
| `5` | Discuss / Question | `ti-help` |
| `6` | Alert | `ti-alert-triangle` |
| `7` | Starred | `ti-star` |
| `8` | Done (completed) | `ti-check` |

```javascript
const state = g_node_data.get(element)?.r?.state;

// WRONG - always undefined
const done = state.done;

// RIGHT - check props.done
const done = state.props?.done;

// Check if truly completed
const isCompleted = state.props?.done === 8;

// Check if has any status (including in-progress, blocked, etc.)
const hasStatus = state.props?.done !== undefined;
```

To set status via SDK:
```javascript
task.setMetaProperties({ done: 1 });  // Set to "In Progress"
task.setMetaProperties({ done: 8 });  // Set to "Done"
task.setMetaProperties({ done: null });  // Clear status (back to unchecked)
```

### Transclusion (References)

When a line item appears in multiple notes, Thymer uses `type: 'ref'`:

```javascript
// Ref item (in current note)
{
    type: 'ref',
    guid: '1HPK02CM32MMED1SM9ZWATSKCA',  // This ref's GUID
    rpguid: '1D7YAK7CCPDFANVK7X22F181WT', // This note's GUID
    props: { itemref: '1D4YCWWKJZBN8CFFRKQ3YDSP9G' },  // Source GUID
    itemref: { /* Full source item object */ }
}

// Source item (in original note)
{
    type: 'task',
    guid: '1D4YCWWKJZBN8CFFRKQ3YDSP9G',
    rpguid: '16S1WSXAWSHVHJZ72G6J3JRTCP',  // Different note!
    props: { done: 4 }  // Completion state
}
```

To get the actual task data from a ref:

```javascript
function getTaskData(state) {
    // If it's a ref, follow to source
    if (state.type === 'ref' && state.itemref) {
        return state.itemref;
    }
    return state;
}
```

### Full State Structure

```javascript
state = {
    guid: '...',           // This item's GUID
    type: 'task',          // task, text, heading, ref
    rpguid: '...',         // Parent record/page GUID
    rguid: '...',          // Collection GUID?

    // Content
    text_segments: [...],  // Flat array of segments

    // Hierarchy
    parent: '...',         // Parent item GUID
    children: [...],       // Child item GUIDs

    // Properties
    props: {
        done: 4,           // Task completion (truthy = done)
        itemref: '...',    // For refs: source item GUID
    },
    kv: {},                // Key-value store

    // Metadata
    created_at: ...,
    created_by: ...,
    modified_at: ...,
    modified_by: ...,

    // For refs only
    itemref: { /* Full source item */ },

    // Misc
    backlinks: [...],      // Items referencing this one
    is_deleted: false,
    is_trashed: false,
}
```

## Console Debugging (Hacking Thymer Internals)

> ⚠️ **WARNING**: Everything below this line documents **internal Thymer structures**,
> NOT the official Plugin SDK. These are undocumented, unsupported, and may change
> at any time. Use for debugging and exploration only - don't rely on these in
> production plugins!

When you need to inspect Thymer's internal data structures, use the browser console.

### Available Globals

```javascript
// Core data access
window.g_universe       // Main data store - THE motherlode
window.g_node_data      // WeakMap: DOM elements → internal data
window.g_state          // Current item's state (alias for g_item.state)
window.g_item           // Current focused item
window.g_view           // Current listview/editor

// Cursor/selection
window.g_linespan       // Current linespan
window.g_pos            // Current cursor position
window.g_prev_pos       // Previous cursor position
window.g_range          // Current selection range

// History
window.g_undo_stack     // Undo history
window.g_redo_stack     // Redo history

// Utilities
window.DateTime         // Thymer's DateTime class
window.syncHub          // SyncHub API (if installed)

// Debug
window.g_debug          // Debug mode flag
window.g_debug_flags    // Debug configuration
```

### g_universe - The Main Data Store

The `g_universe` object contains all loaded data:

```javascript
g_universe = {
    workspace: {...},           // Workspace config (9 keys)
    workspaceGuid: 'WR...',     // Workspace GUID
    itemsByGuid: {...},         // All loaded items by GUID
    itemsByGuidSize: 13,        // Count of loaded items
    operations: {...},          // Pending operations
    listviews: [...],           // Active listviews
    activeUser: {...},          // Current user
    userId: '...',              // User ID
}

// Access all loaded items
Object.entries(g_universe.itemsByGuid).forEach(([guid, item]) => {
    console.log(guid, item.state?.type, item.state?.text_segments);
});
```

### g_view - Current Editor State

```javascript
g_view = {
    universe: g_universe,       // Reference to data store
    $container: element,        // DOM container
    containers: [...],          // Item containers
    selection: {...},           // Current selection
    _item_with_caret: {...},    // Item where cursor is
}
```

### g_item - Current Focused Item

```javascript
// g_item is the currently focused line item
g_item = {
    listview: g_view,
    state: {
        guid: '...',
        type: 'task',
        text_segments: [...],
        // ... same structure as in g_node_data
    },
    linespans: [...],
}
```

### syncHub API (if installed)

```javascript
// Check available methods
window.syncHub = {
    version: 'v1.0.1',

    // Plugin registration
    register(name, config),
    registerHub(name, config),
    unregister(name),
    getRegisteredPlugins(),
    getPlugins(),

    // Sync operations
    requestSync(pluginName),
    syncAll(),
    getStatus(),

    // Content helpers
    insertMarkdown(markdown),
    replaceContents(record, markdown),
    parseLine(text),
    parseInlineFormatting(text),

    // Journal helpers
    getTodayJournal(),
    logToJournal(text),

    // Time formatting
    setLastRun(pluginName, date),
    formatTimestamp(date),
    formatRelativeTime(date),

    // MCP tools
    registerCollectionTools(collection, tools),
    getRegisteredTools(),
    executeToolCall(toolName, args),
}
```

### Inspecting Line Items via DOM

Thymer stores line item data in a WeakMap keyed by DOM elements:

```javascript
// Find task elements and inspect their data
const taskElements = document.querySelectorAll('.listitem-task');
taskElements.forEach((el, i) => {
    const data = g_node_data.get(el);
    const r = data?.r;

    console.log(`\n=== Task ${i}: ${el.textContent.slice(0, 40)} ===`);
    console.log('GUID:', r?.state?.guid);
    console.log('Type:', r?.state?.type);

    // Get text segments
    const segments = r?.linespans?.[0]?.text_segments;
    console.log('Segments:', segments);

    // Parse segment pairs
    for (let j = 0; j < segments?.length; j += 2) {
        const type = segments[j];
        const value = segments[j + 1];
        console.log(`  [${type}]:`, value);
    }
});
```

### Finding Specific Elements

```javascript
// Tasks
document.querySelectorAll('.listitem-task')

// All line items
document.querySelectorAll('.listitem')

// Headings
document.querySelectorAll('.listitem-heading')
```

### Data Structure

```javascript
g_node_data.get(element) = {
    r: {
        state: {
            guid: '1ANM31WAEE5FGKF1S0HVBEMM4Z',
            type: 'task',  // or 'text', 'heading', etc.
            // ...
        },
        linespans: [{
            text_segments: ['text', 'value', 'datetime', {...}],
            // ...
        }]
    }
}
```

### Pro Tip: First-Time Paste

Chrome DevTools blocks pasting by default. Type `allow pasting` and press Enter first.

### Inline Command Palette (cmdpal--inline)

Thymer has a reusable inline autocomplete/dropdown component. Useful for quick actions:

```html
<div class="cmdpal--inline animate-open active focused-component"
     style="position: fixed; width: 220px; z-index: 9999; top: 278px; left: 424px;">
    <div class="cmdpal--inline-input-container" style="display:none">
        <input class="cmdpal--inline-input" placeholder="" spellcheck="false" type="text">
    </div>
    <div class="autocomplete clickable">
        <div class="vscroll-node">
            <div class="vcontent">
                <div data-idx="0" class="autocomplete--option autocomplete--option-selected">
                    <span class="autocomplete--option-icon"><span class="ti ti-check"></span></span>
                    <span class="autocomplete--option-label">Done</span>
                    <span class="autocomplete--option-right"><span></span></span>
                </div>
                <div data-idx="1" class="autocomplete--option">
                    <span class="autocomplete--option-icon"><span class="ti ti-player-play"></span></span>
                    <span class="autocomplete--option-label">In Progress</span>
                    <span class="autocomplete--option-right"><span></span></span>
                </div>
                <!-- More options... -->
            </div>
        </div>
    </div>
</div>
```

Key classes:
- `cmdpal--inline` - Container with positioning
- `autocomplete--option` - Each selectable item
- `autocomplete--option-selected` - Currently highlighted
- `autocomplete--option-icon` - Left icon (tabler icons)
- `autocomplete--option-label` - Option text
- `autocomplete--option-right` - Right-side content (shortcuts, badges)

Positioning: Use `position: fixed` with calculated `top`/`left` based on trigger element.

## Useful Debug Snippets

### Inspect Today's Journal Tasks

```javascript
const journal = await window.syncHub.getTodayJournal();
const items = await journal.getLineItems();

items.forEach((item, i) => {
    if (item.type !== 'task') return;

    const segments = item.segments || [];
    let text = '';
    for (const seg of segments) {
        if (seg.type === 'text') text += seg.text;
    }

    console.log(`---`);
    console.log('Text:', text.slice(0, 50));
    console.log('GUID:', item.guid);
    console.log('Type:', item.type);
    console.log('Props:', JSON.stringify(item.props));
});
```

### Find Items by Text (e.g., headings)

```javascript
const journal = await window.syncHub.getTodayJournal();
const items = await journal.getLineItems();

items.forEach((item, i) => {
    const segments = item.segments || [];
    let text = '';
    for (const seg of segments) {
        if (seg.type === 'text') text += seg.text;
    }

    // Filter by text content
    if (!text.toLowerCase().includes('planner')) return;

    console.log(`---`);
    console.log('Text:', text);
    console.log('Type:', item.type);
    console.log('parent_guid:', item.parent_guid);
    console.log('journal.guid:', journal.guid);
    console.log('Same parent?:', item.parent_guid === journal.guid);
    console.log('heading_size:', item.heading_size);
    console.log('Props:', JSON.stringify(item.props));
});
```

### Inspect All Item Types in Journal

```javascript
const journal = await window.syncHub.getTodayJournal();
const items = await journal.getLineItems();

// Group by type
const byType = {};
items.forEach(item => {
    byType[item.type] = (byType[item.type] || 0) + 1;
});
console.table(byType);
```

### Check Task Completion Status

```javascript
const journal = await window.syncHub.getTodayJournal();
const items = await journal.getLineItems();

items.filter(i => i.type === 'task').forEach(item => {
    const segments = item.segments || [];
    const text = segments.map(s => s.type === 'text' ? s.text : '').join('');
    const status = item.props?.done;

    const statusNames = {
        undefined: 'unchecked',
        0: 'unchecked',
        1: 'in-progress',
        2: 'blocked',
        8: 'done'
    };

    console.log(`[${statusNames[status] || status}] ${text.slice(0, 40)}`);
});
```

## Hot Reload Development

For rapid iteration:

1. Start Chrome with debug port:
   ```bash
   google-chrome --remote-debugging-port=9222 --user-data-dir="/tmp/thymer-debug"
   ```

2. Use the Thymer SDK dev server:
   ```bash
   cd sdk && npm run dev
   ```

3. Edit plugin.js - changes push to browser memory
4. **Important**: Hot reload doesn't persist. Paste final code to Custom Code tab.
