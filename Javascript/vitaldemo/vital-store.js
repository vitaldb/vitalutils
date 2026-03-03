/**
 * VitalStore - Loads vital files at startup and provides time-mapped data access
 * 
 * Core concept: "infinite loop" time mapping
 * - Each vital file has a duration (dtend - dtstart)
 * - Current wall-clock time is mapped into the file's time range using modulo
 * - This creates an infinite repeating loop of the file's data
 * 
 * Time mapping formula:
 *   elapsed = (now - serverStartTime) % fileDuration
 *   mappedTime = file.dtstart + elapsed
 */

const VitalFile = require("vitaldb-js");
const path = require("path");
const fs = require("fs");
const https = require("https");

class VitalStore {
    constructor() {
        /** @type {Map<string, object>} filename -> { vf, duration, tracks } */
        this.files = new Map();
        /** server start time (unix timestamp) - used as time reference for looping */
        this.serverStartTime = Date.now() / 1000;
    }

    /**
     * Download a .vital file from URL to local path
     */
    async _download(url, destPath) {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(destPath);
            https.get(url, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    // Follow redirect
                    file.close();
                    fs.unlinkSync(destPath);
                    this._download(res.headers.location, destPath).then(resolve).catch(reject);
                    return;
                }
                if (res.statusCode !== 200) {
                    file.close();
                    reject(new Error(`Download failed: ${res.statusCode} for ${url}`));
                    return;
                }
                res.pipe(file);
                file.on("finish", () => { file.close(); resolve(); });
                file.on("error", (err) => { fs.unlinkSync(destPath); reject(err); });
            }).on("error", (err) => {
                fs.unlinkSync(destPath);
                reject(err);
            });
        });
    }

    /**
     * Load vital files from remote URLs
     * @param {string[]} urls - array of .vital file URLs
     * @param {string} cacheDir - local directory to cache downloaded files
     */
    async loadFromUrls(urls, cacheDir = "./cache") {
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        for (const url of urls) {
            const filename = path.basename(url);
            const localPath = path.join(cacheDir, filename);

            // Download if not cached
            if (!fs.existsSync(localPath)) {
                console.log(`Downloading ${url} ...`);
                try {
                    await this._download(url, localPath);
                    console.log(`  -> Saved to ${localPath}`);
                } catch (err) {
                    console.error(`  -> Failed to download ${url}: ${err.message}`);
                    continue;
                }
            } else {
                console.log(`Using cached ${localPath}`);
            }

            // Parse vital file
            try {
                console.log(`Parsing ${filename} ...`);
                const vf = await new VitalFile(null, localPath);
                const duration = vf.dtend - vf.dtstart;

                if (duration <= 0) {
                    console.warn(`  -> Skipping ${filename}: invalid duration (${duration}s)`);
                    continue;
                }

                // Pre-process: build sorted record arrays per track for fast lookup
                const tracks = {};
                for (const tid in vf.trks) {
                    const trk = vf.trks[tid];
                    if (trk._excluded || trk.recs.length === 0) continue;

                    // Sort records by time
                    trk.recs.sort((a, b) => a.dt - b.dt);
                    tracks[trk.dtname] = trk;
                }

                this.files.set(filename, {
                    vf,
                    duration,
                    tracks,
                    dtstart: vf.dtstart,
                    dtend: vf.dtend,
                    dgmt: vf.dgmt,
                });

                const trackCount = Object.keys(tracks).length;
                const recCount = Object.values(tracks).reduce((s, t) => s + t.recs.length, 0);
                console.log(`  -> Loaded: ${trackCount} tracks, ${recCount} records, duration=${duration.toFixed(1)}s`);
            } catch (err) {
                console.error(`  -> Failed to parse ${filename}: ${err.message}`);
            }
        }

        console.log(`\nTotal ${this.files.size} files loaded. Server start time: ${new Date(this.serverStartTime * 1000).toISOString()}`);
    }

    /**
     * Map a wall-clock time to a file's internal time using modulo looping
     * @param {string} filename
     * @param {number} wallTime - unix timestamp
     * @returns {number} mapped time within the file's range
     */
    mapTime(filename, wallTime) {
        const file = this.files.get(filename);
        if (!file) return 0;

        const elapsed = wallTime - this.serverStartTime;
        const loopedElapsed = ((elapsed % file.duration) + file.duration) % file.duration;
        return file.dtstart + loopedElapsed;
    }

    /**
     * Get file list (compatible with VitalDB filelist API)
     * @returns {Array}
     */
    getFileList() {
        const result = [];
        for (const [filename, file] of this.files) {
            result.push({
                filename,
                dtstart: new Date(file.dtstart * 1000).toISOString(),
                dtend: new Date(file.dtend * 1000).toISOString(),
                duration: file.duration,
                tracks: Object.keys(file.tracks),
            });
        }
        return result;
    }

    /**
     * Get track list for a file (compatible with VitalDB tracklist API)
     * @param {string} filename
     * @returns {object|null}
     */
    getTrackList(filename) {
        const file = this.files.get(filename);
        if (!file) return null;

        const trks = [];
        for (const [dtname, trk] of Object.entries(file.tracks)) {
            trks.push({
                name: dtname,
                type: trk.type === 1 ? "wav" : trk.type === 2 ? "num" : "str",
                srate: trk.srate,
                unit: trk.unit,
                color: formatColor(trk.col),
                montype: trk.montype,
                mindisp: trk.mindisp,
                maxdisp: trk.maxdisp,
            });
        }
        return { filename, trks };
    }

    /**
     * Get data in VitalDB receive API compatible format
     * Maps current wall-clock time range to file data with infinite looping
     * 
     * @param {string} filename - vital file name
     * @param {number} dtstart - wall-clock start time (unix timestamp)
     * @param {number} dtend - wall-clock end time (unix timestamp)
     * @param {string} [trackFilter] - optional track name filter
     * @returns {object|null} VitalDB-compatible response
     */
    receive(filename, dtstart, dtend, trackFilter = null) {
        const file = this.files.get(filename);
        if (!file) return null;

        const requestDuration = dtend - dtstart;

        // Safety: limit max request duration to 10x file duration
        if (requestDuration > file.duration * 10) {
            return { error: "Requested time range too large" };
        }

        const trks = [];
        const trackEntries = trackFilter
            ? Object.entries(file.tracks).filter(([name]) => name === trackFilter || name.endsWith("/" + trackFilter))
            : Object.entries(file.tracks);

        for (const [dtname, trk] of trackEntries) {
            const recs = this._getRecordsInRange(file, trk, dtstart, dtend);
            if (recs.length === 0) continue;

            const trkData = {
                name: dtname,
                type: trk.type === 1 ? "wav" : trk.type === 2 ? "num" : "str",
                srate: trk.srate || 0,
                unit: trk.unit || "",
                color: formatColor(trk.col),
                recs: recs,
            };
            trks.push(trkData);
        }

        return {
            filename,
            dtstart,
            dtend,
            mapped_dtstart: this.mapTime(filename, dtstart),
            mapped_dtend: this.mapTime(filename, dtend),
            file_duration: file.duration,
            trks,
        };
    }

    /**
     * Get records within a wall-clock time range, handling loop wrapping
     * @private
     */
    _getRecordsInRange(file, trk, wallStart, wallEnd) {
        const results = [];
        const requestDuration = wallEnd - wallStart;

        // We iterate through the request window in small steps
        // Each step maps wall-clock time to file time
        let currentWall = wallStart;

        while (currentWall < wallEnd) {
            const mappedStart = this.mapTime(file.vf.dtstart ? 
                [...this.files.entries()].find(([, f]) => f === file)?.[0] : "", currentWall);
            
            // Find how much time until we hit the end of the file (loop boundary)
            const elapsed = ((currentWall - this.serverStartTime) % file.duration + file.duration) % file.duration;
            const timeToLoopEnd = file.duration - elapsed;
            const chunkEnd = Math.min(currentWall + timeToLoopEnd, wallEnd);
            const mappedEnd = file.dtstart + ((elapsed + (chunkEnd - currentWall)));

            // Find records in this mapped range
            for (const rec of trk.recs) {
                if (rec.dt >= mappedStart && rec.dt < mappedEnd) {
                    // Remap the record time back to wall-clock time
                    const offsetInFile = rec.dt - mappedStart;
                    const wallDt = currentWall + offsetInFile;

                    if (trk.type === 1) {
                        // WAV: convert TypedArray to regular array
                        results.push({
                            dt: wallDt,
                            val: Array.from(rec.val),
                        });
                    } else if (trk.type === 2) {
                        // NUM
                        results.push({ dt: wallDt, val: rec.val });
                    } else {
                        // STR
                        results.push({ dt: wallDt, val: rec.val });
                    }
                }
            }

            currentWall = chunkEnd;
        }

        return results;
    }
}

function formatColor(col) {
    const r = (col >> 16) & 0xFF;
    const g = (col >> 8) & 0xFF;
    const b = col & 0xFF;
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();
}

module.exports = VitalStore;
