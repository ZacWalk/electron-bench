# IPC best practices

## How to read these numbers

Latency is not the interesting axis. Almost every route in this repo lands within about 1 ms per message, which is invisible to a user. What separates them is **how much main-process CPU they burn**, because the main process is the one thread every window in your app depends on. Each scenario below therefore reports both.

Transport and bridge scenarios schedule one message every send-spacing interval. Payload scenarios send strictly one at a time and wait for each round trip, because a large payload takes far longer than the send spacing and would otherwise measure queue depth instead of cost.

These are single-run numbers from one machine. The ordering between routes is stable; the exact multiples move noticeably between runs, especially the CPU figures. Treat them as shape, not as constants.

## Keep the main process out of the hot path

* Prefer `MessagePort` or a `utilityProcess` channel for sustained traffic. Both move messages directly between the endpoints, so main-process CPU stays near the floor
* Routes that relay through main pay for it twice, and the cost shows up as main-process CPU rather than as latency
* If the traffic can stay inside one renderer, `iframe.contentWindow.postMessage` is the cheapest option measured here

* `sendSync` has the lowest measured latency and one of the highest main-process CPU costs. The latency number is what makes people reach for it, and the CPU number is why it hurts. Use it only when you genuinely need synchronous behaviour

* Prefer `ipcRenderer.send` over `ipcRenderer.invoke` when you only need a fire-and-forget send plus a separate reply channel. `invoke` is convenient, but the promise-based request-response machinery costs noticeably more main-process CPU for the same number of messages

* Don't block the main process. Use async wherever possible. **Blocking the main process also blocks the renderer process** - more information [here](https://medium.com/actualbudget/the-horror-of-blocking-electrons-main-process-351bf11a763c) and there is also [this tweet](https://twitter.com/joaomoreno/status/1031814234122928128) from our very own João Moreno. Blocking the main process blocks the IPC and renderer, making it seem that the IPC is slow.

## Use a utility process, not a hidden window

* For background Node work, `utilityProcess` is the supported answer and measures on par with a hidden `BrowserWindow` for messaging. A hidden window drags a whole renderer, and its Chromium and Blink overhead, along with it

## Payload dominates everything else

* Send smaller payloads
    * Send only stuff that's actually used, filter on sender side, not recipient
    * If some data can be calculated, do it on recipient side
* Payload size moves per-message cost by orders of magnitude, far more than the choice of transport does. A 1 MB JSON object costs around a hundred times what a 1 KB object costs on the same route
* Object *shape* matters as well as size: a deeply nested object is more expensive than a flat one of similar byte count, because structured clone walks the graph
* Move bulk binary data as an `ArrayBuffer` with a transfer list rather than letting it be cloned. The same buffer sent by transfer instead of copy is measurably cheaper, and the gap grows with size

## Sandbox and contextBridge

* `sandbox: true` plus `contextBridge` is the modern default and the shape most apps ship. In this benchmark it is not a meaningful latency tax compared with an unsandboxed preload calling `ipcRenderer` directly, so performance is a weak argument for turning the sandbox off
* Do not expose `ipcRenderer` itself over the bridge. Expose narrow, purpose-built functions

## Scheduling

* Send fewer messages. Batch where you can
* Do not fill up the queue with many messages at once, you'll choke it. Schedule them apart if you are sending a lot of them and seeing lag

## Refreshing benchmark data

Run `npm run bench:refresh-docs` to execute the scenarios from the command line, write structured results to `bench-results/latest.json`, and refresh the generated data section below.

If you only want the raw benchmark output, run `npm run bench:run`.

If you already have a saved benchmark JSON file, run `npm run bench:update-docs -- --input path/to/results.json`.

## Latest data

<!-- benchmark-data:start -->
These figures were generated from bench-results/latest.json on 10 August 2026 at 16:17:27.

Runtime: Node.js 24.18.0, Chromium 150.0.7871.129, Electron 43.2.0.

Run settings: send spacing 1 ms, default payload 333 bytes.

Transport and bridge scenarios schedule one message every send-spacing interval. Payload scenarios send strictly one at a time, waiting for each round trip, because a large payload takes far longer to complete than the send spacing and would otherwise be measuring queue depth. Both measure unloaded latency, not saturated throughput.

Main-process CPU is sampled from the OS, which accounts CPU in ~16 ms ticks on Windows. Small values round to 0 and only become meaningful at the larger message counts.

### Transport routes

