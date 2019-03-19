//@ts-check
const {
  SyncToMainTest,
  AsyncToMainTest,
  AsyncToOtherRendererTest,
  AsyncSendToOtherRendererTest,
  AsyncToIframeTest
} = require('./tests/Test')

const {
  generateTable,
  write_to_table,
  clearTable
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

// Define number of tests that will be run
const numTests = [100, 1000, 10000]

// Define test functions that will be run, e.g. AsyncToMainTest.run(100)
const tests = [
  SyncToMainTest.run,
  AsyncToMainTest.run,
  AsyncToOtherRendererTest.run,
  AsyncSendToOtherRendererTest.run,
  AsyncToIframeTest.run
]


window.generateTable = () => {
  generateTable(numTests)
}

window.run_bench = async function (stringify)
{

  // Generate empty table again
  await generateTable(numTests)

  // Generate test functions bound to numbers
  const testBench = []
  tests.forEach(test => {
    numTests.forEach(num => {
      testBench.push(test.bind(this, num))
    })
  })

  // run the tests
  for (let i = 0; i < testBench.length; i++) {
    const test = testBench[i];
    await test()
  }


  // await async_to_webview(10)
  // await async_to_webview(100)
  // await async_to_webview(10000)
}
