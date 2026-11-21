const assert = require('node:assert/strict')
const { test } = require('node:test')
const { setTimeout: sleep } = require('node:timers/promises')
const { parseAutomationConfig } = require('../src/automation-config')
const { scheduleMessages } = require('../src/bench-loop')
const { resolveScenarioCounts } = require('../src/benchmark-config')
const { summarizeDurations } = require('../src/measurement-provider')
const { renderSummaryChart, summarizeGroups } = require('../src/summary-chart')
const { validate } = require('./validate-results')

test('CLI normalizes counts and rejects partial, out-of-bounds, or incomplete options', () => {
  const flags = ['--bench-output=results.json']
  assert.deepEqual(parseAutomationConfig([...flags, '--bench-counts', '10,2,10']).counts, [2, 10])
  for (const arg of ['--bench-counts=5junk,10', '--bench-counts=10001', '--bench-timeout=2147483648']) {
    assert.throws(() => parseAutomationConfig([...flags, arg]))
  }
  assert.throws(() => parseAutomationConfig(['--bench-counts=1']), /--bench-output/)
})

test('cancel clears scheduled work even if a reply never arrives', async () => {
  const controller = new AbortController()
  const sent = []
  await assert.rejects(scheduleMessages(3, 20, controller.signal, (index) => {
    sent.push(index)
    controller.abort()
    return new Promise(() => {})
  }), { name: 'AbortError' })
  await sleep(60)
  assert.deepEqual(sent, [0])
})

test('send errors reject the batch and prevent later sends', async () => {
  const sent = []
  await assert.rejects(scheduleMessages(3, 20, new AbortController().signal, (index) => {
    sent.push(index)
    throw new Error('Could not send payload')
  }), /Could not send payload/)
  await sleep(60)
  assert.deepEqual(sent, [0])
})

test('validator rejects missing requested counts and invalid latency or CPU data', () => {
  const requestedCounts = [1, 2]
  const results = {
    counts: requestedCounts,
    requestedCounts,
    runtime: { electron: 'test' },
    scenarios: resolveScenarioCounts(requestedCounts).map(({ key, counts }) => ({
      key,
      counts,
      results: Object.fromEntries(counts.map((count) => [count, {
        status: 'ok',
        totalMs: 8,
        ...summarizeDurations(Array(count).fill(1)),
        mainProcess: { cpuMs: 0, wallMs: 8 },
      }])),
    })),
  }
  assert.deepEqual(validate(results), [])
  results.scenarios[0].counts = [1]
  delete results.scenarios[0].results[2]
  results.scenarios[1].results[1].percentiles.p99 = null
  results.scenarios[1].results[1].mainProcess.cpuMs = -1
  assert.match(validate(results).join('\n'), /no result for 2 messages[\s\S]*invalid round-trip percentiles[\s\S]*no main-process cost/)
})

test('chart compares a shared batch size and distinguishes missing data from zero', () => {
  const scenarios = resolveScenarioCounts(null).map(({ key, counts }) => ({
    key,
    counts,
    results: {
      100: { status: 'ok', percentiles: { p50: 0.1, p99: 0.2 } },
      10000: { status: 'ok', percentiles: { p50: 0, p99: 1 }, mainProcess: { cpuMs: 0 } },
    },
  }))
  scenarios[1].results[10000] = { status: 'timed_out' }
  const run = { scenarios, settings: { chromiumSandboxDisabled: true } }
  const [transport, bridge, payload] = summarizeGroups(run)

  assert.deepEqual([transport.count, bridge.count, payload.count], [10000, 1000, 100])
  assert.deepEqual(transport.rows[0].latency, { p50: 0, p99: 1 })
  assert.equal(transport.rows[0].cpu, 0)
  assert.equal(transport.rows[1].latency, null)
  assert.equal(transport.rows[1].status, 'Timed out')
  assert.match(bridge.title, /sandbox disabled/)
  assert.equal(payload.showCpu, false)
  assert.match(renderSummaryChart(run), /Timed out/)
})
