//@ts-check

const MeasurementProvider = require("./MeasurementProvider");

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


module.exports = {
    writeMeasuresToTable, write_to_table
}
