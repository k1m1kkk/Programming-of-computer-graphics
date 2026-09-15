export class ScanEngine {
  constructor({ onResult, onProgress, onState } = {}) {
    this.onResult = onResult ?? (() => {})
    this.onProgress = onProgress ?? (() => {})
    this.onState = onState ?? (() => {})
    this.workers = []
    this.cancelled = false
    this.running = false
    this.lastProgressAt = 0
    this.pendingResolve = null
    this.runId = 0
  }

  getWorkerCount(fileCount) {
    const cores = navigator.hardwareConcurrency || 4
    const calculated = Math.max(2, Math.floor(cores * 0.75))
    return Math.min(fileCount, 8, calculated)
  }

  async scan(files) {
    if (this.running) this.cancel()
    const runId = ++this.runId
    this.cancelled = false
    this.running = true

    const startedAt = performance.now()
    const total = files.length
    let completed = 0
    let corrupt = 0
    let bytesRead = 0
    let nextIndex = 0

    this.onState({ state: 'running', total })
    this.#emitProgress({ completed, total, corrupt, bytesRead, startedAt }, true)

    if (!total) {
      this.running = false
      this.onState({ state: 'finished', total: 0, completed: 0, corrupt: 0, bytesRead: 0, elapsedMs: 0 })
      return
    }

    const workerCount = this.getWorkerCount(total)
    const workerUrl = new URL('../infrastructure/worker.js', import.meta.url)

    await new Promise(resolve => {
      let settled = false
      this.pendingResolve = () => {
        if (settled) return
        settled = true
        resolve()
      }

      const finishIfDone = () => {
        if (settled) return true
        if (this.cancelled || completed >= total) {
          settled = true
          this.pendingResolve = null
          resolve()
          return true
        }
        return false
      }

      const assign = worker => {
        if (this.cancelled || nextIndex >= total) return
        const id = nextIndex
        nextIndex += 1
        worker.currentTaskId = id
        worker.postMessage({ id, file: files[id] })
      }

      const removeWorker = worker => {
        const index = this.workers.indexOf(worker)
        if (index >= 0) this.workers.splice(index, 1)
        worker.terminate()
      }

      const createWorker = () => {
        const worker = new Worker(workerUrl, { type: 'module' })
        worker.currentTaskId = null
        this.workers.push(worker)

        worker.onmessage = event => {
          const { id, ok, metadata, error } = event.data
          worker.currentTaskId = null
          completed += 1

          const finalMetadata = ok ? metadata : {
            format: 'UNKNOWN',
            width: null,
            height: null,
            dpiX: null,
            dpiY: null,
            colorDepth: null,
            compression: 'Не определено',
            details: {},
            warnings: [],
            corruptReasons: [`Ошибка парсера: ${error}`],
            bytesRead: 0,
            status: 'corrupt'
          }

          if (finalMetadata.status === 'corrupt') corrupt += 1
          bytesRead += finalMetadata.bytesRead || 0
          this.onResult({ id, file: files[id], metadata: finalMetadata })
          this.#emitProgress({ completed, total, corrupt, bytesRead, startedAt }, completed === total)

          if (!finishIfDone()) assign(worker)
        }

        worker.onerror = event => {
          const failedId = worker.currentTaskId
          worker.currentTaskId = null

          if (failedId != null) {
            completed += 1
            corrupt += 1
            this.onResult({
              id: failedId,
              file: files[failedId],
              metadata: {
                format: 'UNKNOWN',
                width: null,
                height: null,
                dpiX: null,
                dpiY: null,
                colorDepth: null,
                compression: 'Не определено',
                details: {},
                warnings: [],
                corruptReasons: [`Worker завершился с ошибкой: ${event.message}`],
                bytesRead: 0,
                status: 'corrupt'
              }
            })
          }

          this.#emitProgress({ completed, total, corrupt, bytesRead, startedAt }, true)
          removeWorker(worker)

          if (!finishIfDone() && nextIndex < total) {
            const replacement = createWorker()
            assign(replacement)
          }
        }

        return worker
      }

      for (let i = 0; i < workerCount; i += 1) assign(createWorker())
    })

    if (runId !== this.runId) return
    this.pendingResolve = null
    this.#terminateWorkers()
    const elapsedMs = performance.now() - startedAt
    this.running = false
    this.onState({ state: this.cancelled ? 'cancelled' : 'finished', total, completed, corrupt, bytesRead, elapsedMs })
  }

  cancel() {
    if (!this.running) return
    this.cancelled = true
    this.runId += 1
    const pendingResolve = this.pendingResolve
    this.pendingResolve = null
    this.#terminateWorkers()
    if (pendingResolve) pendingResolve()
    this.running = false
    this.onState({ state: 'cancelled' })
  }

  #terminateWorkers() {
    for (const worker of this.workers) worker.terminate()
    this.workers = []
  }

  #emitProgress(data, force = false) {
    const now = performance.now()
    if (!force && now - this.lastProgressAt < 60) return
    this.lastProgressAt = now
    this.onProgress({ ...data, elapsedMs: now - data.startedAt })
  }
}
