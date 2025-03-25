/**
 * Main application entry point
 * Initializes the Vital File Viewer and coordinates modules
 */
import { initFileHandler } from './file-handler.js';
import { initUIController } from './ui-controller.js';
import { VitalFileManager } from './vital-file-manager.js';
import { showError } from './utils.js';

// Global application state
const app = {
    currentView: null, // 'track' or 'moni'
    vitalFileManager: null,
    isInitialized: false
};

/**
 * Initialize the application
 */
function initApp() {
    if (app.isInitialized) return;

    try {
        // Initialize the VitalFileManager
        app.vitalFileManager = new VitalFileManager();

        // Initialize UI components
        initUIController(app);

        // Initialize file drop and input handler
        initFileHandler(app);

        // Set up window resize handler
        window.addEventListener('resize', handleResize);

        // Set up error handling
        window.addEventListener('error', (event) => {
            console.error('Application error:', event.error);
            showError('An unexpected error occurred: ' + event.error.message);
        });

        // Check browser compatibility
        checkCompatibility();

        // Mark as initialized
        app.isInitialized = true;

        console.log('Vital File Viewer initialized');
    } catch (error) {
        console.error('Failed to initialize application:', error);
        showError('Failed to initialize application: ' + error.message);
    }
}

/**
 * Handle window resize events
 */
function handleResize() {
    if (!app.vitalFileManager || !app.vitalFileManager.currentFile) return;

    if (app.currentView === 'track') {
        app.vitalFileManager.currentFile.resizeTrackView();
    } else if (app.currentView === 'moni') {
        app.vitalFileManager.currentFile.resizeMonitorView();
    }
}

/**
 * Check browser compatibility for required features
 */
function checkCompatibility() {
    // Check for Canvas support
    const canvas = document.createElement('canvas');
    const hasCanvas = !!(canvas.getContext && canvas.getContext('2d'));

    // Check for File API support
    const hasFileAPI = !!(window.File && window.FileReader && window.FileList && window.Blob);

    // Check for necessary Array methods
    const hasArrayMethods = !!(Array.prototype.forEach && Array.prototype.filter);

    if (!hasCanvas || !hasFileAPI || !hasArrayMethods) {
        showError('Your browser does not support all features required by this application. Please use a modern browser like Chrome, Firefox, Edge, or Safari.');
        return false;
    }

    return true;
}

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', initApp);

// Export the app object for use in other modules
export { app };