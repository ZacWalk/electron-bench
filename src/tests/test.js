//@ts-check
const {
    ipcRenderer
} = require('electron')

const TestBase = require('./test-base')
const MeasurementProvider = require('../measurement-provider')
const payload = require('./payload')
const { write_to_table } = require('../dom')

/** @param {string} requestChannel @param {string} portChannel @param {string} errorChannel */
function requestPort(requestChannel, portChannel, errorChannel) {
    return new Promise((resolve, reject) => {
        ipcRenderer.once(portChannel, (event) => {
            resolve(event.ports[0])
        })

        ipcRenderer.once(errorChannel, (_event, message) => {
            reject(new Error(message))
        })

        ipcRenderer.send(requestChannel)
    })
}

function requestBackgroundPort() {
    return requestPort('request-background-port', 'background-port', 'background-port-error')
}

function requestUtilityPort() {
    return requestPort('request-utility-port', 'utility-port', 'utility-port-error')
}

class SyncToMainTest extends TestBase {

    // Uses the same drip schedule as every other scenario; the reply is just
    // synchronous, so it resolves inline instead of on an event.
    /** @param {string} key @param {any} payload */
    sendMessage(key, payload) {
        const reply = ipcRenderer.sendSync(/** @type {string} */ (this.ipcChannel), key, payload)
        const [replyKey, replyPayload] = Array.isArray(reply) ? reply : [key, undefined]
        this.processReply(null, replyKey, replyPayload)
    }
    static async run(count) {
        const test = new SyncToMainTest(count, 'sync_to_main', 'synchronous-message')
        return test.runTest()
    }
}

class AsyncToMainTest extends TestBase {
    /** @param {number} count */
    static async run(count) {
        const test = new AsyncToMainTest(count, 'async_to_main', 'asynchronous-message')
        return test.runTest()
    }
}

class AsyncInvokeToMainTest extends TestBase {
    async runTestBody() {
        this.registerActiveTest()
        this.start = performance.now()

        try {
            for (let i = 0; i < this.count; i++) {
                this.throwIfCancelled()
                this.promises.push(new Promise((resolve, reject) => {
                    this.pendingPromiseResolvers.add(resolve)

                    const timerId = setTimeout(() => {
                        this.pendingTimeouts.delete(timerId)

                        if (TestBase.isCancellationRequested()) {
                            this.pendingPromiseResolvers.delete(resolve)
                            resolve(undefined)
                            return
                        }

                        const key = this.getKey(i)
                        const wrappedResolve = () => {
                            this.pendingPromiseResolvers.delete(resolve)
                            resolve(undefined)
                        }

                        const messagePayload = this.getPayload()
                        this.saveResolver(key, wrappedResolve)

                        ipcRenderer.invoke(/** @type {string} */ (this.ipcChannel), key, messagePayload)
                            .then(([replyKey, replyPayload]) => {
                                this.processReply(null, replyKey, replyPayload)
                            })
                            .catch(reject)
                    }, i * this.milisMultiplier)

                    this.pendingTimeouts.add(timerId)
                }))
            }

            await Promise.all(this.promises)
            this.throwIfCancelled()
            return this.afterTest()
        } finally {
            this.cleanup()
            this.unregisterActiveTest()
        }
    }

    /** @param {number} count */
    static async run(count) {
        const test = new AsyncInvokeToMainTest(count, 'async_invoke_to_main', 'invoke-message')
        return test.runTest()
    }
}

class AsyncToOtherRendererTest extends TestBase {
    /** @param {number} count */
    static async run(count) {
        const test = new AsyncToOtherRendererTest(count, 'async_to_other_renderer', 'asynchronous-message-proxy')
        return test.runTest()
    }
}

class AsyncSendToOtherRendererTest extends TestBase {
    /** @param {string} key @param {any} payload */
    sendMessage(key, payload) {
        ipcRenderer.send(/** @type {string} */ (this.ipcChannel), key, payload)
    }

    /** @param {number} count */
    static async run(count) {
        const test = new AsyncSendToOtherRendererTest(count, 'async_send_to_other_renderer', 'asynchronous-message-send-to')
        return test.runTest()
    }
}

class AsyncMessagePortToOtherRendererTest extends TestBase {
    /** @param {number} count @param {string} testKey @param {string=} ipcChannel @param {{ payloadFactory?: () => any, transfer?: boolean, portRequest?: () => Promise<MessagePort> }=} options */
    constructor(count, testKey, ipcChannel, options) {
        super(count, testKey, ipcChannel, options)
        this.portRequest = (options && options.portRequest) || requestBackgroundPort
        this.processPortReply = this.processPortReply.bind(this)
    }