Same payload and same send schedule on every route, so the difference is the transport itself.

#### Round-trip latency per message, p50 / p99 in ms

| Scenario | 100 messages | 1000 messages | 10000 messages |
| --- | ---: | ---: | ---: |
| Synchronous to main (ipcRenderer.sendSync) | 0.200 / 0.700 | 0.200 / 0.600 | 0.200 / 0.600 |
| Asynchronous to main (ipcRenderer.send) | 0.500 / 1.100 | 0.500 / 1.500 | 0.700 / 2.500 |
| Request-response to main (ipcRenderer.invoke) | 0.800 / 9.300 | 0.600 / 3.400 | 0.400 / 1.600 |
| Async to other renderer via main relay (ipcRenderer.send via main relay) | 1.300 / 2.400 | 1.500 / 3.800 | 1.700 / 4.800 |
| Async to other renderer via main-routed relay API (Main-routed relay API) | 1.400 / 2.400 | 1.500 / 14.500 | 1.500 / 3.500 |
| Direct channel to other renderer (MessagePort) | 0.500 / 1.000 | 0.600 / 1.100 | 0.500 / 1.000 |
| Direct channel to utility process (utilityProcess + MessagePort) | 0.400 / 0.900 | 0.500 / 0.900 | 0.500 / 1.000 |
| Async to iframe (iframe.contentWindow.postMessage) | 0.500 / 0.800 | 0.700 / 1.400 | 0.600 / 1.100 |

#### Main-process CPU consumed while the scenario ran, in ms

| Scenario | 100 messages | 1000 messages | 10000 messages |
| --- | ---: | ---: | ---: |
| Synchronous to main (ipcRenderer.sendSync) | 63.0 | 125.0 | 1281.0 |
| Asynchronous to main (ipcRenderer.send) | 15.0 | 360.0 | 1062.0 |
| Request-response to main (ipcRenderer.invoke) | 0.0 | 282.0 | 1672.0 |
| Async to other renderer via main relay (ipcRenderer.send via main relay) | 77.0 | 126.0 | 2015.0 |
| Async to other renderer via main-routed relay API (Main-routed relay API) | 125.0 | 218.0 | 1454.0 |
| Direct channel to other renderer (MessagePort) | 0.0 | 94.0 | 375.0 |
| Direct channel to utility process (utilityProcess + MessagePort) | 0.0 | 0.0 | 140.0 |
| Async to iframe (iframe.contentWindow.postMessage) | 0.0 | 63.0 | 62.0 |

### Sandbox and contextBridge cost

Identical invoke loop run in a sandboxed renderer through contextBridge versus an unsandboxed preload calling ipcRenderer directly.

#### Round-trip latency per message, p50 / p99 in ms

| Scenario | 1000 messages |
| --- | ---: |
| Unsandboxed preload, direct ipcRenderer (sandbox: false + ipcRenderer.invoke) | 0.500 / 1.100 |
| Sandboxed renderer through contextBridge (sandbox: true + contextBridge + ipcRenderer.invoke) | 0.600 / 0.900 |

#### Main-process CPU consumed while the scenario ran, in ms

| Scenario | 1000 messages |
| --- | ---: |
| Unsandboxed preload, direct ipcRenderer (sandbox: false + ipcRenderer.invoke) | 16.0 |
| Sandboxed renderer through contextBridge (sandbox: true + contextBridge + ipcRenderer.invoke) | 0.0 |

### Payload size and shape

Transport is held constant (MessagePort to a background renderer) and only the payload changes. These scenarios send one message at a time and wait for each round trip, so the number is service time rather than queue depth. This route never touches the main process, so main-process CPU is not reported.

#### Round-trip latency per message, p50 / p99 in ms

| Scenario | 100 messages |
| --- | ---: |
| JSON object, 1 KB (MessagePort) | 0.200 / 0.400 |
| JSON object, 64 KB (MessagePort) | 1.500 / 5.400 |
| JSON object, 1 MB (MessagePort) | 21.500 / 24.100 |
| Deeply nested object (MessagePort) | 0.400 / 0.600 |
| ArrayBuffer, 1 MB, copied (MessagePort) | 4.100 / 9.800 |
| ArrayBuffer, 1 MB, transferred (MessagePort with transfer list) | 3.200 / 5.400 |

### Scenario notes

