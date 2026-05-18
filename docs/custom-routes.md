# Custom Routes & Instructions

## `CustomRouteBuilder`

Build routes from scratch — no map click required.

```typescript
import { CustomRouteBuilder } from '@ingissa/navcore-core';

const builder = new CustomRouteBuilder();

// Add waypoints
const id1 = builder.addWaypoint([2.3522, 48.8566], { name: 'Start' });
const id2 = builder.addWaypoint([2.3400, 48.8650], { name: 'Checkpoint' });
const id3 = builder.addWaypoint([2.3009, 48.8741], { name: 'End' });

// Insert mid-route
const midId = builder.insertWaypoint([2.3300, 48.8620], id2);

// Reorder / remove
builder.removeWaypoint(midId);
builder.moveWaypoint(id2, [2.3380, 48.8640]);
```

### Chunking for API Limits

Most routing APIs have waypoint limits (Mapbox: 25, ORS: 50, OSRM: unlimited but slower).

```typescript
// OVERLAP_1: consecutive chunks share 1 boundary point (seamless stitching)
const chunks = builder.chunk('OVERLAP_1', 25);

const results = await Promise.all(chunks.map(c => provider.getRoute(c)));
const geometry = results.flatMap((r, i) => i === 0 ? r.geometry : r.geometry.slice(1));
engine.setRoute(geometry);
```

### GPX Import/Export

```typescript
// Export to GPX file
const gpx = builder.toGPX();
fs.writeFileSync('route.gpx', gpx);

// Import from GPX
const gpxString = fs.readFileSync('route.gpx', 'utf-8');
const importedBuilder = new CustomRouteBuilder();
importedBuilder.fromGPX(gpxString);
```

### GeoJSON Import/Export

```typescript
// Export — returns a FeatureCollection with Point features + LineString
const geojson = builder.toGeoJSON();

// Import — reads Point features from FeatureCollection
const geoBuilder = new CustomRouteBuilder();
geoBuilder.fromGeoJSON(existingGeoJSON);
```

---

## `InstructionEditor`

Create and manage `NavInstruction[]` arrays fluently.

### Instruction Types

| Type | Method | Use case |
|---|---|---|
| `depart` | `addDepart()` | First instruction |
| `turn` | `addTurn()` | Standard navigation turn |
| `exam_point` | `addExamPoint()` | Driving exam annotation |
| `checkpoint` | `addCheckpoint()` | Silent progress marker |
| `arrive` | `addArrive()` | Last instruction |

### Basic Usage

```typescript
import { InstructionEditor } from '@ingissa/navcore-core';

const editor = new InstructionEditor();

editor
  .addDepart(geometry[0], 'Start navigation')
  .addTurn(geometry[50], 'Turn left onto Main St', 50)
  .addExamPoint(geometry[80], 'Check mirrors', 80, { severity: 'warning' })
  .addTurn(geometry[120], 'At the roundabout, take exit 2', 120)
  .addArrive(geometry[geometry.length - 1]);

// IMPORTANT: Attach cumulative distances from route geometry
// This populates cumulativeOffset + bearingBefore/After on each instruction
editor.attachToCumulative(geometry);
editor.sort();  // Sort by geometryIndex

engine.setRoute(geometry, editor.toArray());
```

### Exam Severity Levels

```typescript
editor.addExamPoint(coord, 'Check blind spot', 45, { severity: 'critical' });
editor.addExamPoint(coord, 'Signal in advance', 60, { severity: 'warning' });
editor.addExamPoint(coord, 'Good speed choice', 75, { severity: 'info' });
```

### Editing Instructions

```typescript
const rich = editor.toRichArray();
const turnId = rich.find(i => i.type === 'turn')?.id;

// Update text
editor.update(turnId!, { text: 'Turn right onto Rue de Rivoli' });

// Remove
editor.remove(turnId!);

// Reorder
editor.reorder(id, 2); // Move to position 2
```

### Silent Checkpoints for Exam Tracking

```typescript
// Checkpoints don't trigger voice — only progress tracking
editor.addCheckpoint(geometry[30], 30, { zone: 'urban', examPhase: 1 });
editor.addCheckpoint(geometry[60], 60, { zone: 'highway', examPhase: 2 });

// Access metadata from rich array
engine.on('instruction', (instr) => {
  const rich = editor.toRichArray().find(r => r.geometryIndex === instr.geometryIndex);
  if (rich?.type === 'checkpoint') {
    trackExamPhase(rich.meta?.examPhase);
  }
});
```
