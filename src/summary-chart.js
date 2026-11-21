const { groupDefinitions, scenarioDefinitions, GROUP_BRIDGE } = require('./benchmark-config')

const formatNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })
const formatTick = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 })
const format = (value) => formatNumber.format(value)
const escapeXml = (value) => String(value).replace(/[&<>]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;',
})[character])
const isMetric = (value) => Number.isFinite(value) && value >= 0

function summarizeGroups(run) {
  const scenarios = new Map(run.scenarios.map((scenario) => [scenario.key, scenario]))
  return groupDefinitions.map(({ key, title, showMainCost }) => {
    const definitions = scenarioDefinitions.filter((scenario) => scenario.group === key)
    const counts = definitions.map((scenario) => scenarios.get(scenario.key)?.counts ?? [])
    const shared = counts[0].filter((count) => counts.every((options) => options.includes(count)))
    const count = shared.length ? Math.max(...shared) : null

    return {
      title: key === GROUP_BRIDGE && run.settings?.chromiumSandboxDisabled
        ? 'Invoke paths (Chromium sandbox disabled)' : title,
      count,
      showCpu: showMainCost !== false,
      rows: definitions.map((definition) => {
        const entry = scenarios.get(definition.key)?.results?.[count]
        const { p50, p99 } = entry?.percentiles ?? {}
        const valid = entry?.status === 'ok' && isMetric(p50) && isMetric(p99) && p50 <= p99
        return {
          label: definition.chartLabel ?? definition.title,
          latency: valid ? { p50, p99 } : null,
          cpu: valid && isMetric(entry.mainProcess?.cpuMs) ? entry.mainProcess.cpuMs : null,
          status: entry?.status === 'failed' ? 'Failed' : entry?.status === 'timed_out' ? 'Timed out' : 'Not available',
        }
      }),
    }
  })
}

function axisMax(values) {
  const max = Math.max(0, ...values)
  if (max === 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(max))
  return [1, 2, 5, 10].map((step) => step * magnitude).find((tick) => tick >= max)
}

function renderSummaryChart(run) {
  const groups = summarizeGroups(run)
  const width = 960
  const rowHeight = 27
  const latency = { left: 310, width: 235 }
  const cpu = { left: 694, width: 175 }
  const text = (x, y, value, options = {}) => {
    const { fill = '#18363e', size = 14, bold = false, anchor = 'start' } = options
    return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${bold ? 700 : 400}" text-anchor="${anchor}">${escapeXml(value)}</text>`
  }
  const line = (x1, y1, x2, y2, stroke, weight = 1) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${weight}"/>`
  const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="4.5" fill="#11667b" stroke="#fff" stroke-width="1"/>`
  const square = (x, y) => `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" fill="#8a461a" stroke="#fff" stroke-width="1"/>`
  const muted = { fill: '#486168', size: 12 }
  const right = { ...muted, anchor: 'end' }
  const position = (value, plot, max) => plot.left + Math.round(value / max * plot.width)
  const date = run.generatedAt?.slice(0, 10)
  const metadata = [run.runtime?.electron && `Electron ${run.runtime.electron}`, date].filter(Boolean).join(' | ')
  const parts = [
    text(22, 33, 'Benchmark summary', { size: 24, bold: true }),
    text(22, 55, metadata, muted),
    text(latency.left, 80, 'Round-trip latency (ms)', { bold: true }),
    dot(latency.left + 5, 97), text(latency.left + 15, 101, 'p50', muted),
    square(latency.left + 64, 97), text(latency.left + 74, 101, 'p99', muted),
    text(653, 101, 'p50 / p99', right),
    text(cpu.left, 80, 'Main-process CPU (ms per batch)', { bold: true }),
  ]
  let top = 114

  for (const { title, count, showCpu, rows } of groups) {
    const rowTop = top + 48
    const bottom = rowTop + rows.length * rowHeight
    const latencyMax = axisMax(rows.map((row) => row.latency?.p99 ?? 0))
    const cpuMax = axisMax(rows.map((row) => row.cpu ?? 0))
    const subtitle = count === null ? 'no shared batch size' : `${format(count)} messages`
    parts.push(`<rect x="16" y="${top}" width="928" height="27" rx="5" fill="#def0f0"/>`)
    parts.push(text(24, top + 19, `${title} | ${subtitle}`, { bold: true }))

    for (const [plot, max] of (showCpu ? [[latency, latencyMax], [cpu, cpuMax]] : [[latency, latencyMax]])) {
      for (const tick of [0, max / 2, max]) {
        const x = position(tick, plot, max)
        parts.push(text(x, rowTop - 6, formatTick.format(tick), { ...muted, anchor: 'middle' }))
        parts.push(line(x, rowTop, x, bottom, '#c5dadd'))
      }
    }
    if (!showCpu) parts.push(text(cpu.left, rowTop - 6, 'Not compared for payloads', muted))

    rows.forEach((row, index) => {
      const y = rowTop + index * rowHeight + rowHeight / 2
      parts.push(text(24, y + 5, row.label))
      if (row.latency) {
        const p50 = position(row.latency.p50, latency, latencyMax)
        const p99 = position(row.latency.p99, latency, latencyMax)
        parts.push(line(p50, y - 3, p99, y + 3, '#42656e', 2), dot(p50, y - 3), square(p99, y + 3))
        parts.push(text(653, y + 5, `${format(row.latency.p50)} / ${format(row.latency.p99)}`, right))
      } else {
        parts.push(text(latency.left + 8, y + 5, row.status, muted))
      }
      if (showCpu && row.latency) {
        if (row.cpu === null) {
          parts.push(text(933, y + 5, 'Not available', right))
        } else {
          const barWidth = position(row.cpu, cpu, cpuMax) - cpu.left
          parts.push(`<rect x="${cpu.left}" y="${y - 4}" width="${barWidth}" height="8" fill="#316b50"/>`)
          parts.push(text(933, y + 5, format(row.cpu), right))
        }
      }
    })
    top = bottom + 12
  }

  parts.push(text(22, top + 13, 'Each group uses its own scales and the largest batch size shared by its scenarios. Lower is better.', muted))
  const height = top + 27
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="benchmark-chart-title benchmark-chart-description" font-family="Segoe UI, Arial, sans-serif">
<title id="benchmark-chart-title">Benchmark summary</title>
<desc id="benchmark-chart-description">Median and p99 round-trip latency and main-process CPU by scenario at the largest shared batch size in each group. Use the results tables for the underlying values.</desc>
<rect width="${width}" height="${height}" rx="14" fill="#f6fbfb"/>
${parts.join('\n')}
</svg>\n`
}

module.exports = { renderSummaryChart, summarizeGroups }
