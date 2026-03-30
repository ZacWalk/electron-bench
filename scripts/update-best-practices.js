const fs = require('node:fs')
const path = require('node:path')

const { scenarioDefinitions } = require('../src/benchmark-config')

const workspaceRoot = path.resolve(__dirname, '..')
const bestPracticesPath = path.join(workspaceRoot, 'best-practices.md')
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

function formatTotal(result) {
  return result && result.status === 'ok' ? `${result.totalMs} ms` : formatStatus(result)
}

function formatAverage(result) {
  return result && result.status === 'ok' ? `${result.averageMs.toFixed(3)} ms` : formatStatus(result)
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

function buildScenarioRows(runData, formatter) {
  return scenarioDefinitions.map((scenario) => {
    const scenarioResult = runData.scenarios.find((entry) => entry.key === scenario.key)
    const byCount = scenarioResult ? scenarioResult.results : {}
    return `| ${scenario.title} (${scenario.api}) | ${formatter(byCount['100'])} | ${formatter(byCount['1000'])} | ${formatter(byCount['10000'])} |`
  }).join('\n')
}

function getSuccessful10000Entries(runData) {
  return scenarioDefinitions
    .map((scenario) => {
      const scenarioResult = runData.scenarios.find((entry) => entry.key === scenario.key)
      const latest = scenarioResult ? scenarioResult.results['10000'] : null
      return {
        scenario,
        result: latest,
      }
    })
    .filter((entry) => entry.result && entry.result.status === 'ok')
}

function buildDynamicTakeaways(runData) {
  const latestEntries = getSuccessful10000Entries(runData).sort((left, right) => left.result.averageMs - right.result.averageMs)
  const asyncEntries = latestEntries.filter((entry) => entry.scenario.key !== 'sync_to_main')

  if (latestEntries.length === 0 || asyncEntries.length === 0) {
    return '* The latest automated run did not produce enough successful 10,000-message samples to compare scenarios.'
  }

  const bestAsync = asyncEntries[0]
  const slowest = latestEntries[latestEntries.length - 1]
  const messagePort = latestEntries.find((entry) => entry.scenario.key === 'async_message_port_to_other_renderer')
  const iframe = latestEntries.find((entry) => entry.scenario.key === 'async_to_iframe')

  const lines = [
    `* At the 10,000-message scale, the fastest non-blocking route in this run was ${bestAsync.scenario.title} (${bestAsync.scenario.api}) at ${bestAsync.result.averageMs.toFixed(3)} ms per message.`,
    `* The slowest path at 10,000 messages was ${slowest.scenario.title} (${slowest.scenario.api}) at ${slowest.result.averageMs.toFixed(3)} ms per message, which is a good reminder that extra cross-process hops add up quickly.`,
  ]

  if (messagePort && iframe) {
    lines.push(`* For renderer-side traffic, MessagePort averaged ${messagePort.result.averageMs.toFixed(3)} ms and iframe postMessage averaged ${iframe.result.averageMs.toFixed(3)} ms for 10,000 messages, so both remain strong choices when you can avoid a main-process round trip.`)
  }

  return lines.join('\n\n')
}

function buildScenarioNotes(runData) {
  return scenarioDefinitions.map((scenario) => {
    const scenarioResult = runData.scenarios.find((entry) => entry.key === scenario.key)
    const latest = scenarioResult ? scenarioResult.results['10000'] : null
    const performanceNote = latest && latest.status === 'ok'
      ? ` In this run, the 10,000-message average was ${latest.averageMs.toFixed(3)} ms.`
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

  return [
    `${startMarker}`,
    `These figures were generated from ${relativeInputPath} on ${generatedAt}.`,
    '',
    `Runtime: Node.js ${runData.runtime.node}, Chromium ${runData.runtime.chrome}, Electron ${runData.runtime.electron}.`,
    '',
    `Run settings: wait time ${runData.settings.waitTimeMs} ms, stringify JSON ${runData.settings.stringifyJson ? 'on' : 'off'}, payload ${payloadSummary}.`,
    '',
    '### Total time',
    '',
    '| Scenario | 100 messages | 1000 messages | 10000 messages |',
    '| --- | ---: | ---: | ---: |',
    buildScenarioRows(runData, formatTotal),
    '',
    '### Average round-trip time per message',
    '',
    '| Scenario | 100 messages | 1000 messages | 10000 messages |',
    '| --- | ---: | ---: | ---: |',
    buildScenarioRows(runData, formatAverage),
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

  fs.writeFileSync(bestPracticesPath, updated, 'utf8')
}

function main() {
  const { inputPath } = parseArgs(process.argv.slice(2))
  const runData = readJson(inputPath)
  updateBestPractices(runData, inputPath)
  console.log(`Updated best-practices.md using ${path.relative(workspaceRoot, inputPath).replace(/\\/g, '/')}`)
}

main()