/**
 * build-bundle.js
 * Script to bundle the entire VitalFile Webviewer application into a single HTML file
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const CleanCSS = require('clean-css');
const cheerio = require('cheerio');
const mime = require('mime-types');

// Configuration
const BASE_DIR = __dirname;
const OUTPUT_FILE = path.join(__dirname, 'vitalfile_webviewer.html');
const JS_ORDER = [
    'constants.js',
    'utils.js',
    'monitor-view.js',
    'track-view.js',
    'vital-file.js',
    'app.js'
];

// Libraries to include (paths relative to BASE_DIR)
const LIBS = [
    'static/js/lib/jquery.min.js',
    'static/js/lib/pako.min.js'
];

// Small files to embed as data URLs (under this size in KB)
const EMBED_SIZE_LIMIT = 50; // KB

// License information to include in the bundled file
const LICENSE_INFO = `
<!-- 
  License Information:
  © 2025 Vital Lab.
  This project is licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 
  International Public License (CC BY-NC-SA 4.0).
  You may use, share, and adapt this software for non-commercial research and educational purposes, 
  provided that appropriate credit is given and any derivative works are shared under the same license.
  
  Full license terms: https://creativecommons.org/licenses/by-nc-sa/4.0/
-->
`;

// Function to combine all app JavaScript files
async function combineAppJs() {
    let combinedCode = '';

    // Add a banner comment
    combinedCode += '/**\n';
    combinedCode += ' * VitalFile Webviewer - Combined JS\n';
    combinedCode += ' * Generated: ' + new Date().toISOString() + '\n';
    combinedCode += ' * © 2025 Vital Lab. Licensed under CC BY-NC-SA 4.0\n';
    combinedCode += ' */\n\n';

    // Add each file in the specified order
    for (const filename of JS_ORDER) {
        const filePath = path.join(BASE_DIR, 'static/js/app', filename);

        try {
            console.log(`Reading ${filename}...`);
            const fileContent = fs.readFileSync(filePath, 'utf8');

            // Add file separator comment
            combinedCode += `\n/* ${filename} */\n`;
            combinedCode += fileContent;
            combinedCode += '\n';
        } catch (error) {
            console.error(`Error reading file ${filename}:`, error);
            process.exit(1);
        }
    }

    return combinedCode;
}

// Function to minify JavaScript
async function minifyJs(code) {
    try {
        console.log('Minifying JavaScript...');
        const minifyOptions = {
            compress: {
                dead_code: true,
                drop_console: false,
                drop_debugger: true,
                keep_fargs: false,
                unused: true
            },
            mangle: true,
            output: {
                comments: /license|copyright|@preserve|@author/
            }
        };

        const minified = await minify(code, minifyOptions);
        return minified.code;
    } catch (error) {
        console.error('Error during JavaScript minification:', error);
        process.exit(1);
    }
}

// Function to combine and minify CSS
async function processCss() {
    try {
        console.log('Processing CSS...');
        const mainCssPath = path.join(BASE_DIR, 'static/css/style.css');
        const mainCss = fs.readFileSync(mainCssPath, 'utf8');

        // Minify CSS
        const minifier = new CleanCSS({
            level: 2,
            inline: ['all'],
            rebaseTo: path.join(BASE_DIR, 'static/css')
        });

        const minified = minifier.minify(mainCss);

        if (minified.errors.length > 0) {
            console.error('CSS minification errors:', minified.errors);
        }

        if (minified.warnings.length > 0) {
            console.warn('CSS minification warnings:', minified.warnings);
        }

        return minified.styles;
    } catch (error) {
        console.error('Error processing CSS:', error);
        process.exit(1);
    }
}

// Function to convert file to base64 data URL
function fileToDataUrl(filePath) {
    try {
        const fileContent = fs.readFileSync(filePath);
        const mimeType = mime.lookup(filePath) || 'application/octet-stream';
        return `data:${mimeType};base64,${fileContent.toString('base64')}`;
    } catch (error) {
        console.error(`Error converting file to data URL: ${filePath}`, error);
        return '';
    }
}

// Function to check if a file is small enough to embed
function shouldEmbed(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return stats.size < EMBED_SIZE_LIMIT * 1024;
    } catch (error) {
        return false;
    }
}

// Function to process HTML and embed resources
async function processHtml(js, css) {
    try {
        console.log('Processing HTML...');
        const htmlPath = path.join(BASE_DIR, 'index.html');
        const html = fs.readFileSync(htmlPath, 'utf8');

        // Load HTML into cheerio
        const $ = cheerio.load(html);

        // Add license information at the beginning of the HTML as a comment only
        $.root().prepend(LICENSE_INFO);

        // Remove existing CSS links and replace with inline CSS
        $('link[rel="stylesheet"]').remove();
        
        // No need for footer styles anymore
        $('head').append(`<style>${css}</style>`);

        // Remove existing script tags and add combined JS
        $('script').remove();

        // Add library scripts first, then app code
        let combinedLibJs = '';
        for (const lib of LIBS) {
            const libPath = path.join(BASE_DIR, lib);
            console.log(`Reading library: ${lib}`);
            combinedLibJs += fs.readFileSync(libPath, 'utf8') + '\n';
        }

        // Add all JS at the end of body
        $('body').append(`<script>${combinedLibJs}\n${js}</script>`);

        // Replace image references with data URLs where appropriate
        $('img').each((i, el) => {
            const src = $(el).attr('src');
            if (!src) return;

            const imgPath = path.join(BASE_DIR, src);
            if (shouldEmbed(imgPath)) {
                console.log(`Embedding image: ${src}`);
                $(el).attr('src', fileToDataUrl(imgPath));
            }
        });

        // Also find and update background images in style attributes
        $('[style*="background"]').each((i, el) => {
            const style = $(el).attr('style');
            if (!style) return;

            // Simple regex to extract url() values - not perfect but works for basic cases
            const bgMatch = style.match(/url\(['"]?([^'")]+)['"]?\)/);
            if (bgMatch && bgMatch[1]) {
                const imgPath = path.join(BASE_DIR, bgMatch[1]);
                if (shouldEmbed(imgPath)) {
                    console.log(`Embedding background image: ${bgMatch[1]}`);
                    const dataUrl = fileToDataUrl(imgPath);
                    const newStyle = style.replace(bgMatch[0], `url('${dataUrl}')`);
                    $(el).attr('style', newStyle);
                }
            }
        });
        
        // Remove any existing footer with license info
        $('.license-info, .license-footer').remove();
        $('footer').each((i, el) => {
            if ($(el).text().includes('Vital Lab') || $(el).text().includes('CC BY-NC-SA')) {
                $(el).remove();
            }
        });
        
        // Return the modified HTML
        return $.html();
    } catch (error) {
        console.error('Error processing HTML:', error);
        process.exit(1);
    }
}

// Main build process
async function buildBundle() {
    try {
        console.log('Starting bundling process...');

        // Process JavaScript
        console.log('Processing JavaScript...');
        const combinedJs = await combineAppJs();
        const minifiedJs = await minifyJs(combinedJs);

        // Process CSS
        const processedCss = await processCss();

        // Process HTML and embed resources
        const bundledHtml = await processHtml(minifiedJs, processedCss);

        // Write the bundled HTML file
        fs.writeFileSync(OUTPUT_FILE, bundledHtml);

        console.log(`Successfully created bundled file: ${OUTPUT_FILE}`);
        console.log(`File size: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2)} KB`);
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

// Run the build
buildBundle();