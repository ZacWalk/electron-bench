//@ts-check
const {
    ipcRenderer
} = require('electron')

const TestBase = require('./test-base')

function requestBackgroundPort() {
    return new Promise((resolve, reject) => {
        ipcRenderer.once('background-port', (event) => {
            resolve(event.ports[0])
        })

        ipcRenderer.once('background-port-error', (_event, message) => {
            reject(new Error(message))
        })

        ipcRenderer.send('request-background-port')
    })
}

class SyncToMainTest extends TestBase {

    /** @param {string} key @param {any} payload */
    sendMessage(key, payload) {
        ipcRenderer.sendSync(/** @type {string} */ (this.ipcChannel), key, payload)
    }

    async runTest() { // Async for consistant return type
        this.registerActiveTest()
        this.start = performance.now()
        try {
            for (let i = 0; i < this.count; i++) {
                this.throwIfCancelled()

                const key = this.getKey(i)
                const startTime = performance.now();
                this.sendMessage(key, this.getPayload())
                const endTime = performance.now();
                this.measurements.set(key, {startTime, endTime})
            }

            return this.afterTest()
        } finally {
            this.cleanup()
            this.unregisterActiveTest()
        }
    } 

    /** @param {number} count */
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
    async runTest() {
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

                        this.saveResolver(key, wrappedResolve)

                        ipcRenderer.invoke(/** @type {string} */ (this.ipcChannel), key, this.getPayload())
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
    /** @param {number} count @param {string} testKey @param {string=} ipcChannel */
    constructor(count, testKey, ipcChannel) {
        super(count, testKey, ipcChannel)
        this.processPortReply = this.processPortReply.bind(this)
    }

    /** @param {MessageEvent<{ key: string, payload: any }>} event */
    processPortReply(event) {
        const { key, payload } = event.data
        this.processReply(event, key, payload)
    }

    async runTest() {
        this.messagePort = await requestBackgroundPort()
        this.messagePort.addEventListener('message', this.processPortReply)
        this.messagePort.start()

        try {
            return await super.runTest()
        } finally {
            this.messagePort.removeEventListener('message', this.processPortReply)
            this.messagePort.close()
        }
    }

    /** @param {string} key @param {any} payload */
    sendMessage(key, payload) {
        if (this.messagePort) {
            this.messagePort.postMessage({ key, payload })
        }
    }

    /** @param {number} count */
    static async run(count) {
        const test = new AsyncMessagePortToOtherRendererTest(count, 'async_message_port_to_other_renderer')
        return test.runTest()
    }
}

class AsyncToIframeTest extends TestBase {
    async runTest() {
        this.iframeEl = /** @type {HTMLIFrameElement | null} */ (document.getElementById('the_iframe'));
        return super.runTest()
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
    AsyncToIframeTest
}
