//@ts-check
const MeasurementProvider = require('../measurement-provider');
const payload = require('./payload')
const {
    ipcRenderer
} = require('electron')
const {
    write_to_table,
    writeMeasuresToTable
} = require('../dom')

const activeTests = new Set()
let cancellationRequested = false

function createCancellationError() {
    const error = new Error('Benchmark run cancelled')
    error.name = 'BenchmarkRunCancelledError'
    return error
}

function beginTestRun() {
    cancellationRequested = false
}

function requestCancellation() {
    cancellationRequested = true
    activeTests.forEach((test) => test.cancel())
}

function isCancellationRequested() {
    return cancellationRequested
}

/** @param {unknown} error */
function isCancellationError(error) {
    return error instanceof Error && error.name === 'BenchmarkRunCancelledError'
}

function getSummaryPercentiles(measurements) {
    return {
        p1: measurements.getPercentile(1),
        p25: measurements.getPercentile(25),
        p50: measurements.getPercentile(50),
        p75: measurements.getPercentile(75),
        p90: measurements.getPercentile(90),
        p99: measurements.getPercentile(99),
        p100: measurements.getPercentile(100),
    }
}

class TestBase {

    /** @param {number} count @param {string} testKey @param {string=} ipcChannel */
    constructor(count, testKey, ipcChannel) {
        this.count = count
        this.testKey = testKey
        this.ipcChannel = ipcChannel
        /** @type {Promise<void>[]} */
        this.promises = []
        this.measurements = new Map
        this.resolvers = new Map
        this.pendingPromiseResolvers = new Set
        this.pendingTimeouts = new Set

        this.processReply = this.processReply.bind(this)
        this.processWindowMessage = this.processWindowMessage.bind(this)

        ipcRenderer.on('asynchronous-reply', this.processReply)
        window.addEventListener('message', this.processWindowMessage)

        const millisInput = /** @type {HTMLInputElement | null} */ (document.getElementById('milisMultiplier'))
        this.milisMultiplier = parseFloat(millisInput ? millisInput.value : '1')

        this.milisMultiplier = this.milisMultiplier === undefined ? 1 : this.milisMultiplier
    }

    registerActiveTest() {
        activeTests.add(this)
    }

    unregisterActiveTest() {
        activeTests.delete(this)
    }

    cleanup() {
        ipcRenderer.removeListener('asynchronous-reply', this.processReply)
        window.removeEventListener('message', this.processWindowMessage)
    }

    throwIfCancelled() {
        if (cancellationRequested) {
            throw createCancellationError()
        }
    }

    cancel() {
        this.pendingTimeouts.forEach((timerId) => clearTimeout(timerId))
        this.pendingTimeouts.clear()

        this.pendingPromiseResolvers.forEach((resolve) => resolve())
        this.pendingPromiseResolvers.clear()

        this.resolvers.forEach((resolve) => resolve())
        this.resolvers.clear()
    }

    /** @param {MessageEvent<{ key: string, payload: any }>} e */
    processWindowMessage(e) {
        let { key, payload } = e.data;
        this.processReply(e, key, payload)
    }

    /** @param {unknown} event @param {string} key @param {any} payload */
    processReply(event, key, payload) {
        if (typeof payload === 'string') {
            JSON.parse(payload)
        }

        const measurement = this.measurements.get(key)
        if (measurement) {
            this.measurements.set(key, Object.assign(measurement, {
                endTime: performance.now()
            }))
        }

        const resolver = this.resolvers.get(key)
        if (resolver) {
            resolver()
            this.resolvers.delete(key);
        }
    }

    /** @param {string} key @param {() => void} resolver */
    saveResolver(key, resolver) {
        this.measurements.set(key, {
            startTime: performance.now()
        })
        this.resolvers.set(key, resolver)
    }

    /** @param {string} key @param {MeasurementProvider=} measures */
    calculateAndShowPvalues(key, measures) {
        if (!key) return;

        const showPercentage = /** @type {HTMLInputElement | null} */ (document.getElementById('show_percentage'))
        const shouldMeasure = showPercentage ? showPercentage.checked : false
        if (!shouldMeasure) return

        writeMeasuresToTable(key, measures || new MeasurementProvider(key, this.measurements))
    }

    getPayload() {
        const stringifyInput = /** @type {HTMLInputElement | null} */ (document.getElementById('stringify_json'))
        const stringify = stringifyInput ? stringifyInput.checked : false
        return stringify ? JSON.stringify(payload.getPayload()) : payload.getPayload()
    }

    /** @param {number=} i */
    getKey(i) {
        if (i) {
            return this.testKey + "_" + this.count + "_" + i
        } else {
            return this.testKey + '_' + this.count
        }
    }

    afterTest() {
        if (typeof this.start !== 'number') {
            return
        }

        const time = Math.round(performance.now() - this.start);
        const measurementSummary = new MeasurementProvider(this.getKey(), this.measurements)

        write_to_table(this.getKey(), time);

        this.calculateAndShowPvalues(this.getKey(), measurementSummary)

        return {
            totalMs: time,
            averageMs: measurementSummary.average(),
            percentiles: getSummaryPercentiles(measurementSummary),
            sampleCount: measurementSummary.list().length,
        }
    }

    /** @param {string} key @param {any} payload */
    sendMessage(key, payload) {
        if (this.ipcChannel) {
            ipcRenderer.send(this.ipcChannel, key, payload)
        }
    }

    async runTest() {
        this.registerActiveTest()
        this.start = performance.now()
        try {
            for (let i = 0; i < this.count; i++) {
                this.throwIfCancelled()
                this.promises.push(new Promise((resolve) => {
                    this.pendingPromiseResolvers.add(resolve)

                    const timerId = setTimeout(() => {
                        this.pendingTimeouts.delete(timerId)

                        if (cancellationRequested) {
                            this.pendingPromiseResolvers.delete(resolve)
                            resolve(undefined)
                            return
                        }

                        const wrappedResolve = () => {
                            this.pendingPromiseResolvers.delete(resolve)
                            resolve(undefined)
                        }

                        this.saveResolver(this.getKey(i), wrappedResolve)
                        this.sendMessage(this.getKey(i), this.getPayload())
                    }, i * this.milisMultiplier)

                    this.pendingTimeouts.add(timerId)
                }))
            }

            await Promise.all(this.promises);
            this.throwIfCancelled()

            return this.afterTest()
        } finally {
            this.cleanup()
            this.unregisterActiveTest()
        }
    }
}

module.exports = TestBase
module.exports.beginTestRun = beginTestRun
module.exports.requestCancellation = requestCancellation
module.exports.isCancellationRequested = isCancellationRequested
module.exports.createCancellationError = createCancellationError
module.exports.isCancellationError = isCancellationError
