//@ts-check
const {
    ipcRenderer
} = require('electron')

const TestBase = require('./TestBase')

class SyncToMainTest extends TestBase {

    sendMessage(key, payload) {
        ipcRenderer.sendSync(this.ipcChannel, key, payload)
    }

    async runTest() { // Async for consist return type
        this.start = performance.now()

        for (let i = 0; i < this.count; i++) {
            const key = this.getKey(i)
            const startTime = performance.now();
            this.sendMessage(key, this.getPayload())
            const endTime = performance.now();
            this.measurements.set(key, {startTime, endTime})
        }

        this.afterTest()
        return Promise.resolve()
    } 

    static async run(count) {
        const test = new SyncToMainTest(count, 'sync_to_main', 'synchronous-message')
        test.runTest()
    }
}

class AsyncToMainTest extends TestBase {
    static async run(count) {
        const test = new AsyncToMainTest(count, 'async_to_main', 'asynchronous-message')
        return test.runTest()
    }
}

class AsyncToOtherRendererTest extends TestBase {
    static async run(count) {
        const test = new AsyncToMainTest(count, 'async_to_other_renderer', 'asynchronous-message-proxy')
        return test.runTest()
    }
}

class AsyncSendToOtherRendererTest extends TestBase {

    async runTest() {
        this.webContentsId = ipcRenderer.sendSync('get-id', 'background')
        return super.runTest()
    }

    sendMessage(key, payload) {
        ipcRenderer.sendTo(this.webContentsId, this.ipcChannel, key, payload)
    }

    static async run(count) {
        const test = new AsyncSendToOtherRendererTest(count, 'async_send_to_other_renderer', 'asynchronous-message-send-to')
        test.runTest()
    }
}

class AsyncToIframeTest extends TestBase {
    async runTest() {
        this.iframeEl = document.getElementById('the_iframe');
        return super.runTest()
    }

    sendMessage(key, payload) {
        this.iframeEl.contentWindow.postMessage({ key, payload }, '*')
    }

    static async run(count) {
        const test = new AsyncToIframeTest(count, 'async_to_iframe')
        test.runTest()
    }
}

module.exports = {
    SyncToMainTest,
    AsyncToMainTest,
    AsyncToOtherRendererTest,
    AsyncSendToOtherRendererTest,
    AsyncToIframeTest
}
