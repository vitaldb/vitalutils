# Vital File Web Viewer

**Vital File Web Viewer** is a lightweight, browser-based tool for visualizing `.vital` files — a binary format used to store high-resolution vital signs data collected during surgery or intensive care. This tool provides an intuitive interface to explore `.vital` data on any operating system without the need for software installation or server-side components. It is intended for educational and research use.

---

## Features

- Cross-platform viewer with no installation required
- Drag-and-drop or file selection interface for `.vital` files
- Support for multiple file loading and in-memory file history
- Two viewing modes:
  - **Track View**: Time-series plots of all signal parameters
  - **Monitor View**: Simulated patient monitor layout with waveform playback
- Playback controls: play/pause, speed control, frame-by-frame navigation, timeline scrubbing
- Responsive layout adaptable to desktops, laptops, and tablets

---

## Getting Started

### Requirements

- A modern web browser:
  - Chrome (latest)
  - Firefox (latest)
  - Safari (latest)
  - Edge (latest)

### Installation

1. Download or clone the repository.
2. Open `vitalfile_webviewer.html` or `index.html` in your browser.
3. Load `.vital` files by drag-and-drop or by using the "Select Files" button.

---

## Usage

- Files are parsed directly in the browser; no internet connection is required.
- Switch between loaded files using the dropdown menu in the top-left corner.
- In **Track View**, you can zoom, pan, and change the time scale.
- In **Monitor View**, you can navigate the timeline using playback controls.
- All file processing is handled locally to ensure data confidentiality.

---

## How It Works

- Files are decompressed in-browser using the [Pako](https://github.com/nodeca/pako) library.
- Track data is parsed and rendered with HTML5 Canvas.
- Monitor View simulates a bedside monitor using waveform and numeric displays.
- UI interaction is handled via JavaScript and jQuery with asynchronous processing to ensure smooth performance.

---

## File Structure

```
vitalfile_webviewer/
├── index.html              # Main HTML file
├── build-bundle.js         # Script to bundle the app into a single HTML file
├── static/
│   ├── css/
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

### Build Process

The project includes a build script (`build-bundle.js`) that bundles the entire application into a single, self-contained HTML file:

- Combines and minifies all JavaScript files
- Inlines and minifies CSS
- Embeds small images as data URLs
- Produces `vitalfile_webviewer.html` that works without external dependencies

To build the bundled version:
```
node build-bundle.js
```

#### Usage Requirements:
- Node.js (v12 or higher)
- Required npm packages: 
  - terser
  - clean-css
  - cheerio
  - mime-types

#### Installation of Dependencies:
```
npm install terser clean-css cheerio mime-types
```

#### Customization:
You can adjust the build process by modifying these variables in `build-bundle.js`:
- `JS_ORDER`: Controls the order of JavaScript files in the bundle
- `LIBS`: External libraries to include
- `EMBED_SIZE_LIMIT`: Maximum size (in KB) of files to embed as data URLs

---

## Technologies Used

- HTML5 / JavaScript (ES6+)
- CSS3 for layout and styling
- HTML5 Canvas for rendering
- [Pako](https://github.com/nodeca/pako) for decompression
- jQuery for DOM handling
- Font Awesome for interface icons

---

## Performance Notes

- Optimized for large `.vital` files with asynchronous loading
- No server latency or upload overhead
- Works entirely within the browser memory
- File handling is sequential to minimize memory usage

---

## Acknowledgements

- [Pako](https://github.com/nodeca/pako) for in-browser decompression
- [jQuery](https://jquery.com/) for UI utilities
- [Font Awesome](https://fontawesome.com/) for icons
- VitalDB Project (https://vitaldb.net)

---

## License

© 2025 Vital Lab.  
This project is licensed under the **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International Public License (CC BY-NC-SA 4.0)**.  
You may use, share, and adapt this software for non-commercial research and educational purposes, provided that appropriate credit is given and any derivative works are shared under the same license.

[Read the full license terms](https://creativecommons.org/licenses/by-nc-sa/4.0/)

---

*Disclaimer: This viewer is intended for research and educational use only. It is not suitable for clinical diagnosis or patient care.*