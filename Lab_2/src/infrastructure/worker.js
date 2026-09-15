import { parseImageFile } from './parse-file.js'

self.onmessage = async event => {
  const { id, file } = event.data
  try {
    const metadata = await parseImageFile(file)
    self.postMessage({ id, ok: true, metadata })
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}
