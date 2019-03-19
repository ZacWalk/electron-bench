//@ts-check

function write_to_table(where, what) {
    const element = document.getElementById(where)
    if (element) {
        element.innerText = what;
    }
}

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

function generateTableSync(numTests = [100, 1000, 10000]) {
    const tests = {
        sync_to_main: `synchronous to main <br/>ipcRenderer.sendSync api (1 hop)`,
        async_to_main: `asynchronous to main<br/>ipcRenderer.send api (1 hop)`,
        async_to_other_renderer: `asynchronous to other renderer <br/>ipcRenderer.send api (2 hops)`,
        async_send_to_other_renderer: `asynchronous to other renderer <br/>ipcRenderer.sendTo api (2 hops)`,
        async_to_iframe: `asynchronous to iframe <br/>iframe.contentWindow.postMessage api (in-proc)`
    }

    const table = document.getElementById('resultTable')
    table.innerHTML = ''

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
        table.append(thead)
    }

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
        table.append(row)
    }

    function appendRows() {
        Object.keys(tests).forEach(createRow)
    }

    appendHeader()
    appendRows()
}

async function generateTable(numTests) {
    return new Promise((resolve) => {
        generateTableSync(numTests)
        setTimeout(() => {
            resolve()
        }, 100);
    })
}

module.exports = {
    writeMeasuresToTable,
    write_to_table,
    generateTable,
}
