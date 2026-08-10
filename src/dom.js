//@ts-check
const { scenarioDefinitions, groupDefinitions } = require('./benchmark-config')

/** @param {string} where @param {string | number} what */
function write_to_table(where, what) {
    const element = document.getElementById(where)
    if (element) {
        element.innerText = String(what);
    }
}

/** @param {string} where @param {{ average(): number, getPercentile(p: number): number }} measures */
function writeMeasuresToTable(where, measures) {
    const element = document.getElementById(where)
    const childEl = document.createElement("div");
    childEl.innerHTML = `<p class="measures">
    avg: ${ measures.average()} ms </br>
    p1: ${ measures.getPercentile(1) }</br>
    p25: ${ measures.getPercentile(25) }</br>
    p50: ${ measures.getPercentile(50) }</br>
    p75: ${ measures.getPercentile(75) }</br>
    p90: ${ measures.getPercentile(90) }</br>
    p99: ${ measures.getPercentile(99) }</br>
    last: ${ measures.getPercentile(100) }</br>
    </p>`
    if (element) {
        element.appendChild(childEl)
    }
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
function generateTableSync(columnCounts = [100, 1000, 10000], scenarioCounts) {
    const table = /** @type {HTMLTableElement | null} */ (document.getElementById('resultTable'))
    if (!table) {
        return
    }

    const tableEl = table

    tableEl.innerHTML = ''

    function appendHeader() {
        const thead = document.createElement('thead')
        const headRow = document.createElement('tr')

        const headerCells = ['', ...columnCounts].map((num) => {
            const th = document.createElement('th')
            th.append(num.toString(), num ? " messages" : '')
            return th
        })

        headRow.append(...headerCells)
        thead.append(headRow)
        tableEl.append(thead)
    }

    /** @param {string} title */
    function appendGroupHeader(title) {
        const row = document.createElement('tr')
        row.className = 'group_row'

        const cell = document.createElement('td')
        cell.setAttribute('colspan', String(columnCounts.length + 1))
        cell.textContent = title

        row.append(cell)
        tableEl.append(row)
    }

    /** @param {typeof scenarioDefinitions[number]} scenario */
    function createRow(scenario) {
        const counts = (scenarioCounts && scenarioCounts.get(scenario.key)) || scenario.counts
        const row = document.createElement('tr')

        const descCell = document.createElement('td')
        descCell.innerHTML = buildRouteCard(scenario.route)

        const valueCells = columnCounts.map((num) => {
            const td = document.createElement('td')

            if (counts.includes(num)) {
                const span = document.createElement('span')
                span.setAttribute('id', `${scenario.key}_${num}`)
                td.append(span)
            }

            return td
        })

        row.append(...[descCell, ...valueCells])
        tableEl.append(row)
    }

    function appendRows() {
        groupDefinitions.forEach((group) => {
            const scenarios = scenarioDefinitions.filter((scenario) => scenario.group === group.key)

            if (scenarios.length === 0) {
                return
            }

            appendGroupHeader(group.title)
            scenarios.forEach(createRow)
        })
    }

    appendHeader()
    appendRows()
}

/** @param {number[]} columnCounts @param {Map<string, number[]>} [scenarioCounts] */
async function generateTable(columnCounts, scenarioCounts) {
    return new Promise((resolve) => {
        generateTableSync(columnCounts, scenarioCounts)
        setTimeout(() => {
            resolve(undefined)
        }, 100);
    })
}

module.exports = {
    writeMeasuresToTable,
    write_to_table,
    generateTable,
}
