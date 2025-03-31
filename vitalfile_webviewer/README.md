# VitalFile Webviewer

A lightweight web-based viewer for .vital files that enables visualization of vital signs data with no server-side requirements.

## Features

- Drag and drop interface for easy file loading
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
2. Drag and drop a `.vital` file onto the designated area, or click "Select File" to browse your device
3. The file will be loaded and displayed in Track View mode by default
4. Use the buttons at the top to switch between viewing modes:
   - "Track View" - shows the traditional timeline view
   - "Monitor View" - shows the patient monitor simulation
5. In Track View mode, use the "Fit Width" or "100 Pixel/s" buttons to adjust the time scale
6. In Monitor View mode, use the playback controls at the bottom to navigate through the data

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

## How It Works

1. The application loads a `.vital` file into the browser's memory
2. The file is decompressed using the pako library
3. File data is parsed and organized into tracks and parameters
4. Depending on the selected view mode, the data is rendered to the canvas element:
   - Track View: Shows all parameters as time-series graphs
   - Monitor View: Renders a patient monitor display with waveforms and numeric values

## Technologies Used

- **HTML5 Canvas** for rendering graphics
- **JavaScript** for application logic
- **CSS** for styling
- **jQuery** for DOM manipulation
- **Pako** for decompression of .vital files

## Browser Compatibility

The application is compatible with the following browsers:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

This project is open-source and available under the MIT License.

## Acknowledgements

- Font Awesome for the icon set
- jQuery team for the jQuery library
- nodeca for the pako compression library

---

*Note: This viewer is intended for educational and research purposes only and should not be used for clinical diagnostics or patient care.*