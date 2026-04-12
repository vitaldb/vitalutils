/**
 * playback-engine.js
 * Manages playback time, speed, looping for a single case
 */

class PlaybackEngine {
    constructor(duration) {
        this.duration = duration;
        this.playerTime = 0;
        this.speed = 1;
        this.isPaused = false;
        this._lastTimestamp = 0;
    }

    /**
     * Called each animation frame. Advances playerTime.
     * @param {number} now - performance.now() timestamp
     * @returns {number} current playerTime
     */
    tick(now) {
        if (this.isPaused || this.duration <= 0) return this.playerTime;

        if (this._lastTimestamp === 0) {
            this._lastTimestamp = now;
            return this.playerTime;
        }

        const delta = (now - this._lastTimestamp) / 1000 * this.speed;
        this._lastTimestamp = now;
        this.playerTime = (this.playerTime + delta) % this.duration;

        return this.playerTime;
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        this.isPaused = false;
        this._lastTimestamp = 0; // reset to avoid time jump
    }

    toggle() {
        if (this.isPaused) this.resume(); else this.pause();
    }

    setSpeed(s) {
        this.speed = s;
    }

    seekTo(seconds) {
        this.playerTime = Math.max(0, Math.min(this.duration, seconds));
        this._lastTimestamp = 0;
    }
}
