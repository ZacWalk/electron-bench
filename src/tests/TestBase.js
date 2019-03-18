//@ts-check
const MeasurementProvider = require('../MeasurementProvider');
const json = require('./payload')
const {
    ipcRenderer
} = require('electron')
const {
    write_to_table,
    writeMeasuresToTable
} = require('../dom')

class TestBase {

    constructor(count, testKey, ipcChannel) {
        this.count = count
        this.testKey = testKey
        this.ipcChannel = ipcChannel
        this.promises = []
        this.measurements = new Map
        this.resolvers = new Map

        this.processReply = this.processReply.bind(this)
        this.processWindowMessage = this.processWindowMessage.bind(this)

        ipcRenderer.on('asynchronous-reply', this.processReply)
        window.addEventListener('message', this.processWindowMessage)
    }

    processWindowMessage(e) {
        let { key, payload } = e.data;
        this.processReply(e, key, payload)
    }

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

    saveResolver(key, resolver) {
        this.measurements.set(key, {
            startTime: performance.now()
        })
        this.resolvers.set(key, resolver)
    }

    calculateAndShowPvalues(key) {
        if (!key) return;

        const shouldMeasure = document.getElementById("show_percentage").checked
        if (!shouldMeasure) return

        writeMeasuresToTable(key, new MeasurementProvider(key, this.measurements))
    }

    getPayload() {
        const stringify = document.getElementById("stringify_json").checked
        return stringify ? JSON.stringify(json) : json
    }

    getKey(i) {
        if (i) {
            return this.testKey + "_" + this.count + "_" + i
        } else {
            return this.testKey + '_' + this.count
        }
    }

    afterTest() {
        const time = Math.round(performance.now() - this.start);
        write_to_table(this.getKey(), time);

        this.calculateAndShowPvalues(this.getKey())

        ipcRenderer.removeListener('asynchronous-reply', this.processReply)
        window.removeEventListener('message', this.processWindowMessage)
    }

    sendMessage(key, payload) {
        ipcRenderer.send(this.ipcChannel, key, payload)
    }

    async runTest() {
        this.start = performance.now()
        for (let i = 0; i < this.count; i++) {
            this.promises.push(new Promise((resolve) => {
                setTimeout(() => {
                    this.saveResolver(this.getKey(i), resolve);
                    this.sendMessage(this.getKey(i), this.getPayload())
                }, i + 1);
            }))
        }

        await Promise.all(this.promises);

        this.afterTest()
        return
    }
}

module.exports = TestBase