* Synchronous to main (ipcRenderer.sendSync): Low round-trip latency because there is no reply event, but it blocks the main process for the whole call. Read the main-process CPU row, not the latency row. In this run, the 10000-message p50 was 0.200 ms.

* Asynchronous to main (ipcRenderer.send): A strong default when you already have a reply channel and want low async overhead. In this run, the 10000-message p50 was 0.700 ms.

* Request-response to main (ipcRenderer.invoke): The ergonomics are good, but the promise-based invoke path typically costs more than send plus a reply event. In this run, the 10000-message p50 was 0.400 ms.

* Async to other renderer via main relay (ipcRenderer.send via main relay): This is the most expensive cross-renderer route here because every round trip crosses the main process twice. In this run, the 10000-message p50 was 1.700 ms.

* Async to other renderer via main-routed relay API (Main-routed relay API): Still a cross-process hop, so it should be measured against the older relay route in your actual workload rather than assumed to be faster. In this run, the 10000-message p50 was 1.500 ms.

* Direct channel to other renderer (MessagePort): Best fit for sustained renderer-to-renderer traffic because setup is separate from the high-volume message loop. In this run, the 10000-message p50 was 0.500 ms.

* Direct channel to utility process (utilityProcess + MessagePort): The modern place for background Node work. Compare it against the hidden background renderer on the row above before you reach for a hidden window. In this run, the 10000-message p50 was 0.500 ms.

* Async to iframe (iframe.contentWindow.postMessage): Very efficient when communication can stay inside the same renderer process. In this run, the 10000-message p50 was 0.600 ms.

* Unsandboxed preload, direct ipcRenderer (sandbox: false + ipcRenderer.invoke): Control for the bridge comparison. The benchmark loop runs inside the preload and calls ipcRenderer directly. In this run, the 1000-message p50 was 0.500 ms.

* Sandboxed renderer through contextBridge (sandbox: true + contextBridge + ipcRenderer.invoke): The shape most Electron apps actually ship. The loop runs in the page main world and every call crosses the contextBridge into the preload. In this run, the 1000-message p50 was 0.600 ms.

* JSON object, 1 KB (MessagePort): Baseline payload for the size sweep. In this run, the 100-message p50 was 0.200 ms.

* JSON object, 64 KB (MessagePort): Sixty-four times the bytes of the baseline, on the same transport. In this run, the 100-message p50 was 1.500 ms.

* JSON object, 1 MB (MessagePort): Where structured clone cost dominates transport cost completely. In this run, the 100-message p50 was 21.500 ms.

* Deeply nested object (MessagePort): Similar byte count to a small flat payload but deeply nested, which isolates object shape from raw size. In this run, the 100-message p50 was 0.400 ms.

* ArrayBuffer, 1 MB, copied (MessagePort): A 1 MB ArrayBuffer sent without a transfer list, so it is copied in both directions. In this run, the 100-message p50 was 4.100 ms.

* ArrayBuffer, 1 MB, transferred (MessagePort with transfer list): The same 1 MB ArrayBuffer moved with a transfer list instead of copied. This is the cheapest way to move bulk binary data between processes. In this run, the 100-message p50 was 3.200 ms.

### Practical takeaways from this run

* Fastest transport at 10000 messages was Synchronous to main (ipcRenderer.sendSync) at a p50 of 0.200 ms.

* Slowest transport was Async to other renderer via main relay (ipcRenderer.send via main relay) at a p50 of 1.700 ms, which is what extra cross-process hops cost.

* sendSync looks fastest on latency and is one of the most expensive routes in practice: 0.200 ms p50, but 1281 ms of main-process CPU at 10000 messages, 21x the cheapest route measured here. That CPU is spent on the thread every window depends on.

* The route that cost the main process most was Async to other renderer via main relay (ipcRenderer.send via main relay) at 2015.0 ms of main-process CPU, against 62.0 ms for Async to iframe. Latency alone does not show this, and main-process CPU is what turns into jank for every window in the app.

* A sandboxed renderer calling through contextBridge measured a p50 of 0.600 ms against 0.500 ms for an unsandboxed preload calling ipcRenderer directly: +0.100 ms per call, or 1.20x. That is the price of the configuration most apps ship.

* Moving a 1 MB ArrayBuffer with a transfer list measured a p50 of 3.200 ms against 4.100 ms when copied, or 1.3x cheaper. The bytes still cross the process boundary either way; the transfer list removes the copies on each side, so the gap widens as buffers grow.
<!-- benchmark-data:end -->
