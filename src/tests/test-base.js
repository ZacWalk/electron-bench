const { ipcRenderer } = require('electron')
const { randomUUID } = require('node:crypto')
const { summarizeDurations } = require('../measurement-provider')
const { getPayload } = require('./payload')
const { scheduleMessages } = require('../bench-loop')

class TestBase {
    constructor(count, testKey, channel, options) {
        this.count = count
        this.testKey = testKey
        this.channel = channel
        this.options = options
        this.controller = new AbortController()
        this.pending = new Map()
        this.receiveReply = this.receiveReply.bind(this)
    }

    async runTest() {
        const { signal } = this.controller
        const { signal: runSignal, timeoutMs } = this.options
        const cancel = () => this.controller.abort(runSignal.reason)
        runSignal.addEventListener('abort', cancel, { once: true })
        if (runSignal.aborted) cancel()
        const timer = setTimeout(() => {
            const error = new Error('Benchmark timed out')
            error.name = 'BenchmarkTimeoutError'
            this.controller.abort(error)
        }, timeoutMs)
        const prefix = `${this.testKey}_${this.count}:${randomUUID()}:`
        let measurement
        let mainProcess

        try {
            signal.throwIfAborted()
            await this.prepare(signal)
            signal.throwIfAborted()
            await ipcRenderer.invoke('mainloop:begin')
            try {
                signal.throwIfAborted()
                measurement = await this.measure(prefix, signal)
                signal.throwIfAborted()
            } finally {
                mainProcess = await ipcRenderer.invoke('mainloop:end')
            }
        } catch (error) {
            throw signal.aborted ? signal.reason : error
        } finally {
            clearTimeout(timer)
            runSignal.removeEventListener('abort', cancel)
            this.pending.clear()
            this.cleanup()
        }

        const { durations, totalMs } = measurement
        if (durations.length !== this.count || durations.some((value) => !Number.isFinite(value) || value < 0)) {
            throw new Error(`Expected ${this.count} valid latency samples; received ${durations.length}.`)
        }
        return {
            totalMs,
            ...summarizeDurations(durations),
            mainProcess,
        }
    }

    prepare() {
        ipcRenderer.on('asynchronous-reply', this.receiveReply)
    }

    cleanup() {
        ipcRenderer.removeListener('asynchronous-reply', this.receiveReply)
    }

    receiveReply(_event, key) {
        const resolve = this.pending.get(key)
        if (resolve) {
            this.pending.delete(key)
            resolve()
        }
    }

    async measure(prefix, signal) {
        const start = performance.now()
        const durations = []
        const send = async (index) => {
            const key = `${prefix}${index}`
            const payload = this.options.payloadFactory ? this.options.payloadFactory() : getPayload()
            const sent = performance.now()
            await this.roundTrip(key, payload)
            if (!signal.aborted) durations.push(performance.now() - sent)
        }

        if (this.options.serial) {
            // Use the same cancellable scheduler even when only one reply can be pending.
            await scheduleMessages(1, 0, signal, async () => {
                for (let index = 0; index < this.count; index++) {
                    signal.throwIfAborted()
                    await send(index)
                }
            })
        } else {
            await scheduleMessages(this.count, this.options.spacingMs, signal, send)
        }

        return { durations, totalMs: Math.round(performance.now() - start) }
    }

    roundTrip(key, payload) {
        return new Promise((resolve) => {
            this.pending.set(key, resolve)
            this.sendMessage(key, payload)
        })
    }

    sendMessage(key, payload) {
        ipcRenderer.send(this.channel, key, payload)
    }
}

module.exports = TestBase
