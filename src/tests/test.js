const { ipcRenderer } = require('electron')
const { randomUUID } = require('node:crypto')
const TestBase = require('./test-base')
const { getPayloadFactory, getPayload } = require('./payload')

function requestPort(kind, signal) {
    return new Promise((resolve, reject) => {
        const id = randomUUID()
        const channel = `${kind}-port`
        const finish = (error, port) => {
            ipcRenderer.removeListener(channel, onReply)
            signal.removeEventListener('abort', onAbort)
            if (error) reject(error)
            else resolve(port)
        }
        const onReply = (event, replyId, error) => {
            if (replyId !== id) {
                event.ports?.[0]?.close()
                return
            }
            const port = event.ports?.[0]
            finish(error || !port ? new Error(error || 'Benchmark port was not returned.') : null, port)
        }
        const onAbort = () => {
            ipcRenderer.send('cancel-port-request', id)
            finish(signal.reason)
        }

        ipcRenderer.on(channel, onReply)
        signal.addEventListener('abort', onAbort, { once: true })
        ipcRenderer.send(`request-${channel}`, id)
    })
}

class SyncToMainTest extends TestBase {
    roundTrip(key, payload) {
        const reply = ipcRenderer.sendSync(this.channel, key, payload)
        if (reply?.[0] !== key) throw new Error('Unexpected synchronous reply.')
    }
}

class InvokeToMainTest extends TestBase {
    async roundTrip(key, payload) {
        const reply = await ipcRenderer.invoke(this.channel, key, payload)
        if (reply?.[0] !== key) throw new Error('Unexpected invoke reply.')
    }
}

class BackgroundRelayTest extends TestBase {
    async prepare(signal) {
        await new Promise((resolve, reject) => {
            const onAbort = () => reject(signal.reason)
            signal.addEventListener('abort', onAbort, { once: true })
            ipcRenderer.invoke('background:ready').then(resolve, reject).finally(() => {
                signal.removeEventListener('abort', onAbort)
            })
        })
        signal.throwIfAborted()
        super.prepare()
    }
}

class MessagePortTest extends TestBase {
    async prepare(signal) {
        this.port = await requestPort(this.channel, signal)
        await new Promise((resolve, reject) => {
            const onAbort = () => {
                this.port.onmessage = null
                reject(signal.reason)
            }
            if (signal.aborted) return onAbort()
            signal.addEventListener('abort', onAbort, { once: true })
            this.port.onmessage = (event) => {
                if (!event.data?.ready) return
                signal.removeEventListener('abort', onAbort)
                resolve()
            }
            this.port.start()
        })
        this.port.onmessage = (event) => this.receiveReply(event, event.data?.key)
    }

    cleanup() {
        if (this.port) {
            this.port.onmessage = null
            this.port.close()
        }
    }

    sendMessage(key, payload) {
        if (this.options.transfer) {
            this.port.postMessage({ key, payload, transfer: true }, [payload])
        } else {
            this.port.postMessage({ key, payload })
        }
    }
}

class IframeTest extends TestBase {
    async prepare(signal) {
        const frame = this.options.iframe
        if (!frame.dataset.ready) {
            await new Promise((resolve, reject) => {
                const onAbort = () => {
                    frame.removeEventListener('load', onLoad)
                    reject(signal.reason)
                }
                const onLoad = () => {
                    signal.removeEventListener('abort', onAbort)
                    resolve()
                }
                signal.addEventListener('abort', onAbort, { once: true })
                frame.addEventListener('load', onLoad, { once: true })
            })
        }
        this.iframe = frame.contentWindow
        this.onMessage = (event) => {
            if (event.source === this.iframe) this.receiveReply(event, event.data?.key)
        }
        window.addEventListener('message', this.onMessage)
    }

    cleanup() {
        if (this.onMessage) window.removeEventListener('message', this.onMessage)
    }

    sendMessage(key, payload) {
        this.iframe.postMessage({ key, payload }, '*')
    }
}

class RemoteWindowInvokeTest extends TestBase {
    prepare() {}
    cleanup() {}

    async measure(id, signal) {
        const cancel = () => ipcRenderer.send('bench-window:cancel', id)
        signal.addEventListener('abort', cancel, { once: true })
        try {
            return await ipcRenderer.invoke('bench-window:run', {
                id,
                target: this.channel,
                count: this.count,
                spacingMs: this.options.spacingMs,
                payload: getPayload(),
            })
        } finally {
            signal.removeEventListener('abort', cancel)
        }
    }
}

const routes = {
    sync_to_main: [SyncToMainTest, 'synchronous-message'],
    async_to_main: [TestBase, 'asynchronous-message'],
    async_invoke_to_main: [InvokeToMainTest, 'invoke-message'],
    async_to_other_renderer: [BackgroundRelayTest, 'asynchronous-message-proxy'],
    async_send_to_other_renderer: [BackgroundRelayTest, 'asynchronous-message-send-to'],
    async_message_port_to_other_renderer: [MessagePortTest, 'background'],
    async_message_port_to_utility_process: [MessagePortTest, 'utility'],
    async_to_iframe: [IframeTest],
    unsandboxed_direct_invoke_to_main: [RemoteWindowInvokeTest, 'direct'],
    sandboxed_bridge_invoke_to_main: [RemoteWindowInvokeTest, 'bridge'],
}

function runScenario(scenario, count, options) {
    if (scenario.payloadProfile) {
        return new MessagePortTest(count, scenario.key, 'background', {
            ...options,
            serial: true,
            transfer: scenario.transfer,
            payloadFactory: getPayloadFactory(scenario.payloadProfile),
        }).runTest()
    }
    const [Test, channel] = routes[scenario.key]
    return new Test(count, scenario.key, channel, options).runTest()
}

module.exports = { runScenario }
