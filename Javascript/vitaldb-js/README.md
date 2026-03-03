# vitaldb-js

Node.js parser for [Vital Recorder](https://vitaldb.net) `.vital` file format.

## Installation

```bash
npm install vitaldb-js
```

## Usage

```js
const VitalFile = require("vitaldb-js");

// Load a .vital file
const vf = await new VitalFile(null, "sample.vital");

// Get all track names
console.log(vf.get_track_names());
// e.g. ["IntelliVue/ECG_II", "IntelliVue/HR", "IntelliVue/SPO2", ...]

// Find a track by name
const hr = vf.find_track("HR");
console.log(hr.recs.length);  // number of records
console.log(hr.unit);         // "bpm"
console.log(hr.srate);        // sample rate (0 for numeric tracks)

// Access record data
for (const rec of hr.recs) {
    console.log(rec.dt, rec.val);  // timestamp, value
}
```

### Filtering tracks

```js
// Load only specific tracks
const vf = await new VitalFile(null, "sample.vital", ["HR", "SPO2"]);

// Load all tracks except specific ones
const vf = await new VitalFile(null, "sample.vital", [], false, ["ECG_II"]);

// Load track metadata only (no record data)
const vf = await new VitalFile(null, "sample.vital", [], true);
console.log(vf.get_track_names());
```

## API

### `new VitalFile(client, filepath, track_names?, track_names_only?, exclude?)`

Returns a Promise that resolves to the VitalFile instance.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `client` | `object\|null` | | Redis client for caching, or `null` |
| `filepath` | `string` | | Path to `.vital` file |
| `track_names` | `string[]` | `[]` | Only load these tracks (empty = all) |
| `track_names_only` | `boolean` | `false` | If `true`, parse metadata only, skip record data |
| `exclude` | `string[]` | `[]` | Track names to exclude |

### Instance properties

| Property | Type | Description |
|---|---|---|
| `devs` | `object` | Device info map (id -> {name, type, port}) |
| `trks` | `object` | Track info map (id -> track object) |
| `dtstart` | `number` | Earliest timestamp (Unix) |
| `dtend` | `number` | Latest timestamp (Unix) |
| `dgmt` | `number` | Timezone offset in minutes |

### Instance methods

| Method | Returns | Description |
|---|---|---|
| `get_track_names()` | `string[]` | All track names in "Device/Track" format |
| `find_track(name)` | `object\|null` | Find track by "Device/Track" or just "Track" name |
| `get_color(tid)` | `string` | Track display color as "#RRGGBB" |
| `get_montype(tid)` | `string` | Monitor type name (e.g. "ECG_WAV", "PLETH_SPO2") |

### Track object

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Track name |
| `dtname` | `string` | "Device/Track" name |
| `type` | `number` | 1=waveform, 2=numeric, 5=string |
| `srate` | `number` | Sample rate (Hz), 0 for numeric/string |
| `unit` | `string` | Unit of measurement |
| `recs` | `array` | Records: `{dt, val}` |
| `mindisp` | `number` | Display range minimum |
| `maxdisp` | `number` | Display range maximum |

## File Format

The `.vital` file format is a gzip-compressed binary format:

- **Header**: "VITA" signature + format version + timezone info
- **Packets**: DEVINFO (device metadata), TRKINFO (track metadata), REC (data records), CMD (commands)
- **Encoding**: Little-endian, 1-byte aligned, UTF-8 strings
- **Timestamps**: Unix timestamp as IEEE 754 double (UTC)

## License

MIT
