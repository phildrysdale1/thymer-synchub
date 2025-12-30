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
