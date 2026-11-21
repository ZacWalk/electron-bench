const path = require('node:path')
const { numTests } = require('./benchmark-config')

function parseAutomationConfig(argv) {
  const options = new Map()
  for (let index = 0; index < argv.length; index++) {
    const [flag, ...parts] = argv[index].split('=')
    if (!flag.startsWith('--bench-')) continue
    if (!['--bench-output', '--bench-counts', '--bench-timeout'].includes(flag)) {
      throw new Error(`Unknown benchmark option: ${flag}`)
    }
    const value = parts.length ? parts.join('=') : argv[++index]
    if (!value?.trim() || value.startsWith('--') || options.has(flag)) {
      throw new Error(`Expected one value for ${flag}.`)
    }
    options.set(flag, value)
  }

  if (options.size && !options.has('--bench-output')) {
    throw new Error('Supply --bench-output when using benchmark options.')
  }

  const maxCount = numTests.at(-1)
  const rawCounts = options.get('--bench-counts')
  const counts = rawCounts ? rawCounts.split(',').map((part) => {
    const value = part.trim()
    const count = Number(value)
    if (!/^\d+$/.test(value) || count < 1 || count > maxCount) {
      throw new Error(`--bench-counts expects comma-separated integers from 1 to ${maxCount}.`)
    }
    return count
  }) : null
  const rawTimeout = options.get('--bench-timeout')
  const timeoutMs = rawTimeout ? Number(rawTimeout) : 600000
  if (rawTimeout && (!/^\d+$/.test(rawTimeout) || timeoutMs < 1 || timeoutMs > 2147483647)) {
    throw new Error('--bench-timeout expects a positive integer in milliseconds (up to 2147483647).')
  }

  const output = options.get('--bench-output')
  return {
    enabled: Boolean(output),
    outputPath: output ? path.resolve(output) : null,
    counts: counts ? [...new Set(counts)].sort((a, b) => a - b) : null,
    timeoutMs,
  }
}

module.exports = { parseAutomationConfig }
