const { ipcRenderer } = require('electron')
const { scenarioDefinitions, resolveScenarioCounts, resolveColumnCounts, GROUP_PAYLOAD } = require('./benchmark-config')
const { generateTable, writeResult, writeFailure } = require('./dom')
const { renderSummaryChart } = require('./summary-chart')
const { runScenario } = require('./tests/test')
const { getPayload, updatePayload, describePayloadProfile } = require('./tests/payload')

function getTimeoutMs(scenario, count, spacingMs) {
  return scenario.group === GROUP_PAYLOAD ? Math.max(60000, count * 1000) : Math.ceil(count * spacingMs) + 15000
}

function makeRunContext(override, spacingMs, showPercentiles, chromiumSandboxDisabled) {
  const payload = getPayload()
  const counts = new Map(resolveScenarioCounts(override).map((entry) => [entry.key, entry.counts]))
  return {
    generatedAt: new Date().toISOString(),
    runtime: { node: process.versions.node, chrome: process.versions.chrome, electron: process.versions.electron },
    settings: {
      waitTimeMs: spacingMs,
      showPercentiles,
      chromiumSandboxDisabled,
      payload: {
        bytes: Buffer.byteLength(JSON.stringify(payload), 'utf8'),
        topLevelKeys: payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.keys(payload).length : null,
      },
    },
    requestedCounts: override,
    counts: resolveColumnCounts(override),
    scenarios: scenarioDefinitions.map(({ key, group, title, api, commentary, payloadProfile }) => ({
      key, group, title, api, commentary,
      counts: counts.get(key),
      payload: payloadProfile ? describePayloadProfile(payloadProfile) : null,
      results: {},
    })),
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const byId = (id) => document.getElementById(id)
  const runButton = byId('run_button')
  const cancelButton = byId('cancel_button')
  const status = byId('run_status')
  const spinner = byId('run_spinner')
  const mode = byId('run_mode')
  const spacing = byId('milisMultiplier')
  const payload = byId('payloadInput')
  const details = byId('show_percentage')
  const table = byId('resultTable')
  const summary = byId('resultSummary')
  const chart = byId('resultChart')
  const iframe = document.createElement('iframe')
  let controller
  let chromiumSandboxDisabled

  function resetTable(override) {
    summary.hidden = true
    chart.replaceChildren()
    generateTable(resolveColumnCounts(override), new Map(resolveScenarioCounts(override).map(({ key, counts }) => [key, counts])))
  }

  function updateDetails() {
    table.classList.toggle('hide_details', !details.checked)
  }

  function setRunning(running) {
    for (const control of [runButton, mode, spacing, payload]) control.disabled = running
    cancelButton.disabled = !running
    spinner.classList.toggle('is-active', running)
  }

  async function run(override) {
    if (controller) return
    spacing.removeAttribute('aria-invalid')
    payload.removeAttribute('aria-invalid')
    const spacingMs = spacing.valueAsNumber
    if (!Number.isFinite(spacingMs) || spacingMs <= 0 || spacingMs > 10) {
      spacing.setAttribute('aria-invalid', 'true')
      spacing.focus()
      status.textContent = 'Enter a send interval greater than 0 and at most 10 ms.'
      throw new Error(status.textContent)
    }
    try {
      updatePayload(payload.value)
    } catch (error) {
      payload.setAttribute('aria-invalid', 'true')
      payload.focus()
      status.textContent = `Invalid payload JSON: ${error.message}`
      throw error
    }

    controller = new AbortController()
    const { signal } = controller
    setRunning(true)
    status.textContent = 'Preparing benchmarks…'
    let completed = 0
    let failures = 0
    try {
      const results = makeRunContext(override, spacingMs, details.checked, chromiumSandboxDisabled)
      const total = results.scenarios.reduce((sum, entry) => sum + entry.counts.length, 0)
      resetTable(override)
      for (const [index, scenario] of scenarioDefinitions.entries()) {
        const entry = results.scenarios[index]
        for (const count of entry.counts) {
          signal.throwIfAborted()
          const key = `${scenario.key}_${count}`
          status.textContent = `${completed + 1} of ${total}: ${scenario.title} (${count.toLocaleString()} messages)`
          try {
            const result = await runScenario(scenario, count, {
              signal, spacingMs, iframe, timeoutMs: getTimeoutMs(scenario, count, spacingMs),
            })
            entry.results[count] = { status: 'ok', ...result }
            writeResult(key, result, scenario.group !== GROUP_PAYLOAD)
          } catch (error) {
            if (signal.aborted) {
              writeFailure(key, 'Cancelled')
              throw signal.reason
            }
            const timedOut = error.name === 'BenchmarkTimeoutError'
            entry.results[count] = { status: timedOut ? 'timed_out' : 'failed', error: error.message }
            failures++
            writeFailure(key, timedOut ? 'Timed out' : 'Failed', error.message)
            console.error(`Benchmark failed: ${key}`, error)
          }
          completed++
        }
      }
      status.textContent = failures ? `Finished with ${failures} failed or timed-out results.` : `Finished: ${completed} results.`
      return results
    } catch (error) {
      status.textContent = signal.aborted ? `Cancelled after ${completed} results.` : `Benchmark run failed: ${error.message}`
      throw error
    } finally {
      controller = null
      setRunning(false)
    }
  }

  // Mark readiness before the frame can be used by the iframe scenario.
  iframe.addEventListener('load', () => { iframe.dataset.ready = 'true' }, { once: true })
  iframe.src = './iframe.html'
  iframe.hidden = true
  document.body.appendChild(iframe)
  payload.value = JSON.stringify(getPayload(), null, 2)
  resetTable(null)
  updateDetails()
  details.addEventListener('change', updateDetails)
  mode.addEventListener('change', () => {
    if (!controller) status.textContent = 'Ready. Run benchmarks to apply the selected mode.'
  })
  runButton.addEventListener('click', () => {
    void run(mode.value === 'quick' ? [100] : null)
      .then((results) => {
        if (!results) return
        chart.innerHTML = renderSummaryChart(results)
        summary.hidden = false
      })
      .catch((error) => {
        if (error.name !== 'AbortError') console.error(error)
      })
  })
  cancelButton.addEventListener('click', () => {
    if (!controller) return
    cancelButton.disabled = true
    status.textContent = 'Cancelling…'
    controller.abort()
  })

  try {
    const config = await ipcRenderer.invoke('automation:get-config')
    chromiumSandboxDisabled = config.chromiumSandboxDisabled
    if (config.enabled) {
      const results = await run(config.counts)
      await ipcRenderer.invoke('automation:complete', results)
    } else {
      runButton.disabled = false
      status.textContent = 'Ready.'
    }
  } catch (error) {
    status.textContent = `Could not complete benchmark: ${error.message}`
    console.error(error)
    await ipcRenderer.invoke('automation:fail', error.message)
  }
})
