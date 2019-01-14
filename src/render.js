const { ipcRenderer } = require('electron')


function write_to_table(where, what)
{
  document.getElementById(where).innerText = what;
}

function sync_to_main(count) {
  let start = performance.now();
  for (let i = 0; i < count; i++) {
    ipcRenderer.sendSync('synchronous-message', 'ping')
  }

  const time = Math.round(performance.now() - start);
  write_to_table('sync_to_main_' + count, time);
}

let resolvers = new Map

ipcRenderer.on('asynchronous-reply', (event, arg) => {
  resolvers.get(arg)();
  resolvers.delete(arg);
})

async function async_to_main(count) {
  let start = performance.now();  
  let promises = [];

  for (let i = 0; i < count; i++) {
    promises.push( new Promise(function(resolve, reject) {      
      let key = "async_to_main_" + count + "_" + i;
      resolvers.set(key, resolve);
      ipcRenderer.send('asynchronous-message', key)
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
      ipcRenderer.send('asynchronous-message-proxey', key)
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
      ipcRenderer.sendTo(webContentsId, 'asynchronous-message-send-to', key)
    }));        
  }

  await Promise.all(promises);
  const time = Math.round(performance.now() - start);
  write_to_table('async_send_to_other_renderer_' + count, time);
}

async function async_to_iframe(count) { }
async function async_to_webview(count) { }


window.run_bench = async function ()
{
  // warmn up
  sync_to_main(1);
  await async_to_main(1);
  await async_to_other_renderer(1) 

  // test
  sync_to_main(1);
  sync_to_main(10);
  sync_to_main(1000);

  await async_to_main(1);
  await async_to_main(10);
  await async_to_main(1000);

  await async_to_other_renderer(1) 
  await async_to_other_renderer(10) 
  await async_to_other_renderer(1000) 

  await async_to_other_renderer(1) 
  await async_to_other_renderer(10) 
  await async_to_other_renderer(1000) 

  await async_send_to_other_renderer(1) 
  await async_send_to_other_renderer(10) 
  await async_send_to_other_renderer(1000) 
}