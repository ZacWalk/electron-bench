//@ts-check
const { ipcRenderer } = require('electron')
const {
  SyncToMainTest,
  AsyncToMainTest,
  AsyncInvokeToMainTest,
  AsyncToOtherRendererTest,
  AsyncSendToOtherRendererTest,
  AsyncMessagePortToOtherRendererTest,
  AsyncToIframeTest
} = require('./tests/test')
const { numTests, scenarioDefinitions } = require('./benchmark-config')
const {
  generateTable,
  write_to_table,
} = require('./dom')

const payload = require('./tests/payload')
const TestBase = require('./tests/test-base')

let resolvers = new Map

function saveResolver(key, resolver) {
  resolvers.set(key, resolver)
}

async function async_to_webview(count) {
  let webviewEl = document.getElementById('the_webview');
  // let start = performance.now();
  // let promises = [];

  // for (let i = 0; i < count; i++) {
  //   promises.push( new Promise(function(resolve, reject) {
  //     let key = "async_to_webview_" + count + "_" + i;
  //     saveResolver(key, resolve);
  //     webviewEl.send(key)
  //   }));
  // }

  // await Promise.all(promises);
  // const time = Math.round(performance.now() - start);
  // write_to_table('async_to_webview_' + count, time);

  let start = performance.now();
  let promises = [];
  let listener = event => {
    // prints "ping"
    resolvers.get(event.arg)();
    resolvers.delete(event.arg);
  }

  webview.addEventListener('ipc-message', listener)

  for (let i = 0; i < count; i++) {
    promises.push( new Promise(function(resolve, reject) {
      let key = "async_to_webview_" + count + "_" + i;
      saveResolver(key, resolve);
      webviewEl.send('asynchronous-message', key)
    }));
  }

  await Promise.all(promises);
  const time = Math.round(performance.now() - start);
  write_to_table('async_to_webview_' + count, time);

  webview.removeEventListener('ipc-message', listener)
}

// Define test functions that will be run, e.g. AsyncToMainTest.run(100)
const testRunsByKey = {
  sync_to_main: SyncToMainTest.run,
  async_to_main: AsyncToMainTest.run,
  async_invoke_to_main: AsyncInvokeToMainTest.run,
  async_to_other_renderer: AsyncToOtherRendererTest.run,
  async_send_to_other_renderer: AsyncSendToOtherRendererTest.run,
  async_message_port_to_other_renderer: AsyncMessagePortToOtherRendererTest.run,
  async_to_iframe: AsyncToIframeTest.run,
}

const tests = scenarioDefinitions.map((scenario) => ({
  key: scenario.key,
  run: testRunsByKey[scenario.key],
}))

function getTestTimeoutMs(count) {
  const millisInput = /** @type {HTMLInputElement | null} */ (document.getElementById('milisMultiplier'))
  const multiplier = parseFloat(millisInput ? millisInput.value : '1') || 1
  return Math.max(5000, Math.ceil(count * multiplier) + 15000)
}

function raceWithTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timerId = setTimeout(() => {
      reject(new Error('Benchmark timed out'))
    }, timeoutMs)

    promise
      .then((value) => {
        clearTimeout(timerId)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timerId)
        reject(error)
      })
  })
}

let isRunning = false

function getCheckboxValue(id) {
  const element = document.getElementById(id)
  return element instanceof HTMLInputElement ? element.checked : false
}

function getTextValue(id, fallback = '') {
  const element = document.getElementById(id)
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.value : fallback
}

function getPayloadMetadata() {
  const currentPayload = payload.getPayload()
  const payloadJson = JSON.stringify(currentPayload)

  return {
    bytes: Buffer.byteLength(payloadJson, 'utf8'),
    topLevelKeys: currentPayload && typeof currentPayload === 'object' && !Array.isArray(currentPayload) ? Object.keys(currentPayload).length : null,
  }
}

function getRunContext() {
  return {
    generatedAt: new Date().toISOString(),
    runtime: {
      node: process.versions.node,
      chrome: process.versions.chrome,
      electron: process.versions.electron,
    },
    settings: {
      waitTimeMs: parseFloat(getTextValue('milisMultiplier', '1')) || 1,
      stringifyJson: getCheckboxValue('stringify_json'),
      showPercentiles: getCheckboxValue('show_percentage'),
      payload: getPayloadMetadata(),
    },
    counts: [...numTests],
    scenarios: scenarioDefinitions.map((scenario) => ({
      key: scenario.key,
      title: scenario.title,
      api: scenario.api,
      commentary: scenario.commentary,
      results: {},
    })),
  }
}

function getScenarioEntry(runContext, key) {
  return runContext.scenarios.find((scenario) => scenario.key === key) || null
}

function serializeAutomationError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return {
    name: 'UnknownError',
    message: String(error),
  }
}

