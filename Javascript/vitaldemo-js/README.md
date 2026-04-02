# VitalDB API Server

A Node.js server that reads .vital files from the VitalDB open dataset and serves them via a JSON API.

## Features

- High-performance API server to serve sample vital files
- Downloads and parses `api.vitaldb.net/{1-10}.vital` files into memory on startup
- **Infinite loop playback**: File data is mapped to wall-clock time on a repeating cycle from server start
- Response format compatible with the VitalDB Web API `receive` endpoint

## Time Mapping (Infinite Loop)

```
wall-clock time:  |----server start---->|---elapsed----->|
                                        ↓
file time:        |===duration===|===duration===|===duration===| (infinite loop)
                     ↑ mapped position = elapsed % duration
```

When a request is made based on the current time, the elapsed time since server start is mapped to the file data using `elapsed % duration`.

## Installation & Running

```bash
npx vitaldemo
```

Environment variables:
- `PORT`: Server port (default: 3000)
- `HOST`: Bind address (default: 0.0.0.0)

## API Endpoints

### GET /api/status
Returns server status and current time mapping information for each file.

### GET /api/filelist
Returns the list of loaded vrcodes.

```json
[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
```

### GET /api/receive?vrcode={vrcode}&dtstart={dtstart}&dtend={dtend}
Returns vital data within the specified time range.

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| vrcode    | Yes      | -       | VitalDB case code |
| dtstart   | No       | now - 20 | Start time (Unix timestamp) |
| dtend     | No       | now     | End time (Unix timestamp) |

Timestamps in the response are mapped to wall-clock time.

```json
{
  "vrcode": 1,
  "dtstart": 1772499090,
  "dtend": 1772499110,
  "trks": [
    {
      "name": "IntelliVue/HR",
      "type": "num",
      "unit": "bpm",
      "recs": [
        { "dt": 1772499102, "val": 72.5 },
        { "dt": 1772499104, "val": 71.8 }
      ]
    }
  ]
}
```

## Project Structure

```
vitaldemo/
├── index.js               # Fastify main server (includes file loading and time mapping)
└── package.json
```

## Customization

You can modify the `VITAL_URLS` array in `index.js` to load different vital files.
