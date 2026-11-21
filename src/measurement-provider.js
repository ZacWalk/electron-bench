const percentile = require('percentile')
const ranks = [1, 25, 50, 75, 90, 99, 100]
const roundMs = (ms) => Math.round(ms * 1000) / 1000

/** @param {number[]} durations */
function summarizeDurations(durations) {
    const sum = durations.reduce((total, duration) => total + duration, 0)
    const values = percentile(ranks, durations)
    return {
        averageMs: roundMs(sum / durations.length),
        percentiles: Object.fromEntries(ranks.map((rank, index) => [`p${rank}`, roundMs(values[index])])),
        sampleCount: durations.length,
    }
}

module.exports = { summarizeDurations }
