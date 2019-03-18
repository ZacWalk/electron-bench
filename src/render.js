//@ts-check
const {
  SyncToMainTest,
  AsyncToMainTest,
  AsyncToOtherRendererTest,
  AsyncSendToOtherRendererTest,
  AsyncToIframeTest
} = require('./tests/Test')

const {
  write_to_table
} = require('./dom')

let resolvers = new Map

function saveResolver(key, resolver) {
  resolvers.set(key, resolver)
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
  SyncToMainTest.run(100)
  SyncToMainTest.run(1000)
  SyncToMainTest.run(10000)

  await AsyncToMainTest.run(100)
  await AsyncToMainTest.run(1000)
  await AsyncToMainTest.run(10000)

  await AsyncToOtherRendererTest.run(100)
  await AsyncToOtherRendererTest.run(1000)
  await AsyncToOtherRendererTest.run(10000)

  await AsyncSendToOtherRendererTest.run(100)
  await AsyncSendToOtherRendererTest.run(1000)
  await AsyncSendToOtherRendererTest.run(10000)

  await AsyncToIframeTest.run(100)
  await AsyncToIframeTest.run(1000)
  await AsyncToIframeTest.run(10000)

  // await async_to_webview(10)
  // await async_to_webview(100)
  // await async_to_webview(10000)
}
