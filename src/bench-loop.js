// Shared by the sandboxed page (loaded as a plain script, main world) and the
// unsandboxed preload (loaded via require), so both sides run byte-identical loops.
(function (root) {
  /**
   * @param {{ invoke(key: string, payload: any): Promise<any> }} api
   * @param {{ count: number, spacingMs: number, payload: any }} request
   */
  async function runInvokeLoop(api, request) {
    const { count, spacingMs, payload } = request
    /** @type {number[]} */
    const durations = []
    /** @type {Promise<void>[]} */
    const promises = []
    const start = Date.now()

    for (let index = 0; index < count; index += 1) {
      promises.push(new Promise((resolve, reject) => {
        setTimeout(() => {
          const sentAt = performance.now()

          api.invoke(`bench_${index}`, payload).then(() => {
            durations.push(performance.now() - sentAt)
            resolve()
          }, reject)
        }, index * spacingMs)
      }))
    }

    await Promise.all(promises)

    return { totalMs: Date.now() - start, durations }
  }

  root.__benchRunInvokeLoop = runInvokeLoop

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runInvokeLoop }
  }
})(globalThis)