    /** @param {MessageEvent<{ key: string, payload: any }>} event */
    processPortReply(event) {
        const { key, payload } = event.data
        this.processReply(event, key, payload)
    }

    async runTestBody() {
        this.messagePort = await this.portRequest()
        this.messagePort.addEventListener('message', this.processPortReply)
        this.messagePort.start()

        try {
            return await super.runTestBody()
        } finally {
            this.messagePort.removeEventListener('message', this.processPortReply)
            this.messagePort.close()
        }
    }

    /** @param {string} key @param {any} payload */
    sendMessage(key, payload) {
        if (!this.messagePort) {
            return
        }

        if (this.transfer && payload instanceof ArrayBuffer) {
            this.messagePort.postMessage({ key, payload, transfer: true }, [payload])
            return
        }

        this.messagePort.postMessage({ key, payload })
    }

    /** @param {number} count */
    static async run(count) {
        const test = new AsyncMessagePortToOtherRendererTest(count, 'async_message_port_to_other_renderer')
        return test.runTest()
    }
}

class AsyncMessagePortToUtilityProcessTest extends AsyncMessagePortToOtherRendererTest {
    /** @param {number} count */
    static async run(count) {
        const test = new AsyncMessagePortToUtilityProcessTest(count, 'async_message_port_to_utility_process', undefined, {
            portRequest: requestUtilityPort,
        })
        return test.runTest()
    }
}

class PayloadTest extends AsyncMessagePortToOtherRendererTest {
    /** @param {number} count @param {string} testKey @param {string} profileKey @param {boolean=} transfer */
    static async runProfile(count, testKey, profileKey, transfer) {
        const test = new PayloadTest(count, testKey, undefined, {
            payloadFactory: payload.getPayloadFactory(profileKey),
            transfer: Boolean(transfer),
            serial: true,
        })
        return test.runTest()
    }
}

// Delegates the loop to a hidden window so the sandbox and contextBridge
// configuration under test is the window's, not this renderer's.
class RemoteWindowInvokeTest extends TestBase {
    /** @param {number} count @param {string} testKey @param {'bridge' | 'direct'} target */
    constructor(count, testKey, target) {
        super(count, testKey)
        this.target = target
    }

    async runTestBody() {
        this.registerActiveTest()

        try {
            this.throwIfCancelled()

            const result = await ipcRenderer.invoke('bench-window:run', {
                target: this.target,
                count: this.count,
                spacingMs: this.milisMultiplier,
                payload: this.getPayload(),
            })

            this.throwIfCancelled()

            const measurements = MeasurementProvider.fromDurations(result.durations)

            write_to_table(this.getKey(), result.totalMs)
            this.calculateAndShowPvalues(this.getKey(), measurements)

            return {
                totalMs: result.totalMs,
                averageMs: measurements.average(),
                percentiles: TestBase.getSummaryPercentiles(measurements),
                sampleCount: measurements.list().length,
            }
        } finally {
            this.cleanup()
            this.unregisterActiveTest()
        }
    }

    /** @param {number} count */
    static async runDirect(count) {
        const test = new RemoteWindowInvokeTest(count, 'unsandboxed_direct_invoke_to_main', 'direct')
        return test.runTest()
    }

    /** @param {number} count */
    static async runBridge(count) {
        const test = new RemoteWindowInvokeTest(count, 'sandboxed_bridge_invoke_to_main', 'bridge')
        return test.runTest()
    }
}

class AsyncToIframeTest extends TestBase {
    async runTestBody() {
        this.iframeEl = /** @type {HTMLIFrameElement | null} */ (document.getElementById('the_iframe'));
        return super.runTestBody()
    }

    /** @param {string} key @param {any} payload */
    sendMessage(key, payload) {
        if (this.iframeEl && this.iframeEl.contentWindow) {
            this.iframeEl.contentWindow.postMessage({ key, payload }, '*')
        }
    }

    /** @param {number} count */
    static async run(count) {
        const test = new AsyncToIframeTest(count, 'async_to_iframe')
        return test.runTest()
    }
}

module.exports = {
    SyncToMainTest,
    AsyncToMainTest,
    AsyncInvokeToMainTest,
    AsyncToOtherRendererTest,
    AsyncSendToOtherRendererTest,
    AsyncMessagePortToOtherRendererTest,
    AsyncMessagePortToUtilityProcessTest,
    AsyncToIframeTest,
    PayloadTest,
    RemoteWindowInvokeTest
}
