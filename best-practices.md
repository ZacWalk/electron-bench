# IPC best practices

* Send smaller payload
    * Send only stuff that’s actually used, filter on sender side, not recipient
    * If some data can be calculated, do it on recipient side

* Send less messages
    * Do not que all messages immediately, if there is a bunch of them
    * Schedule messages 1ms apart, if you’re sending a lot of them (or big payload) and experiencing lagging

* Do not fill up the queue with multiple messages instantly, you’ll choke it (tens or more)

* JSON.stringifying the data before seems to have some positive impact

* Prefer `ipcRenderer.send` over `ipcRenderer.invoke` when you only need a fire-and-forget send plus a separate reply channel. `invoke` is convenient, but it usually carries extra promise and request-response overhead

* If you need direct renderer-to-renderer messaging at volume, `MessagePort` is usually the best place to start measuring because it avoids keeping the main process in the hot path for every message

* For communication that can stay inside one renderer process, `iframe.contentWindow.postMessage` is also a strong option and often lands close to `MessagePort` in this app

* `sendSync` is still the lowest-overhead option in raw latency terms, but it blocks the main process. Use it only when you really need synchronous behavior

* Don't block the main process. Use async wherever possible. **Blocking the main process also blocks the renderer process** - more information [here](https://medium.com/actualbudget/the-horror-of-blocking-electrons-main-process-351bf11a763c) and there is also [this tweet](https://twitter.com/joaomoreno/status/1031814234122928128) from our very own João Moreno. Blocking the main process blocks the IPC and renderer, making it seem that the IPC is slow.

## Refreshing benchmark data

Run `npm run bench:refresh-docs` to execute the scenarios from the command line, write structured results to `bench-results/latest.json`, and refresh the generated data section below.

If you only want the raw benchmark output, run `npm run bench:run`.

If you already have a saved benchmark JSON file, run `npm run bench:update-docs -- --input path/to/results.json`.

## Latest data

<!-- benchmark-data:start -->
These figures were generated from bench-results/latest.json on 30 March 2026 at 18:36:40.

Runtime: Node.js 24.14.0, Chromium 146.0.7680.166, Electron 41.1.0.

Run settings: wait time 1 ms, stringify JSON off, payload 333 bytes.

### Total time

| Scenario | 100 messages | 1000 messages | 10000 messages |
| --- | ---: | ---: | ---: |
| Synchronous to main (ipcRenderer.sendSync) | 17 ms | 137 ms | 1378 ms |
| Asynchronous to main (ipcRenderer.send) | 102 ms | 1003 ms | 10022 ms |
| Request-response to main (ipcRenderer.invoke) | 104 ms | 1008 ms | 10019 ms |
| Async to other renderer via main relay (ipcRenderer.send via main relay) | 106 ms | 1002 ms | 10013 ms |
| Async to other renderer via main-routed relay API (Main-routed relay API) | 103 ms | 1012 ms | 10023 ms |
| Direct channel to other renderer (MessagePort) | 102 ms | 1008 ms | 10017 ms |
| Async to iframe (iframe.contentWindow.postMessage) | 104 ms | 1013 ms | 10017 ms |

### Average round-trip time per message

| Scenario | 100 messages | 1000 messages | 10000 messages |
| --- | ---: | ---: | ---: |
| Synchronous to main (ipcRenderer.sendSync) | 0.164 ms | 0.134 ms | 0.136 ms |
| Asynchronous to main (ipcRenderer.send) | 0.486 ms | 0.503 ms | 0.599 ms |
| Request-response to main (ipcRenderer.invoke) | 0.408 ms | 0.563 ms | 0.542 ms |
| Async to other renderer via main relay (ipcRenderer.send via main relay) | 0.948 ms | 1.281 ms | 1.267 ms |
| Async to other renderer via main-routed relay API (Main-routed relay API) | 0.907 ms | 1.250 ms | 1.275 ms |
| Direct channel to other renderer (MessagePort) | 0.348 ms | 0.439 ms | 0.435 ms |
| Async to iframe (iframe.contentWindow.postMessage) | 0.391 ms | 0.464 ms | 0.463 ms |

### Scenario notes

* Synchronous to main (ipcRenderer.sendSync): Lowest raw latency, but it blocks the main process while each message is handled. In this run, the 10,000-message average was 0.136 ms.

* Asynchronous to main (ipcRenderer.send): A strong default when you already have a reply channel and want low async overhead. In this run, the 10,000-message average was 0.599 ms.

* Request-response to main (ipcRenderer.invoke): The ergonomics are good, but the promise-based invoke path typically costs more than send plus a reply event. In this run, the 10,000-message average was 0.542 ms.

* Async to other renderer via main relay (ipcRenderer.send via main relay): This is the most expensive cross-renderer route here because every round trip crosses the main process twice. In this run, the 10,000-message average was 1.267 ms.

* Async to other renderer via main-routed relay API (Main-routed relay API): Still a cross-process hop, so it should be measured against the older relay route in your actual workload rather than assumed to be faster. In this run, the 10,000-message average was 1.275 ms.

* Direct channel to other renderer (MessagePort): Best fit for sustained renderer-to-renderer traffic because setup is separate from the high-volume message loop. In this run, the 10,000-message average was 0.435 ms.

* Async to iframe (iframe.contentWindow.postMessage): Very efficient when communication can stay inside the same renderer process. In this run, the 10,000-message average was 0.463 ms.

### Practical takeaways from this run

* At the 10,000-message scale, the fastest non-blocking route in this run was Direct channel to other renderer (MessagePort) at 0.435 ms per message.

* The slowest path at 10,000 messages was Async to other renderer via main-routed relay API (Main-routed relay API) at 1.275 ms per message, which is a good reminder that extra cross-process hops add up quickly.

* For renderer-side traffic, MessagePort averaged 0.435 ms and iframe postMessage averaged 0.463 ms for 10,000 messages, so both remain strong choices when you can avoid a main-process round trip.
<!-- benchmark-data:end -->
