
//@ts-check
const percentile = require('percentile');

class MeasurementProvider {

    constructor(key, measurements) {
        this._durations = []
        for (let measurementKey of measurements.keys()) {
            if (measurementKey.indexOf(key) > -1) {
                this._durations.push(measurements.get(measurementKey).endTime - measurements.get(measurementKey).startTime)
            }
        }
    }

    average() {
        const sum = this._durations.reduce(((acc, cur) => acc += cur), 0)
        return Math.round(sum * 1000 / this._durations.length) / 1000
    }

    getPercentile(p) {
        return Math.round(percentile(p, this._durations) * 1000) / 1000
    }

    list() {
        return this._durations
    }

}

module.exports = MeasurementProvider