function setRunState(running, statusText) {
  isRunning = running

  const runButton = document.getElementById('run_button')
  const cancelButton = document.getElementById('cancel_button')
  const spinner = document.getElementById('run_spinner')
  const status = document.getElementById('run_status')

  if (runButton instanceof HTMLButtonElement) {
    runButton.disabled = running
  }

  if (cancelButton instanceof HTMLButtonElement) {
    cancelButton.disabled = !running
  }

  if (spinner) {
    spinner.classList.toggle('is-active', running)
  }

  if (status) {
    status.textContent = statusText
  }
}

function generateBenchmarkTable() {
  generateTable(numTests)
}

function fillPayloadField() {
  const payloadString = JSON.stringify(payload.getPayload(), undefined, '    ')
  document.getElementById('payloadInput').value = payloadString
}

function attachHiddenTargets() {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('src', './iframe.html')
  iframe.setAttribute('id', 'the_iframe')
  iframe.style.width = '10px'
  iframe.style.height = '10px'
  iframe.style.display = 'none'
  document.body.appendChild(iframe)

  const webview = document.createElement('webview')
  webview.setAttribute('src', './webview.html')
  webview.setAttribute('id', 'the_webview')
  webview.style.width = '10px'
  webview.style.height = '10px'
  webview.style.display = 'none'
  document.body.appendChild(webview)
}

async function runBench() {
  TestBase.beginTestRun()

  if (!payload.updatePayload()) {
    throw new Error('Payload JSON is invalid.')
  }

  const runContext = getRunContext()

  // Generate empty table again
  await generateTable(numTests)

  // Generate test functions bound to numbers
  const testBench = []
  tests.forEach((test) => {
    numTests.forEach(num => {
      testBench.push({
        scenarioKey: test.key,
        key: `${test.key}_${num}`,
        run: test.run.bind(this, num),
        count: num,
      })
    })
  })

  // run the tests
  for (let i = 0; i < testBench.length; i++) {
    const test = testBench[i];
    if (TestBase.isCancellationRequested()) {
      throw TestBase.createCancellationError()
    }

    setRunState(true, `Running ${test.key}...`)

    try {
      const result = await raceWithTimeout(test.run(), getTestTimeoutMs(test.count))
      const scenario = getScenarioEntry(runContext, test.scenarioKey)
      if (scenario) {
        scenario.results[String(test.count)] = Object.assign({ status: 'ok' }, result)
      }
    } catch (error) {
      const scenario = getScenarioEntry(runContext, test.scenarioKey)
      const timedOut = error instanceof Error && error.message === 'Benchmark timed out'

      if (scenario) {
        scenario.results[String(test.count)] = {
          status: timedOut ? 'timed_out' : 'failed',
          error: error instanceof Error ? error.message : String(error),
        }
      }

      if (TestBase.isCancellationError(error)) {
        throw error
      }

      console.error(`Benchmark failed: ${test.key}`, error)
      write_to_table(test.key, timedOut ? 'Timed out' : 'Failed')
    }
  }

  return runContext

  // await async_to_webview(10)
  // await async_to_webview(100)
  // await async_to_webview(10000)
}

async function runBenchFromUi() {
  if (isRunning) {
    return null
  }

  setRunState(true, 'Running benchmarks...')

  try {
    const results = await runBench()
    setRunState(false, 'Finished.')
    return results
  } catch (error) {
    if (TestBase.isCancellationError(error)) {
      setRunState(false, 'Cancelled.')
      throw error
    }

    console.error(error)
    setRunState(false, error instanceof Error ? error.message : 'Benchmark run failed.')
    throw error
  }
}

async function maybeRunAutomation() {
  const automationConfig = await ipcRenderer.invoke('automation:get-config')
  if (!automationConfig || !automationConfig.enabled) {
    return
  }

  try {
    const results = await runBenchFromUi()
    await ipcRenderer.invoke('automation:complete', results)
  } catch (error) {
    await ipcRenderer.invoke('automation:fail', serializeAutomationError(error))
  }
}

window.addEventListener('DOMContentLoaded', () => {
  attachHiddenTargets()
  generateBenchmarkTable()
  fillPayloadField()

  const runButton = document.getElementById('run_button')
  const cancelButton = document.getElementById('cancel_button')

  if (runButton) {
    runButton.addEventListener('click', () => {
      if (isRunning) {
        return
      }

      setTimeout(async () => {
        try {
          await runBenchFromUi()
        } catch (error) {
          if (TestBase.isCancellationError(error)) {
            return
          }
        }
      })
    })
  }

  if (cancelButton) {
    cancelButton.addEventListener('click', () => {
      if (!isRunning) {
        return
      }

      TestBase.requestCancellation()
      setRunState(true, 'Cancelling...')
    })
  }

  setRunState(false, 'Idle.')
  void maybeRunAutomation()
})
