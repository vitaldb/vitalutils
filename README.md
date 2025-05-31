# VitalUtils
https://vitaldb.github.io/vitalutils

This repository contains utilities and libraries for working with VitalDB files, implemented in various programming languages.

## Python

The Python library is the primary interface for interacting with VitalDB files in Python.

### Installation

You can install the Python library using pip:

```bash
pip install vitaldb
```

### Usage

You can import the `VitalFile` class and other utilities to read and process VitalDB files:

```python
from vitaldb import VitalFile

# Load a vital file
vf = VitalFile("path/to/your/file.vital")

# Get track names
track_names = vf.get_track_names()
print(track_names)

# Get samples for a specific track
# Replace 'SNUADC/ECG_II' with a track name from your file
ecg_samples = vf.to_numpy('SNUADC/ECG_II', 1/500)
print(ecg_samples)

# Convert to pandas DataFrame
df = vf.to_pandas(['SNUADC/ECG_II', 'Solar 8000M/HR'], 1)
print(df.head())
```

Refer to the `python/examples` directory for more usage examples.

## C++

The C++ code provides core utilities, likely for performance-critical tasks.

### Installation

Building the C++ utilities typically involves compiling the source code. You will need a C++ compiler (like g++ or MSVC) and potentially CMake.

```bash
# Example using g++ (Linux/macOS)
g++ -o vital_list C++/vital_list.cpp C++/Util.h C++/GZReader.h -lz

# Example using MSVC (Windows - requires Visual Studio command prompt)
cl vital_list.cpp /I. /link zlib.lib
```

Specific build instructions may vary depending on the utility and your system.

### Usage

The C++ code likely provides command-line executables. For example, `vital_list` might list tracks in a vital file:

```bash
./vital_list path/to/your/file.vital
```

Refer to the C++ source files for specific utility usage.

## Javascript

The Javascript code is used for web-based tools, such as the vitalfile web viewer.

### Installation

You can install Javascript dependencies using npm:

```bash
cd vitalfile_webviewer
npm install
```

### Usage

The Javascript code is typically used within a web browser. For the web viewer, you would likely open the `vitalfile_webviewer.html` file in a browser after building the bundle.

```bash
cd vitalfile_webviewer
npm run build-bundle
# Then open vitalfile_webviewer.html in your browser
```

Refer to the `vitalfile_webviewer` directory for more details.

## R

The R scripts are for data analysis and visualization.

### Installation

You will need to have R installed. You may need to install specific R packages depending on the script.

```R
# Example R package installation
install.packages("readr")
```

### Usage

You can run the R scripts using the R interpreter.

```bash
Rscript R/load_vital.r path/to/your/file.vital
```

Refer to the R scripts for specific usage instructions.

## Win32

The Win32 directory contains Windows-specific code, likely for a graphical utility.

### Installation

Building the Win32 application requires a Windows development environment, such as Visual Studio.

### Usage

The Win32 code likely results in an executable file that can be run on Windows.

Refer to the Win32 directory for more details on building and running the application.
