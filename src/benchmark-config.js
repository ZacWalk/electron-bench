// Message counts for the transport sweep. Other groups pin a single count so the
// generated tables keep the same three columns.
const numTests = [100, 1000, 10000]
const BRIDGE_COUNT = 1000
const PAYLOAD_COUNT = 100

const GROUP_TRANSPORT = 'transport'
const GROUP_BRIDGE = 'bridge'
const GROUP_PAYLOAD = 'payload'

const groupDefinitions = [
  {
    key: GROUP_TRANSPORT,
    title: 'Transport routes',
    description: 'Same payload and same send schedule on every route, so the difference is the transport itself.',
  },
  {
    key: GROUP_BRIDGE,
    title: 'Sandbox and contextBridge cost',
    description: 'Identical invoke loop run in a sandboxed renderer through contextBridge versus an unsandboxed preload calling ipcRenderer directly.',
  },
  {
    key: GROUP_PAYLOAD,
    title: 'Payload size and shape',
    description: 'Transport is held constant (MessagePort to a background renderer) and only the payload changes. These scenarios send one message at a time and wait for each round trip, so the number is service time rather than queue depth. This route never touches the main process, so main-process CPU is not reported.',
    showMainCost: false,
  },
]

const scenarioDefinitions = [
  {
    key: 'sync_to_main',
    group: GROUP_TRANSPORT,
    counts: numTests,
    title: 'Synchronous to main',
    api: 'ipcRenderer.sendSync',
    commentary: 'Low round-trip latency because there is no reply event, but it blocks the main process for the whole call. Read the main-process CPU row, not the latency row.',
    route: {
      title: 'Synchronous to main',
      detail: 'ipcRenderer.sendSync API',
      routes: [
        { label: 'request', steps: ['Renderer', 'Main process'] },
        { label: 'reply', steps: ['Main process', 'Renderer'] },
      ],
    },
  },
  {
    key: 'async_to_main',
    group: GROUP_TRANSPORT,
    counts: numTests,
    title: 'Asynchronous to main',
    api: 'ipcRenderer.send',
    commentary: 'A strong default when you already have a reply channel and want low async overhead.',
    route: {
      title: 'Asynchronous to main',
      detail: 'ipcRenderer.send API',
      routes: [
        { label: 'request', steps: ['Renderer', 'Main process'] },
        { label: 'reply', steps: ['Main process', 'Renderer'] },
      ],
    },
  },
  {
    key: 'async_invoke_to_main',
    group: GROUP_TRANSPORT,
    counts: numTests,
    title: 'Request-response to main',
    api: 'ipcRenderer.invoke',
    commentary: 'The ergonomics are good, but the promise-based invoke path typically costs more than send plus a reply event.',
    route: {
      title: 'Request-response to main',
      detail: 'ipcRenderer.invoke API',
      routes: [
        { label: 'request', steps: ['Renderer', 'Main process'] },
        { label: 'reply', steps: ['Main process', 'Renderer'] },
      ],
    },
  },
  {
    key: 'async_to_other_renderer',
    group: GROUP_TRANSPORT,
    counts: numTests,
    title: 'Async to other renderer via main relay',
    api: 'ipcRenderer.send via main relay',
    commentary: 'This is the most expensive cross-renderer route here because every round trip crosses the main process twice.',
    route: {
      title: 'Asynchronous to other renderer',
      detail: 'ipcRenderer.send via main relay',
      routes: [
        { label: 'request', steps: ['Renderer', 'Main process', 'Background renderer'] },
        { label: 'reply', steps: ['Background renderer', 'Main process', 'Renderer'] },
      ],
    },
  },
  {
    key: 'async_send_to_other_renderer',
    group: GROUP_TRANSPORT,
    counts: numTests,
    title: 'Async to other renderer via main-routed relay API',
    api: 'Main-routed relay API',
    commentary: 'Still a cross-process hop, so it should be measured against the older relay route in your actual workload rather than assumed to be faster.',
    route: {
      title: 'Asynchronous to other renderer',
      detail: 'main-routed relay API',
      routes: [
        { label: 'request', steps: ['Renderer', 'Main process', 'Background renderer'] },
        { label: 'reply', steps: ['Background renderer', 'Main process', 'Renderer'] },
      ],
    },
  },
  {
    key: 'async_message_port_to_other_renderer',
    group: GROUP_TRANSPORT,
    counts: numTests,
    title: 'Direct channel to other renderer',
    api: 'MessagePort',
    commentary: 'Best fit for sustained renderer-to-renderer traffic because setup is separate from the high-volume message loop.',
    route: {
      title: 'Direct channel to other renderer',
      detail: 'MessagePort API',
      routes: [
        { label: 'setup', steps: ['Renderer', 'Main process', 'Background renderer'] },
        { label: 'messages', steps: ['Renderer', 'Background renderer'], arrow: '⇄' },
      ],
    },
  },
  {
    key: 'async_message_port_to_utility_process',
    group: GROUP_TRANSPORT,
    counts: numTests,
    title: 'Direct channel to utility process',
    api: 'utilityProcess + MessagePort',
    commentary: 'The modern place for background Node work. Compare it against the hidden background renderer on the row above before you reach for a hidden window.',
    route: {
      title: 'Direct channel to utility process',
      detail: 'utilityProcess + MessagePort API',
      routes: [
        { label: 'setup', steps: ['Renderer', 'Main process', 'Utility process'] },
        { label: 'messages', steps: ['Renderer', 'Utility process'], arrow: '⇄' },
      ],
    },
  },
  {
    key: 'async_to_iframe',
    group: GROUP_TRANSPORT,
    counts: numTests,
    title: 'Async to iframe',
    api: 'iframe.contentWindow.postMessage',
    commentary: 'Very efficient when communication can stay inside the same renderer process.',
    route: {
      title: 'Asynchronous to iframe',
      detail: 'iframe.contentWindow.postMessage API',
      routes: [
        { label: 'request', steps: ['Renderer', 'iframe'] },
        { label: 'reply', steps: ['iframe', 'Renderer'] },
      ],
    },
  },
  {
    key: 'unsandboxed_direct_invoke_to_main',
    group: GROUP_BRIDGE,
    counts: [BRIDGE_COUNT],
    title: 'Unsandboxed preload, direct ipcRenderer',
    api: 'sandbox: false + ipcRenderer.invoke',
    commentary: 'Control for the bridge comparison. The benchmark loop runs inside the preload and calls ipcRenderer directly.',
    route: {
      title: 'Unsandboxed preload, direct call',
      detail: 'sandbox: false + ipcRenderer.invoke',
      routes: [
        { label: 'request', steps: ['Preload', 'Main process'] },
        { label: 'reply', steps: ['Main process', 'Preload'] },
      ],
    },
  },
  {
    key: 'sandboxed_bridge_invoke_to_main',
    group: GROUP_BRIDGE,
    counts: [BRIDGE_COUNT],
    title: 'Sandboxed renderer through contextBridge',
    api: 'sandbox: true + contextBridge + ipcRenderer.invoke',
    commentary: 'The shape most Electron apps actually ship. The loop runs in the page main world and every call crosses the contextBridge into the preload.',
    route: {
      title: 'Sandboxed renderer through contextBridge',
      detail: 'sandbox: true + contextBridge + ipcRenderer.invoke',
      routes: [
        { label: 'request', steps: ['Page', 'contextBridge', 'Preload', 'Main process'] },
        { label: 'reply', steps: ['Main process', 'Preload', 'contextBridge', 'Page'] },
      ],
    },
  },
  {
    key: 'payload_json_1kb',
    group: GROUP_PAYLOAD,
    counts: [PAYLOAD_COUNT],
    payloadProfile: 'json_1kb',
    title: 'JSON object, 1 KB',
    api: 'MessagePort',
    commentary: 'Baseline payload for the size sweep.',
    route: {
      title: 'JSON object, 1 KB',
      detail: 'structured clone over MessagePort',
      routes: [{ label: 'messages', steps: ['Renderer', 'Background renderer'], arrow: '⇄' }],
    },
  },
  {
    key: 'payload_json_64kb',
    group: GROUP_PAYLOAD,
    counts: [PAYLOAD_COUNT],
    payloadProfile: 'json_64kb',
    title: 'JSON object, 64 KB',
    api: 'MessagePort',
    commentary: 'Sixty-four times the bytes of the baseline, on the same transport.',
    route: {
      title: 'JSON object, 64 KB',
      detail: 'structured clone over MessagePort',
      routes: [{ label: 'messages', steps: ['Renderer', 'Background renderer'], arrow: '⇄' }],
    },
  },
  {
    key: 'payload_json_1mb',
    group: GROUP_PAYLOAD,
    counts: [PAYLOAD_COUNT],
    payloadProfile: 'json_1mb',
    title: 'JSON object, 1 MB',
    api: 'MessagePort',
    commentary: 'Where structured clone cost dominates transport cost completely.',
    route: {
      title: 'JSON object, 1 MB',
      detail: 'structured clone over MessagePort',
      routes: [{ label: 'messages', steps: ['Renderer', 'Background renderer'], arrow: '⇄' }],
    },
  },
  {
    key: 'payload_deep_object',
    group: GROUP_PAYLOAD,
    counts: [PAYLOAD_COUNT],
    payloadProfile: 'deep_object',
    title: 'Deeply nested object',
    api: 'MessagePort',
    commentary: 'Similar byte count to a small flat payload but deeply nested, which isolates object shape from raw size.',
    route: {
      title: 'Deeply nested object',
      detail: 'structured clone over MessagePort',
      routes: [{ label: 'messages', steps: ['Renderer', 'Background renderer'], arrow: '⇄' }],
    },
  },
  {
    key: 'payload_binary_1mb_copy',
    group: GROUP_PAYLOAD,
    counts: [PAYLOAD_COUNT],
    payloadProfile: 'binary_1mb',
    title: 'ArrayBuffer, 1 MB, copied',
    api: 'MessagePort',
    commentary: 'A 1 MB ArrayBuffer sent without a transfer list, so it is copied in both directions.',
    route: {
      title: 'ArrayBuffer, 1 MB, copied',
      detail: 'structured clone over MessagePort',
      routes: [{ label: 'messages', steps: ['Renderer', 'Background renderer'], arrow: '⇄' }],
    },
  },
  {
    key: 'payload_binary_1mb_transfer',
    group: GROUP_PAYLOAD,
    counts: [PAYLOAD_COUNT],
    payloadProfile: 'binary_1mb',
    transfer: true,
    title: 'ArrayBuffer, 1 MB, transferred',
    api: 'MessagePort with transfer list',
    commentary: 'The same 1 MB ArrayBuffer moved with a transfer list instead of copied. This is the cheapest way to move bulk binary data between processes.',
    route: {
      title: 'ArrayBuffer, 1 MB, transferred',
      detail: 'MessagePort with transfer list',
      routes: [{ label: 'messages', steps: ['Renderer', 'Background renderer'], arrow: '⇄' }],
    },
  },
]

