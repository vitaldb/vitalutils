# VitalUtils

[![PyPI version](https://badge.fury.io/py/vitaldb.svg)](https://badge.fury.io/py/vitaldb)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

https://vitaldb.github.io/vitalutils

This repository contains utilities and libraries for working with VitalDB files, implemented in various programming languages.

## Python

The Python library (v1.6.0) is the primary interface for interacting with VitalDB files and the VitalDB open dataset.

### Installation

```bash
pip install vitaldb
```

For MCP (Model Context Protocol) server support:

```bash
pip install vitaldb[mcp]
```

### Basic Usage

```python
import vitaldb

# Load a local .vital file
vf = vitaldb.VitalFile("path/to/your/file.vital")

# Get track names
track_names = vf.get_track_names()
print(track_names)

# Get samples for a specific track
ecg_samples = vf.to_numpy('SNUADC/ECG_II', 1/500)
print(ecg_samples)

# Convert to pandas DataFrame
df = vf.to_pandas(['SNUADC/ECG_II', 'Solar8000/HR'], 1)
print(df.head())
```

### VitalDB Open Dataset API

Access the VitalDB open dataset containing 6,388 surgical cases:

```python
import vitaldb

# Find cases with specific tracks
caseids = vitaldb.find_cases("SNUADC/ECG_II,Solar8000/HR")

# Load case data
data = vitaldb.load_case(1, "SNUADC/ECG_II,Solar8000/HR", interval=1.0)

# Load clinical data
clinical_df = vitaldb.load_clinical_data()

# Load lab data
lab_df = vitaldb.load_lab_data()

# Get all available track names
tracks = vitaldb.get_track_names()
```

### MCP Server

VitalDB provides an MCP server for integration with AI assistants like Claude:

```bash
# Run as MCP server
vitaldb
```

Configure in your MCP client (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "vitaldb": {
      "command": "vitaldb"
    }
  }
}
```

Available MCP tools:
- `find_cases` - Find cases with specific track names
- `load_case` - Load case data from VitalDB open dataset
- `load_clinical_data` - Load clinical information
- `load_lab_data` - Load lab results
- `get_track_names` - Get available track names
- `read_vital` - Read local .vital files
- `get_vital_track_names` - Get track names from local file
- `vital_to_csv` - Convert .vital to CSV
- `login` - Login to VitalDB server
- `filelist` / `tracklist` / `receive` - Server data access

Refer to the `python/examples` directory for more usage examples.

## C++

The C++ code provides core utilities for performance-critical tasks like file parsing and data processing.

### Building

Requires a C++ compiler and zlib library:

```bash
# Linux/macOS (g++)
g++ -o vital_list C++/vital_list.cpp -lz

# Windows (MSVC - Visual Studio command prompt)
cl vital_list.cpp /link zlib.lib
```

### Usage

```bash
./vital_list path/to/your/file.vital
```

Refer to the C++ source files for specific utility usage.

## Javascript / Web Viewer

Browser-based visualization tool for .vital files with drag-and-drop interface.

### Setup

```bash
cd vitalfile_webviewer
npm install
node build-bundle.js
```

### Usage

Open `vitalfile_webviewer.html` in your browser and drag-drop a .vital file to visualize tracks.

Features:
- Drag-and-drop file loading
- Monitor view and track view modes
- Canvas-based waveform rendering

## R

R scripts for data analysis and visualization.

### Usage

```bash
Rscript R/load_vital.r path/to/your/file.vital
```

## Win32

Windows-specific GUI utilities. Build using Visual Studio.

## Documentation

Full documentation available at: https://vitaldb.github.io/vitalutils

For the .vital file format specification, see `Vital File Format.pdf`.

## License

MIT License - see [LICENSE](LICENSE) for details.
