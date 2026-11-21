const fs = require('node:fs')
const path = require('node:path')

const { scenarioDefinitions, groupDefinitions, GROUP_TRANSPORT } = require('../src/benchmark-config')
const { renderSummaryChart } = require('../src/summary-chart')
const { validate } = require('./validate-results')

const workspaceRoot = path.resolve(__dirname, '..')
const bestPracticesPath = path.join(workspaceRoot, 'best-practices.md')
const chartPath = path.join(workspaceRoot, 'docs', 'benchmark-summary.svg')
const defaultInputPath = path.join(workspaceRoot, 'bench-results', 'latest.json')
const startMarker = '<!-- benchmark-data:start -->'
const endMarker = '<!-- benchmark-data:end -->'

function parseArgs(argv) {
  let inputPath = defaultInputPath

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--input') {
      inputPath = argv[index + 1] || inputPath
      index += 1
      continue
    }

    if (argument.startsWith('--input=')) {
      inputPath = argument.slice('--input='.length)
    }
  }

  return {
    inputPath: path.resolve(inputPath),
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function formatStatus(result) {
  if (!result) {
    return 'n/a'
  }

  if (result.status === 'timed_out') {
    return 'Timed out'
  }

  if (result.status === 'failed') {
    return 'Failed'
  }

  return 'n/a'
}

function formatLatency(result) {
  if (!result || result.status !== 'ok' || !result.percentiles) {
    return formatStatus(result)
  }

  return `${result.percentiles.p50.toFixed(3)} / ${result.percentiles.p99.toFixed(3)}`
}

function formatLag(result) {
  if (!result || result.status !== 'ok' || !result.mainProcess) {
    return formatStatus(result)
  }

  return `${result.mainProcess.cpuMs.toFixed(1)}`
}

function findScenarioResult(runData, key) {
  return runData.scenarios.find((entry) => entry.key === key) || null
}

function scenarioCounts(runData, key) {
  const scenario = findScenarioResult(runData, key)

  if (scenario && Array.isArray(scenario.counts) && scenario.counts.length > 0) {
    return scenario.counts
  }

  return runData.counts || []
}

function groupCounts(runData, groupKey) {
  const counts = new Set()

  scenarioDefinitions
    .filter((scenario) => scenario.group === groupKey)
    .forEach((scenario) => scenarioCounts(runData, scenario.key).forEach((count) => counts.add(count)))

  return [...counts].sort((left, right) => left - right)
}

function largestCount(runData, key) {
  const counts = scenarioCounts(runData, key)
  return counts.length > 0 ? counts[counts.length - 1] : null
}

function buildGroupTable(runData, groupKey, formatter, leadColumn) {
  const counts = groupCounts(runData, groupKey)

  if (counts.length === 0) {
    return null
  }

  const header = `| ${leadColumn} | ${counts.map((count) => `${count} messages`).join(' | ')} |`
  const divider = `| --- | ${counts.map(() => '---:').join(' | ')} |`

  const rows = scenarioDefinitions
    .filter((scenario) => scenario.group === groupKey)
    .map((scenario) => {
      const result = findScenarioResult(runData, scenario.key)
      const byCount = result ? result.results : {}
      const cells = counts.map((count) => (scenarioCounts(runData, scenario.key).includes(count)
        ? formatter(byCount[String(count)])
        : '—'))
      return `| ${scenario.title} (${scenario.api}) | ${cells.join(' | ')} |`
    })

  return [header, divider, ...rows].join('\n')
}

function buildGroupSection(runData, group) {
  const latencyTable = buildGroupTable(runData, group.key, formatLatency, 'Scenario')

  if (!latencyTable) {
    return null
  }

  const section = [
    `### ${group.title}`,
    '',
    group.description,
    '',
    '#### Round-trip latency per message, p50 / p99 in ms',
    '',
    latencyTable,
  ]

  if (group.showMainCost !== false) {
    section.push(
      '',
      '#### Main-process CPU consumed while the scenario ran, in ms',
      '',
      buildGroupTable(runData, group.key, formatLag, 'Scenario'),
    )
  }

  return section.join('\n')
}

function buildDynamicTakeaways(runData) {
  const lines = []

  const transportEntries = scenarioDefinitions
    .filter((scenario) => scenario.group === GROUP_TRANSPORT)
    .map((scenario) => {
      const count = largestCount(runData, scenario.key)
      const result = findScenarioResult(runData, scenario.key)
      return {
        scenario,
        count,
        result: result && count !== null ? result.results[String(count)] : null,
      }
    })
    .filter((entry) => entry.result && entry.result.status === 'ok')

  if (transportEntries.length > 0) {
    const byLatency = [...transportEntries].sort((left, right) => left.result.percentiles.p50 - right.result.percentiles.p50)
    const fastest = byLatency[0]
    const slowest = byLatency[byLatency.length - 1]

    lines.push(`* Fastest transport at ${fastest.count} messages was ${fastest.scenario.title} (${fastest.scenario.api}) at a p50 of ${fastest.result.percentiles.p50.toFixed(3)} ms.`)
    lines.push(`* Slowest transport was ${slowest.scenario.title} (${slowest.scenario.api}) at a p50 of ${slowest.result.percentiles.p50.toFixed(3)} ms.`)

    const sync = transportEntries.find((entry) => entry.scenario.key === 'sync_to_main')
    const cheapestCpu = [...transportEntries]
      .filter((entry) => entry.result.mainProcess)
      .sort((left, right) => left.result.mainProcess.cpuMs - right.result.mainProcess.cpuMs)[0]

    if (sync && sync.result.mainProcess && cheapestCpu) {
      const ratio = cheapestCpu.result.mainProcess.cpuMs > 0
        ? sync.result.mainProcess.cpuMs / cheapestCpu.result.mainProcess.cpuMs
        : 0
      lines.push(`* sendSync measured ${sync.result.percentiles.p50.toFixed(3)} ms p50 and used ${sync.result.mainProcess.cpuMs.toFixed(0)} ms of main-process CPU at ${sync.count} messages${ratio > 1 ? ` (${ratio.toFixed(1)}× the lowest measured CPU cost)` : ''}. The sending renderer blocks until main replies.`)
    }

    const byLag = [...transportEntries]
      .filter((entry) => entry.result.mainProcess)
      .sort((left, right) => right.result.mainProcess.cpuMs - left.result.mainProcess.cpuMs)

    if (byLag.length > 0) {
      const worst = byLag[0]
      const best = byLag[byLag.length - 1]
      lines.push(`* The route that cost the main process most was ${worst.scenario.title} (${worst.scenario.api}) at ${worst.result.mainProcess.cpuMs.toFixed(1)} ms of main-process CPU, against ${best.result.mainProcess.cpuMs.toFixed(1)} ms for ${best.scenario.title}. Latency alone does not show this, and main-process CPU is what turns into jank for every window in the app.`)
    }
  }

  const bridgeCount = largestCount(runData, 'sandboxed_bridge_invoke_to_main')
  const bridgeScenario = findScenarioResult(runData, 'sandboxed_bridge_invoke_to_main')
  const directScenario = findScenarioResult(runData, 'unsandboxed_direct_invoke_to_main')
  const bridgeResult = bridgeScenario && bridgeCount !== null ? bridgeScenario.results[String(bridgeCount)] : null
  const directResult = directScenario && bridgeCount !== null ? directScenario.results[String(bridgeCount)] : null

  if (!runData.settings.chromiumSandboxDisabled && bridgeResult && directResult &&
      bridgeResult.status === 'ok' && directResult.status === 'ok') {
    const bridgeP50 = bridgeResult.percentiles.p50
    const directP50 = directResult.percentiles.p50
    const delta = bridgeP50 - directP50

    if (Math.abs(delta) < 0.05) {
      lines.push(`* A sandboxed renderer calling through contextBridge and an unsandboxed preload calling ipcRenderer directly both measured a p50 of ${bridgeP50.toFixed(3)} ms at this payload size. The bridge is not a meaningful latency tax here, so performance is a weak argument for shipping unsandboxed.`)
    } else {
      const ratio = directP50 > 0 ? bridgeP50 / directP50 : 0
      lines.push(`* A sandboxed renderer calling through contextBridge measured a p50 of ${bridgeP50.toFixed(3)} ms against ${directP50.toFixed(3)} ms for an unsandboxed preload calling ipcRenderer directly: ${delta >= 0 ? '+' : ''}${delta.toFixed(3)} ms per call, or ${ratio.toFixed(2)}x. That is the price of the configuration most apps ship.`)
    }
  }

  const copyScenario = findScenarioResult(runData, 'payload_binary_1mb_copy')
  const transferScenario = findScenarioResult(runData, 'payload_binary_1mb_transfer')
  const payloadCount = largestCount(runData, 'payload_binary_1mb_copy')
  const copyResult = copyScenario && payloadCount !== null ? copyScenario.results[String(payloadCount)] : null
  const transferResult = transferScenario && payloadCount !== null ? transferScenario.results[String(payloadCount)] : null

  if (copyResult && transferResult && copyResult.status === 'ok' && transferResult.status === 'ok') {
    const copyP50 = copyResult.percentiles.p50
    const transferP50 = transferResult.percentiles.p50
    lines.push(`* At 1 MB, transferring the ArrayBuffer measured a p50 of ${transferP50.toFixed(3)} ms versus ${copyP50.toFixed(3)} ms for copying it.`)
  }

  if (lines.length === 0) {
    return '* The latest automated run did not produce enough successful samples to compare scenarios.'
  }

  return lines.join('\n\n')
}

function buildScenarioNotes(runData) {
  return scenarioDefinitions.map((scenario) => {
    const count = largestCount(runData, scenario.key)
    const result = findScenarioResult(runData, scenario.key)
    const latest = result && count !== null ? result.results[String(count)] : null
    const performanceNote = latest && latest.status === 'ok'
      ? ` In this run, the ${count}-message p50 was ${latest.percentiles.p50.toFixed(3)} ms.`
      : ''
    return `* ${scenario.title} (${scenario.api}): ${scenario.commentary}${performanceNote}`
  }).join('\n\n')
}

function buildGeneratedSection(runData, inputPath) {
  const generatedAt = new Date(runData.generatedAt).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const relativeInputPath = path.relative(workspaceRoot, inputPath).replace(/\\/g, '/')
  const payloadSummary = runData.settings && runData.settings.payload
    ? `${runData.settings.payload.bytes} bytes`
    : 'unknown payload size'

  const groupSections = groupDefinitions
    .map((group) => buildGroupSection(runData, group))
    .filter(Boolean)
    .join('\n\n')

  return [
    `${startMarker}`,
    `These figures were generated from ${relativeInputPath} on ${generatedAt}.`,
    '',
    `Runtime: Node.js ${runData.runtime.node}, Chromium ${runData.runtime.chrome}, Electron ${runData.runtime.electron}.`,
    '',
    `Run settings: send spacing ${runData.settings.waitTimeMs} ms, default payload ${payloadSummary}.` +
      (runData.settings.chromiumSandboxDisabled ? ' Chromium sandboxing was disabled; the bridge results compare call paths only.' : ''),
    '',
    'Transport and bridge scenarios schedule sends at the configured spacing without waiting for the previous reply; slow replies can overlap. Payload scenarios wait for each reply. These are round-trip measurements, not a saturated throughput test.',
    '',
    'Main-process CPU is sampled for the whole process, not just the IPC handler. Small readings can round to zero due to OS accounting granularity.',
    '',
    '### Summary chart',
    '',
    '![Benchmark summary: median and p99 round-trip latency and main-process CPU by scenario](./docs/benchmark-summary.svg)',
    '',
    'Each group uses its largest shared batch size and its own scales. Compare rows within a group; see the tables below for every batch size.',
    '',
    groupSections,
    '',
    '### Scenario notes',
    '',
    buildScenarioNotes(runData),
    '',
    '### Practical takeaways from this run',
    '',
    buildDynamicTakeaways(runData),
    `${endMarker}`,
  ].join('\n')
}

function updateBestPractices(runData, inputPath) {
  const markdown = fs.readFileSync(bestPracticesPath, 'utf8')
  const startIndex = markdown.indexOf(startMarker)
  const endIndex = markdown.indexOf(endMarker)

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error('Could not find benchmark data markers in best-practices.md.')
  }

  const replacement = buildGeneratedSection(runData, inputPath)
  const updated = `${markdown.slice(0, startIndex)}${replacement}${markdown.slice(endIndex + endMarker.length)}`
  const svg = renderSummaryChart(runData)

  fs.mkdirSync(path.dirname(chartPath), { recursive: true })
  fs.writeFileSync(chartPath, svg, 'utf8')
  fs.writeFileSync(bestPracticesPath, updated, 'utf8')
}

function main() {
  try {
    const { inputPath } = parseArgs(process.argv.slice(2))
    const runData = readJson(inputPath)
    const errors = validate(runData)
    if (errors.length) throw new Error(errors.join('\n'))
    updateBestPractices(runData, inputPath)
    console.log(`Updated best-practices.md and docs/benchmark-summary.svg using ${path.relative(workspaceRoot, inputPath).replace(/\\/g, '/')}`)
  } catch (error) {
    console.error(`Could not update best practices: ${error.message}`)
    process.exitCode = 1
  }
}

main()