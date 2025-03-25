/**
 * File handler module
 * Manages file input, drag & drop, and initial processing
 */
import { showLoading, hideLoading, updateLoadingProgress, showError } from './utils.js';

/**
 * Initialize file handling capabilities
 * @param {Object} app - The main application object
 */
export function initFileHandler(app) {
    const dropOverlay = document.getElementById('drop_overlay');
    const dropMessage = document.getElementById('drop_message');
    const fileInput = document.getElementById('file_input');

    // Click to select file
    dropMessage.addEventListener('click', () => {
        fileInput.click();
    });

    // File input change handler
    fileInput.addEventListener('change', (event) => {
        handleFiles(event.target.files, app);
    });

    // Drag and drop handlers
    document.addEventListener('dragenter', (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropOverlay.classList.add('active');
    });

    document.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.stopPropagation();
    });

    document.addEventListener('dragleave', (event) => {
        event.preventDefault();
        event.stopPropagation();

        // Only hide overlay when the cursor leaves the window
        if (event.clientX === 0 && event.clientY === 0) {
            dropOverlay.classList.remove('active');
        }
    });

    document.addEventListener('drop', (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropOverlay.classList.remove('active');

        const files = event.dataTransfer.files;
        if (files.length > 0) {
            handleFiles(files, app);
        }
    });

    // Error message dismiss button
    document.getElementById('error-dismiss')?.addEventListener('click', () => {
        document.getElementById('error-message').classList.add('hidden');
    });
}

/**
 * Process file input
 * @param {FileList} files - The list of files to process
 * @param {Object} app - The main application object
 */
function handleFiles(files, app) {
    if (!files || files.length === 0) return;

    const file = files[0];

    // Validate file extension
    if (!file.name.toLowerCase().endsWith('.vital')) {
        showError('Only .vital files are allowed.');
        return;
    }

    // Show loading indicator
    showLoading(file.name);

    try {
        // Process the file
        app.vitalFileManager.loadVitalFile(file,
            // Progress callback
            (progress) => {
                updateLoadingProgress(progress);
            },
            // Success callback
            () => {
                hideLoading();
                // Hide the drop message
                document.getElementById('drop_message').style.display = 'none';
            },
            // Error callback
            (error) => {
                hideLoading();
                showError(`Failed to load file: ${error.message}`);
                console.error('File loading error:', error);
            }
        );
    } catch (error) {
        hideLoading();
        showError(`Failed to process file: ${error.message}`);
        console.error('File processing error:', error);
    }
}