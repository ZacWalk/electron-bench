const { ipcRenderer } = require('electron')
const MeasurementProvider = require('./MeasurementProvider.js')

function write_to_table(where, what)
{
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
    p90: ${ measures.getPercentile(90) }</br>
    p99: ${ measures.getPercentile(99) }</br>
    </p>`
  if (element) {
    element.appendChild(childEl)
  }
}

const json = {
  "firstName": "John",
  "lastName": "Smith",
  "isAlive": true,
  "age": 27,
  "address": {
    "streetAddress": "21 2nd Street",
    "city": "New York",
    "state": "NY",
    "postalCode": "10021-3100"
  },
  "phoneNumbers": [
    {
      "type": "home",
      "number": "212 555-1234"
    },
    {
      "type": "office",
      "number": "646 555-4567"
    },
    {
      "type": "mobile",
      "number": "123 456-7890"
    }
  ],
  "children": [],
  "spouse": null
}

let resolvers = new Map
let measurements = new Map

function calculateAndShowPvalues(key) {

  const shouldMeasure = document.getElementById("show_percentage").checked
  if (!shouldMeasure) return

  writeMeasuresToTable(key, new MeasurementProvider(key, measurements))
  measurements.clear()
}

function sync_to_main(stringify, count) {
  let start = performance.now();
  for (let i = 0; i < count; i++) {
    const startTime = performance.now();

    const payload = stringify ? JSON.stringify(json) : json
    ipcRenderer.sendSync('synchronous-message', payload)

    const endTime = performance.now();

    let key = "sync_to_main_" + count + "_" + i;
    measurements.set(key, {startTime, endTime})
  }

  const time = Math.round(performance.now() - start);
  write_to_table('sync_to_main_' + count, time);

  calculateAndShowPvalues('sync_to_main_' + count)
}

function saveResolver(key, resolver) {
  measurements.set(key, {
    startTime: performance.now()
  })
  resolvers.set(key, resolver)
}

function processReply(key, payload) {
  if (typeof payload === 'string') {
    JSON.parse(payload)
  }
  measurements.set(key, Object.assign(measurements.get(key), { endTime: performance.now() }))
  resolvers.get(key)();
  resolvers.delete(key);
}

ipcRenderer.on('asynchronous-reply', (event, key, payload) => {
  processReply(key, payload)
})

window.addEventListener('message', function (e) {
  let { key, payload } = e.data;
  processReply(key, payload)
});

async function async_to_main(stringify, count) {
  let start = performance.now();
  let promises = [];

  for (let i = 0; i < count; i++) {
    promises.push( new Promise(function(resolve, reject) {
      let key = "async_to_main_" + count + "_" + i;
      saveResolver(key, resolve);
      const payload = stringify ? JSON.stringify(json) : json
      ipcRenderer.send('asynchronous-message', key, payload)
    }));
  }

  await Promise.all(promises);

  const time = Math.round(performance.now() - start);
  write_to_table('async_to_main_' + count, time);

  calculateAndShowPvalues('async_to_main_' + count)
}

async function async_to_other_renderer(stringify, count)
{
  let start = performance.now();
  let promises = [];

  for (let i = 0; i < count; i++) {
    promises.push( new Promise(function(resolve, reject) {
      let key = "async_to_other_renderer_" + count + "_" + i;
      saveResolver(key, resolve);
      const payload = stringify ? JSON.stringify(json) : json
      ipcRenderer.send('asynchronous-message-proxy', key, payload)
    }));
  }

  await Promise.all(promises);
  const time = Math.round(performance.now() - start);
  write_to_table('async_to_other_renderer_' + count, time);

  calculateAndShowPvalues('async_to_other_renderer_' + count)
}

async function async_send_to_other_renderer(stringify, count)
{
  let webContentsId = ipcRenderer.sendSync('get-id', 'background')
  let start = performance.now();
  let promises = [];

  for (let i = 0; i < count; i++) {
    promises.push( new Promise(function(resolve, reject) {
      let key = "async_send_to_other_renderer_" + count + "_" + i;
      saveResolver(key, resolve);
      const payload = stringify ? JSON.stringify(json) : json
      ipcRenderer.sendTo(webContentsId, 'asynchronous-message-send-to', key, payload)
    }));
  }

  await Promise.all(promises);
  const time = Math.round(performance.now() - start);
  write_to_table('async_send_to_other_renderer_' + count, time);

  calculateAndShowPvalues('async_send_to_other_renderer_' + count)
}

async function async_to_iframe(stringify, count)
{
  let iframeEl = document.getElementById('the_iframe');
  let start = performance.now();
  let promises = [];

  for (let i = 0; i < count; i++) {
    promises.push( new Promise(function(resolve, reject) {
      let key = "async_to_iframe_" + count + "_" + i;
      saveResolver(key, resolve);
      const payload = stringify ? JSON.stringify(json) : json
      iframeEl.contentWindow.postMessage({ key, payload }, '*')
    }));
  }

  await Promise.all(promises);
  const time = Math.round(performance.now() - start);
  write_to_table('async_to_iframe_' + count, time);

  calculateAndShowPvalues('async_to_iframe_' + count)
}

async function async_to_webview(count) {
  let webviewEl = document.getElementById('the_webview');
  // let start = performance.now();
  // let promises = [];

  // for (let i = 0; i < count; i++) {
  //   promises.push( new Promise(function(resolve, reject) {
  //     let key = "async_to_webview_" + count + "_" + i;
  //     saveResolver(key, resolve);
  //     webviewEl.send(key)
  //   }));
  // }

  // await Promise.all(promises);
  // const time = Math.round(performance.now() - start);
  // write_to_table('async_to_webview_' + count, time);

  let start = performance.now();
  let promises = [];
  let listener = event => {
    // prints "ping"
    resolvers.get(event.arg)();
    resolvers.delete(event.arg);
  }

  webview.addEventListener('ipc-message', listener)

  for (let i = 0; i < count; i++) {
    promises.push( new Promise(function(resolve, reject) {
      let key = "async_to_webview_" + count + "_" + i;
      saveResolver(key, resolve);
      webviewEl.send('asynchronous-message', key)
    }));
  }

  await Promise.all(promises);
  const time = Math.round(performance.now() - start);
  write_to_table('async_to_webview_' + count, time);

  webview.removeEventListener('ipc-message', listener)
}

window.run_bench = async function (stringify)
{
  // warm up
  sync_to_main(1);
  await async_to_main(1);
  await async_to_other_renderer(1)
  await async_send_to_other_renderer(1)
  await async_to_iframe(1)
  // await async_to_webview(1)

  // test
  sync_to_main(stringify, 100);
  sync_to_main(stringify, 1000);
  sync_to_main(stringify, 10000);

  await async_to_main(stringify, 100);
  await async_to_main(stringify, 1000);
  await async_to_main(stringify, 10000);

  await async_to_other_renderer(stringify, 100)
  await async_to_other_renderer(stringify, 1000)
  await async_to_other_renderer(stringify, 10000)

  await async_send_to_other_renderer(stringify, 100)
  await async_send_to_other_renderer(stringify, 1000)
  await async_send_to_other_renderer(stringify, 10000)

  await async_to_iframe(stringify, 100)
  await async_to_iframe(stringify, 1000)
  await async_to_iframe(stringify, 10000)

  // await async_to_webview(10)
  // await async_to_webview(100)
  // await async_to_webview(10000)
}
