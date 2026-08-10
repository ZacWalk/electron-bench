#!/usr/bin/env node
// Fast static gate: parses every JavaScript file so syntax errors fail before Electron starts.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const roots = ['src', 'scripts']
const repoRoot = path.resolve(__dirname, '..')

function collectFiles(directory, files = []) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })

  entries.forEach((entry) => {
    const fullPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') {
        return
      }
      collectFiles(fullPath, files)
      return
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath)
    }
  })

  return files
}

const files = roots
  .map((root) => path.join(repoRoot, root))
  .filter((directory) => fs.existsSync(directory))
  .flatMap((directory) => collectFiles(directory))

let failed = 0

files.forEach((file) => {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })

  if (result.status !== 0) {
    failed += 1
    console.error(`Syntax check failed: ${path.relative(repoRoot, file)}`)
    console.error(result.stderr.trim())
  }
})

if (failed > 0) {
  console.error(`${failed} file(s) failed the syntax check.`)
  process.exit(1)
}

console.log(`Syntax check passed for ${files.length} file(s).`)