/**
 * Applies a --bench-counts override. The transport sweep takes the override as-is;
 * pinned groups keep a single count so a smoke run stays cheap.
 * @param {number[] | null | undefined} overrideCounts
 */
function resolveScenarioCounts(overrideCounts) {
  if (!Array.isArray(overrideCounts) || overrideCounts.length === 0) {
    return scenarioDefinitions.map((scenario) => ({ key: scenario.key, counts: scenario.counts }))
  }

  const ceiling = Math.max(...overrideCounts)

  return scenarioDefinitions.map((scenario) => ({
    key: scenario.key,
    counts: scenario.group === GROUP_TRANSPORT
      ? [...overrideCounts]
      : [Math.min(scenario.counts[0], ceiling)],
  }))
}

/** @param {number[] | null | undefined} overrideCounts */
function resolveColumnCounts(overrideCounts) {
  const counts = new Set()
  resolveScenarioCounts(overrideCounts).forEach((entry) => entry.counts.forEach((count) => counts.add(count)))
  return [...counts].sort((left, right) => left - right)
}

module.exports = {
  numTests,
  groupDefinitions,
  scenarioDefinitions,
  resolveScenarioCounts,
  resolveColumnCounts,
  GROUP_TRANSPORT,
  GROUP_BRIDGE,
  GROUP_PAYLOAD,
}