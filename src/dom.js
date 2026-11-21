//@ts-check
const { scenarioDefinitions, groupDefinitions } = require('./benchmark-config')

function writeFailure(where, label, message) {
    const element = document.getElementById(where)
    if (element) {
        element.textContent = label
        if (message) appendMetric(element, message, 'result_error')
    }
}

function appendMetric(element, text, className = 'measures') {
    const line = document.createElement('p')
    line.className = className
    line.textContent = text
    element.appendChild(line)
}

function writeResult(where, result, showMainCost) {
    const element = document.getElementById(where)
    if (!element) return
    const { totalMs, averageMs, percentiles, mainProcess } = result
    element.replaceChildren()
    appendMetric(element, `p50 ${percentiles.p50.toFixed(3)} ms · p99 ${percentiles.p99.toFixed(3)} ms`, 'result_latency')
    if (showMainCost) appendMetric(element, `Main CPU ${mainProcess.cpuMs.toFixed(1)} ms`)
    appendMetric(element, `Batch ${totalMs.toLocaleString()} ms`)
    appendMetric(element, `Avg ${averageMs.toFixed(3)} ms · p25 ${percentiles.p25.toFixed(3)} ms · p75 ${percentiles.p75.toFixed(3)} ms`, 'measures extra_details')
}

/** @param {string[]} steps @param {string} arrow */
function buildRouteNodes(steps, arrow) {
    return steps.map((step, index) => {
        const node = `<span class="route_node">${step}</span>`
        if (index === steps.length - 1) {
            return node
        }

        return `${node}<span class="route_arrow">${arrow}</span>`
    }).join('')
}

/** @param {{ label: string, steps: string[], arrow?: string }} route */
function buildRouteLine(route) {
    return `<div class="route_flow"><span class="route_label">${route.label}</span><div class="route_nodes">${buildRouteNodes(route.steps, route.arrow || '→')}</div></div>`
}

/** @param {{ title: string, detail: string, routes: Array<{ label: string, steps: string[], arrow?: string }> }} config */
function buildRouteCard(config) {
    const routeLines = config.routes.map(buildRouteLine).join('')
    return `<div class="route_card"><div class="route_title">${config.title}</div><div class="route_detail">${config.detail}</div>${routeLines}</div>`
}

/** @param {number[]} [columnCounts] @param {Map<string, number[]>} [scenarioCounts] */
function generateTable(columnCounts, scenarioCounts) {
    const table = /** @type {HTMLTableElement | null} */ (document.getElementById('resultTable'))
    if (!table) {
        return
    }

    const tableEl = table

    tableEl.innerHTML = ''

    function appendHeader() {
        const thead = document.createElement('thead')
        const headRow = document.createElement('tr')

        const headerCells = ['Scenario', ...columnCounts.map((num) => `${num.toLocaleString()} messages`)].map((label) => {
            const th = document.createElement('th')
            th.scope = 'col'
            th.textContent = label
            return th
        })

        headRow.append(...headerCells)
        thead.append(headRow)
        tableEl.append(thead)
    }

    function appendGroupHeader(body, title) {
        const row = document.createElement('tr')
        row.className = 'group_row'

        const cell = document.createElement('th')
        cell.setAttribute('colspan', String(columnCounts.length + 1))
        cell.scope = 'rowgroup'
        cell.textContent = title

        row.append(cell)
        body.append(row)
    }

    /** @param {HTMLTableSectionElement} body @param {typeof scenarioDefinitions[number]} scenario */
    function createRow(body, scenario) {
        const counts = (scenarioCounts && scenarioCounts.get(scenario.key)) || scenario.counts
        const row = document.createElement('tr')

        const descCell = document.createElement('th')
        descCell.scope = 'row'
        descCell.innerHTML = buildRouteCard(scenario.route)

        const valueCells = columnCounts.map((num) => {
            const td = document.createElement('td')

            if (counts.includes(num)) {
                const result = document.createElement('div')
                result.id = `${scenario.key}_${num}`
                result.textContent = 'Pending'
                td.append(result)
            } else {
                td.textContent = '—'
            }

            return td
        })

        row.append(...[descCell, ...valueCells])
        body.append(row)
    }

    function appendRows() {
        groupDefinitions.forEach((group) => {
            const scenarios = scenarioDefinitions.filter((scenario) => scenario.group === group.key)

            if (scenarios.length === 0) {
                return
            }

            const body = tableEl.createTBody()
            appendGroupHeader(body, group.title)
            scenarios.forEach((scenario) => createRow(body, scenario))
        })
    }

    appendHeader()
    appendRows()
}

module.exports = {
    writeResult,
    writeFailure,
    generateTable,
}
