// Shared by the page main world and the unsandboxed preload.
(function (root) {
  function scheduleMessages(count, spacingMs, signal, send) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason)
        return
      }

      const timers = new Set()
      let remaining = count
      let settled = false
      function finish(callback, value) {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', abort)
        timers.forEach((timer) => clearTimeout(timer))
        timers.clear()
        callback(value)
      }
      const abort = () => finish(reject, signal.reason)
      signal.addEventListener('abort', abort, { once: true })

      for (let index = 0; index < count; index++) {
        const timer = setTimeout(async () => {
          timers.delete(timer)
          try {
            await send(index)
            if (--remaining === 0) finish(resolve)
          } catch (error) {
            finish(reject, error)
          }
        }, index * spacingMs)
        timers.add(timer)
      }
    })
  }

  function registerInvokeLoop(api) {
    let current
    api.onCancel((id) => {
      if (current?.id === id) current.controller.abort()
    })
    api.onRun(async ({ id, count, spacingMs, payload }) => {
      const controller = new AbortController()
      current = { id, controller }
      const durations = []
      const start = performance.now()
      try {
        await scheduleMessages(count, spacingMs, controller.signal, async (index) => {
          const key = `bench_${index}`
          const sent = performance.now()
          const reply = await api.invoke(key, payload)
          if (reply[0] !== key) throw new Error('Unexpected benchmark reply.')
          durations.push(performance.now() - sent)
        })
        api.report({ id, totalMs: Math.round(performance.now() - start), durations })
      } catch (error) {
        api.report(controller.signal.aborted ? { id, cancelled: true } : { id, error: error.message })
      } finally {
        current = null
      }
    })
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { scheduleMessages, registerInvokeLoop }
  } else {
    root.registerInvokeLoop = registerInvokeLoop
  }
})(globalThis)
