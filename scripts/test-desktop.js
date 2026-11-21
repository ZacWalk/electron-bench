const assert = require('node:assert/strict')
const { once } = require('node:events')
const { setTimeout: sleep } = require('node:timers/promises')
const { app, BrowserWindow } = require('electron')

app.once('browser-window-created', async (_event, window) => {
  const execute = (source) => window.webContents.executeJavaScript(source)
  const status = () => execute('document.getElementById("run_status")?.textContent')
  async function waitFor(prefix, timeout = 10000) {
    const until = Date.now() + timeout
    while (Date.now() < until) {
      if ((await status())?.startsWith(prefix)) return
      await sleep(25)
    }
    assert.fail(`Expected "${prefix}" but desktop reported "${await status()}"`)
  }

  try {
    await once(window.webContents, 'did-finish-load')
    await waitFor('Ready.')
    window.setSize(500, 650)
    assert.equal(await execute(`new Promise((resolve) => requestAnimationFrame(() => {
      const table = document.querySelector('.table_panel');
      resolve(table.scrollWidth > table.clientWidth);
    }))`), true)
    await execute(`document.querySelector('#milisMultiplier').value = '0';
      document.querySelector('#run_button').click()`)
    await waitFor('Enter a send interval')
    await execute(`document.querySelector('#milisMultiplier').value = '5';
      document.querySelector('#payloadInput').value = '{broken';
      document.querySelector('#run_button').click()`)
    await waitFor('Invalid payload JSON')
    await execute(`document.querySelector('#payloadInput').value = '"custom string payload"';
      document.querySelector('#run_mode').value = 'quick';
      document.querySelector('#run_button').click()`)
    await waitFor('9 of 16: Unsandboxed preload')
    assert.equal(await execute('document.querySelector("#payloadInput").disabled'), true)
    await execute('document.querySelector("#cancel_button").click()')
    await waitFor('Cancelled')
    assert.equal(await execute('document.querySelector("#resultSummary").hidden'), true)
    const background = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().endsWith('/background.html'))
    assert.ok(background, 'Expected a background renderer before the rerun')
    background.destroy()
    await execute(`document.querySelector('#milisMultiplier').value = '1';
      document.querySelector('#run_button').click()`)
    await waitFor('Finished: 16 results.', 30000)
    assert.match(await execute(`document.querySelector('#resultSummary:not([hidden]) svg')?.textContent ?? ''`),
      /Transport routes \| 100 messages[\s\S]*Payload size and shape \| 100 messages/)
    assert.equal(await execute('document.querySelectorAll(".result_latency").length'), 16)
    assert.match(await execute('document.querySelector("#sync_to_main_100").textContent'), /p50 .*p99 .*Main CPU/)
    assert.equal(await execute(`(() => {
      const details = document.querySelector('.extra_details');
      const hidden = getComputedStyle(details).display === 'none';
      document.querySelector('#show_percentage').click();
      return hidden && getComputedStyle(details).display !== 'none';
    })()`), true)
    console.log('Desktop controls passed: layout, validation, cancellation, rerun after background window recreation, chart, and latency details.')
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})

const watchdog = setTimeout(() => {
  console.error('Desktop test exceeded 60 seconds.')
  app.exit(1)
}, 60000)
watchdog.unref()
require('../src/main')
