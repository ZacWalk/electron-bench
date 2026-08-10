#!/usr/bin/env node
// Gate script: fails when a benchmark run did not produce a complete, healthy result set.
const fs = require('node:fs')
const path = require('node:path')
const { scenarioDefinitions } = require('../src/benchmark-config')

function parseArgs(argv) {
  let input = 'bench-results/latest.json'

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--input') {
      input = argv[index + 1] || input
      index += 1
      continue
    }

    if (argument.startsWith('--input=')) {
      input = argument.slice('--input='.length)
    }
  }

  return { input: path.resolve(input) }
}

function validate(results) {
  const errors = []

  if (!results || typeof results !== 'object') {
    return ['Result file did not contain an object.']
  }

  if (!results.runtime || !results.runtime.electron) {
    errors.push('Missing runtime.electron in results.')
  }

  const counts = Array.isArray(results.counts) ? results.counts : []
  if (counts.length === 0) {
    errors.push('Missing counts array in results.')
  }

  const scenarios = Array.isArray(results.scenarios) ? results.scenarios : []
  const scenariosByKey = new Map(scenarios.map((scenario) => [scenario.key, scenario]))

  scenarioDefinitions.forEach((definition) => {
    const scenario = scenariosByKey.get(definition.key)

    if (!scenario) {
      errors.push(`Scenario "${definition.key}" is missing from the results.`)
      return
    }

    counts.forEach((count) => {
      const entry = scenario.results ? scenario.results[String(count)] : null

      if (!entry) {
        errors.push(`Scenario "${definition.key}" has no result for ${count} messages.`)
        return
      }

      if (entry.status !== 'ok') {
        errors.push(`Scenario "${definition.key}" at ${count} messages reported status "${entry.status}"${entry.error ? `: ${entry.error}` : ''}.`)
        return
      }

      if (!Number.isFinite(entry.totalMs)) {
        errors.push(`Scenario "${definition.key}" at ${count} messages has no numeric totalMs.`)
      }

      if (entry.sampleCount !== count) {
        errors.push(`Scenario "${definition.key}" at ${count} messages recorded ${entry.sampleCount} samples.`)
      }
    })
  })

  return errors
}

function main() {
  const { input } = parseArgs(process.argv.slice(2))

  if (!fs.existsSync(input)) {
    console.error(`Benchmark result file not found: ${input}`)
    process.exit(1)
  }

  let results
  try {
    results = JSON.parse(fs.readFileSync(input, 'utf8'))
  } catch (error) {
    console.error(`Benchmark result file is not valid JSON: ${input}`)
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
    return
  }

  const errors = validate(results)

  if (errors.length > 0) {
    console.error(`Benchmark validation failed for ${input}:`)
    errors.forEach((message) => console.error(`  - ${message}`))
    process.exit(1)
    return
  }

  const counts = results.counts.join(', ')
  console.log(`Benchmark validation passed: ${results.scenarios.length} scenarios at counts [${counts}] on Electron ${results.runtime.electron}.`)
}

main()
