# VitalFile Webviewer

A lightweight web-based viewer for .vital files that enables visualization of vital signs data with no server-side requirements.

## Features

- Drag and drop interface for easy file loading
- Support for multiple file selection and batch processing
- File history management with quick switching between loaded files
- Two viewing modes:
  - **Track View**: Displays all parameters in a traditional time-series format
  - **Monitor View**: Simulates a clinical patient monitor display
- Playback controls for Monitor View:
  - Play/pause functionality
  - Adjustable playback speed (1x, 2x, 4x, 6x)
  - Timeline scrubbing
  - Frame-by-frame navigation
- Responsive design that adapts to different screen sizes

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, or Edge)
- No server-side requirements - runs entirely in your browser

### Installation

1. Clone the repository or download the source code
2. No build process required - open `index.html` in your browser to run the application

### Usage

1. Open `index.html` in your web browser
2. Load .vital files using one of these methods:
   - Drag and drop one or more `.vital` files onto the designated area
   - Click "Select Files" to browse and select one or more files
3. Files will be loaded and the first one displayed in Track View mode by default
4. Use the file history dropdown to switch between loaded files
5. Use the buttons at the top to switch between viewing modes:
   - "Track View" - shows the traditional timeline view
   - "Monitor View" - shows the patient monitor simulation
6. In Track View mode, use the "Fit Width" or "100 Pixel/s" buttons to adjust the time scale
7. In Monitor View mode, use the playback controls at the bottom to navigate through the data

## File Structure

```
vitalfile_webviewer/
├── index.html              # Main HTML file
├── static/
│   ├── css/
│   ├── img/
│   └── js/
│       ├── lib/            # Third-party libraries
│       │   ├── jquery.min.js
│       │   └── pako.min.js     # Used for file decompression
│       └── app/            # Application JavaScript files
│           ├── constants.js    # Application constants and configuration
│           ├── utils.js        # Utility functions
│           ├── monitor-view.js # Monitor view implementation
│           ├── track-view.js   # Track view implementation
│           ├── vital-file.js   # .vital file parser implementation
│           ├── app.js          # Main application logic
│           └── main.js         # Entry point and script loader
```

## Key Components

### File Management

- **File History**: Maintains an in-memory collection of loaded files
- **Dropdown Menu**: Allows quick switching between previously loaded files
- **Multiple File Support**: Process batches of .vital files with progress tracking

### Views

- **Track View**: Traditional time-series display of all parameters
  - Supports zooming, panning, and different time scales
  - Shows device and parameter organization

- **Monitor View**: Clinical monitor simulation
  - Displays waveforms and parameter values in a monitor-like layout
  - Features playback controls for time navigation

## How It Works

1. The application loads one or more `.vital` files into the browser's memory
2. Files are processed asynchronously and stored in an in-memory collection
3. Each file is decompressed using the pako library
4. File data is parsed and organized into tracks and parameters
5. Depending on the selected view mode, the data is rendered to the canvas element:
   - Track View: Shows all parameters as time-series graphs
   - Monitor View: Renders a patient monitor display with waveforms and numeric values
6. Users can switch between files using the file history dropdown

## Code Architecture

The application follows a modular architecture:

- **Utils**: Core utility functions for data parsing and UI helpers
- **Monitor View**: Module for rendering and controlling the monitor display
- **Track View**: Module for rendering and interacting with the track timeline display
- **VitalFile**: Class handling file parsing and data organization
- **App**: Main application controller coordinating between modules
- **Constants**: Configuration values and layout definitions

## Technologies Used

- **HTML5 Canvas** for rendering graphics
- **JavaScript ES6+** for application logic
- **CSS3** for styling
- **jQuery** for DOM manipulation
- **Pako** for decompression of .vital files
- **Font Awesome** for icons

## Browser Compatibility

The application is compatible with the following browsers:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Performance Considerations

- Files are loaded and processed asynchronously to maintain UI responsiveness
- Large files are processed with progress indication
- Multiple files are handled sequentially to avoid memory issues
- Canvas rendering is optimized to maintain smooth playback

## License

This project is open-source and available under the MIT License.

## Acknowledgements

- Font Awesome for the icon set
- jQuery team for the jQuery library
- nodeca for the pako compression library

---

*Note: This viewer is intended for educational and research purposes only and should not be used for clinical diagnostics or patient care.*