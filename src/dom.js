//@ts-check

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

/** @param {number[]} [numTests] */
function generateTableSync(numTests = [100, 1000, 10000]) {
    const tests = {
        sync_to_main: buildRouteCard({
            title: 'Synchronous to main',
            detail: 'ipcRenderer.sendSync API',
            routes: [
                { label: 'request', steps: ['Renderer', 'Main process'] },
                { label: 'reply', steps: ['Main process', 'Renderer'] },
            ],
        }),
        async_to_main: buildRouteCard({
            title: 'Asynchronous to main',
            detail: 'ipcRenderer.send API',
            routes: [
                { label: 'request', steps: ['Renderer', 'Main process'] },
                { label: 'reply', steps: ['Main process', 'Renderer'] },
            ],
        }),
        async_invoke_to_main: buildRouteCard({
            title: 'Request-response to main',
            detail: 'ipcRenderer.invoke API',
            routes: [
                { label: 'request', steps: ['Renderer', 'Main process'] },
                { label: 'reply', steps: ['Main process', 'Renderer'] },
            ],
        }),
        async_to_other_renderer: buildRouteCard({
            title: 'Asynchronous to other renderer',
            detail: 'ipcRenderer.send via main relay',
            routes: [
                { label: 'request', steps: ['Renderer', 'Main process', 'Background renderer'] },
                { label: 'reply', steps: ['Background renderer', 'Main process', 'Renderer'] },
            ],
        }),
        async_send_to_other_renderer: buildRouteCard({
            title: 'Asynchronous to other renderer',
            detail: 'main-routed relay API',
            routes: [
                { label: 'request', steps: ['Renderer', 'Main process', 'Background renderer'] },
                { label: 'reply', steps: ['Background renderer', 'Main process', 'Renderer'] },
            ],
        }),
        async_message_port_to_other_renderer: buildRouteCard({
            title: 'Direct channel to other renderer',
            detail: 'MessagePort API',
            routes: [
                { label: 'setup', steps: ['Renderer', 'Main process', 'Background renderer'] },
                { label: 'messages', steps: ['Renderer', 'Background renderer'], arrow: '⇄' },
            ],
        }),
        async_to_iframe: buildRouteCard({
            title: 'Asynchronous to iframe',
            detail: 'iframe.contentWindow.postMessage API',
            routes: [
                { label: 'request', steps: ['Renderer', 'iframe'] },
                { label: 'reply', steps: ['iframe', 'Renderer'] },
            ],
        }),
    }

    const table = /** @type {HTMLTableElement | null} */ (document.getElementById('resultTable'))
    if (!table) {
        return
    }

    const tableEl = table

    tableEl.innerHTML = ''

    function appendHeader() {
        const thead = document.createElement('thead')
        const headRow = document.createElement('tr')

        const headerCells = ['', ...numTests].map((num) => {
            const th = document.createElement('th')
            th.append(num.toString(), num ? " messages" : '')
            return th
        })

        headRow.append(...headerCells)
        thead.append(headRow)
        tableEl.append(thead)
    }

    /** @param {keyof typeof tests} test */
    function createRow(test) {
        const desc = tests[test];

        const row = document.createElement('tr')
        const spans = numTests.map(num => {
            const span = document.createElement('span')
            span.setAttribute('id', `${test}_${num}`)
            return span
        })
        const spanCells = spans.map(span => {
            const td = document.createElement('td')
            td.append(span)
            return td
        })

        const descCell = document.createElement('td')
        descCell.innerHTML = desc

        row.append(...[descCell, ...spanCells])
        tableEl.append(row)
    }

    function appendRows() {
        const testKeys = /** @type {(keyof typeof tests)[]} */ (Object.keys(tests))
        testKeys.forEach(createRow)
    }

    appendHeader()
    appendRows()
}

/** @param {number[]} numTests */
async function generateTable(numTests) {
    return new Promise((resolve) => {
        generateTableSync(numTests)
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
