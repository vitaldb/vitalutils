/**
 * VitalFileManager Module
 * Manages the lifecycle of VitalFile instances
 */
import { VitalFile } from './vital-file.js';

/**
 * VitalFileManager class
 * Responsible for creating, loading, and managing VitalFile instances
 */
export class VitalFileManager {
    constructor() {
        this.files = {};         // Store loaded files by filename
        this.currentFile = null; // Reference to the currently active file
    }

    /**
     * Load a vital file and parse it
     * @param {File} file - The file object to load
     * @param {Function} progressCallback - Callback for loading progress updates
     * @param {Function} successCallback - Callback for successful loading
     * @param {Function} errorCallback - Callback for loading errors
     */
    loadVitalFile(file, progressCallback, successCallback, errorCallback) {
        const filename = file.name;

        // Check if we've already loaded this file
        if (this.files[filename]) {
            this.currentFile = this.files[filename];

            // Simply display the file if it's already loaded
            this.currentFile.draw('track');
            if (successCallback) successCallback();
            return;
        }

        // Read the file as ArrayBuffer
        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                // Create a blob from the array buffer
                const blob = new Blob([event.target.result]);

                // Create and parse the VitalFile
                const vitalFile = new VitalFile(blob, filename, progressCallback);

                // Store the file reference
                this.files[filename] = vitalFile;
                this.currentFile = vitalFile;

                // Call the success callback
                if (successCallback) successCallback();

                // Show the file in track view by default
                vitalFile.draw('track');
            } catch (error) {
                console.error(`Error parsing vital file: ${filename}`, error);
                if (errorCallback) errorCallback(error);
            }
        };

        reader.onerror = (event) => {
            console.error(`Error reading file: ${filename}`, event);
            if (errorCallback) errorCallback(new Error('Failed to read file.'));
        };

        // Start reading the file
        reader.readAsArrayBuffer(file);
    }

    /**
     * Switch the current view mode
     * @param {string} viewMode - The view mode to switch to ('track' or 'moni')
     */
    switchView(viewMode) {
        if (!this.currentFile) return;

        this.currentFile.draw(viewMode);
    }

    /**
     * Clear all loaded files
     */
    clearFiles() {
        this.files = {};
        this.currentFile = null;
    }
}