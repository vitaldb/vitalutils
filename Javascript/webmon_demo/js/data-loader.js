/**
 * data-loader.js
 * Fetches .vital files from api.vitaldb.net and parses them
 * Only reads the first MAX_BYTES of each file for fast loading
 */

const DataLoader = {
    /**
     * Load a single .vital file by case ID
     * Downloads entire file; parser limits waveform length per track
     * @param {number} caseId
     * @param {function} onProgress - callback(caseId, percent)
     * @returns {Promise<VitalFileParser>}
     */
    async loadCase(caseId, onProgress) {
        const url = `https://api.vitaldb.net/${caseId}.vital`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch case ${caseId}: ${response.status}`);

        const contentLength = parseInt(response.headers.get('content-length') || '0');
        const reader = response.body.getReader();
        const chunks = [];
        let received = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
            if (onProgress && contentLength > 0) {
                onProgress(caseId, Math.round(received / contentLength * 100));
            }
        }

        const combined = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }

        if (onProgress) onProgress(caseId, -1); // -1 = parsing
        const parser = new VitalFileParser();
        await parser.parse(combined.buffer);
        parser.caseId = caseId;
        parser.label = `Case ${caseId}`;

        return parser;
    },

    /**
     * Load multiple cases in parallel
     * @param {number[]} caseIds
     * @param {function} onProgress - callback(caseId, percent)
     * @returns {Promise<VitalFileParser[]>}
     */
    async loadCases(caseIds, onProgress) {
        const results = await Promise.allSettled(
            caseIds.map(id => this.loadCase(id, onProgress))
        );

        return results
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value);
    }
};
