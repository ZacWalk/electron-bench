const { ipcRenderer } = require('electron')


function write_to_table(where, what)
{
  const element = document.getElementById(where)
  if (element) {
    element.innerText = what;
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

const payload = json
// const payload = JSON.stringify(json)

function sync_to_main(count) {
  let start = performance.now();
  for (let i = 0; i < count; i++) {
    ipcRenderer.sendSync('synchronous-message', payload)
  }

  const time = Math.round(performance.now() - start);
  write_to_table('sync_to_main_' + count, time);
}

let resolvers = new Map

ipcRenderer.on('asynchronous-reply', (event, key) => {
  resolvers.get(key)();
  resolvers.delete(key);
})

window.addEventListener('message', function (e) {
  let key = e.data;
  resolvers.get(key)();
  resolvers.delete(key);
});

async function async_to_main(count) {
  let start = performance.now();
  let promises = [];

  for (let i = 0; i < count; i++) {
    promises.push( new Promise(function(resolve, reject) {
      let key = "async_to_main_" + count + "_" + i;
      resolvers.set(key, resolve);
      ipcRenderer.send('asynchronous-message', key, payload)
    }));
  }

  await Promise.all(promises);
  const time = Math.round(performance.now() - start);
  write_to_table('async_to_main_' + count, time);
}

async function async_to_other_renderer(count)
{
  let start = performance.now();
  let promises = [];

  for (let i = 0; i < count; i++) {
    promises.push( new Promise(function(resolve, reject) {
      let key = "async_to_other_renderer_" + count + "_" + i;
      resolvers.set(key, resolve);
      ipcRenderer.send('asynchronous-message-proxy', key, payload)
    }));
  }

  await Promise.all(promises);
  const time = Math.round(performance.now() - start);
  write_to_table('async_to_other_renderer_' + count, time);
}

async function async_send_to_other_renderer(count)
{
  let webContentsId = ipcRenderer.sendSync('get-id', 'background')
  let start = performance.now();
  let promises = [];

  for (let i = 0; i < count; i++) {
    promises.push( new Promise(function(resolve, reject) {
      let key = "async_send_to_other_renderer_" + count + "_" + i;
      resolvers.set(key, resolve);
      ipcRenderer.sendTo(webContentsId, 'asynchronous-message-send-to', key, payload)
    }));
  }

  await Promise.all(promises);
  const time = Math.round(performance.now() - start);
  write_to_table('async_send_to_other_renderer_' + count, time);
}

async function async_to_iframe(count)
{
  let iframeEl = document.getElementById('the_iframe');
  let start = performance.now();
  let promises = [];

  for (let i = 0; i < count; i++) {
    promises.push( new Promise(function(resolve, reject) {
      let key = "async_to_iframe_" + count + "_" + i;
      resolvers.set(key, resolve);
      iframeEl.contentWindow.postMessage(key, '*')
    }));
  }

  await Promise.all(promises);
  const time = Math.round(performance.now() - start);
  write_to_table('async_to_iframe_' + count, time);
}

async function async_to_webview(count) {
  let webviewEl = document.getElementById('the_webview');
  // let start = performance.now();
  // let promises = [];

  // for (let i = 0; i < count; i++) {
  //   promises.push( new Promise(function(resolve, reject) {
  //     let key = "async_to_webview_" + count + "_" + i;
  //     resolvers.set(key, resolve);
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
      resolvers.set(key, resolve);
      webviewEl.send('asynchronous-message', key)
    }));
  }

  await Promise.all(promises);
  const time = Math.round(performance.now() - start);
  write_to_table('async_to_webview_' + count, time);

  webview.removeEventListener('ipc-message', listener)
}

window.run_bench = async function ()
{
  // warmn up
  sync_to_main(1);
  await async_to_main(1);
  await async_to_other_renderer(1)
  await async_send_to_other_renderer(1)
  await async_to_iframe(1)
  // await async_to_webview(1)

  // test
  sync_to_main(100);
  sync_to_main(1000);
  sync_to_main(10000);

  await async_to_main(100);
  await async_to_main(1000);
  await async_to_main(10000);

  await async_to_other_renderer(100)
  await async_to_other_renderer(1000)
  await async_to_other_renderer(10000)

  await async_send_to_other_renderer(100)
  await async_send_to_other_renderer(1000)
  await async_send_to_other_renderer(10000)

  await async_to_iframe(100)
  await async_to_iframe(1000)
  await async_to_iframe(10000)

  // await async_to_webview(10)
  // await async_to_webview(100)
  // await async_to_webview(10000)
}
