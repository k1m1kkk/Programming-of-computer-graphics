import { ScanEngine } from '../core/engine.js'
import { VirtualTable, formatBytes, formatDpi } from './virtual-table.js'

const MAX_FILES = 100000
const SUPPORTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'gif', 'tif', 'tiff', 'bmp', 'png', 'pcx'])

const els = {
  folderInput: document.querySelector('#folderInput'),
  fileInput: document.querySelector('#fileInput'),
  cancelButton: document.querySelector('#cancelButton'),
  dropZone: document.querySelector('#dropZone'),
  progressPanel: document.querySelector('#progressPanel'),
  progressText: document.querySelector('#progressText'),
  progressPercent: document.querySelector('#progressPercent'),
  progressBar: document.querySelector('#progressBar'),
  progressTrack: document.querySelector('.progress-track'),
  summarySection: document.querySelector('#summarySection'),
  summaryTotal: document.querySelector('#summaryTotal'),
  summaryProcessed: document.querySelector('#summaryProcessed'),
  summaryCorrupt: document.querySelector('#summaryCorrupt'),
  summaryTime: document.querySelector('#summaryTime'),
  summaryRead: document.querySelector('#summaryRead'),
  resultsSection: document.querySelector('#resultsSection'),
  resultCount: document.querySelector('#resultCount'),
  searchInput: document.querySelector('#searchInput'),
  formatFilter: document.querySelector('#formatFilter'),
  statusFilter: document.querySelector('#statusFilter'),
  tableViewport: document.querySelector('#tableViewport'),
  tableSpacer: document.querySelector('#tableSpacer'),
  tableRows: document.querySelector('#tableRows'),
  detailsDialog: document.querySelector('#detailsDialog'),
  dialogTitle: document.querySelector('#dialogTitle'),
  dialogClose: document.querySelector('#dialogClose'),
  previewWrap: document.querySelector('#previewWrap'),
  previewImage: document.querySelector('#previewImage'),
  detailsList: document.querySelector('#detailsList'),
  diagnosticsBlock: document.querySelector('#diagnosticsBlock'),
  aboutButton: document.querySelector('#aboutButton'),
  aboutDialog: document.querySelector('#aboutDialog'),
  aboutClose: document.querySelector('#aboutClose')
}

let results = []
let currentPreviewUrl = null
let filterTimer = null
let lastTableRefreshAt = 0

const table = new VirtualTable({
  viewport: els.tableViewport,
  spacer: els.tableSpacer,
  rowsLayer: els.tableRows,
  onDetails: showDetails
})

const engine = new ScanEngine({
  onResult: item => {
    results.push(item)
    const now = performance.now()
    if (results.length <= 30 || now - lastTableRefreshAt >= 180) {
      lastTableRefreshAt = now
      applyFilters(false)
    }
  },
  onProgress: updateProgress,
  onState: updateState
})

els.folderInput.addEventListener('change', event => startFromFileList(event.target.files))
els.fileInput.addEventListener('change', event => startFromFileList(event.target.files))
els.cancelButton.addEventListener('click', () => engine.cancel())
els.searchInput.addEventListener('input', scheduleFilter)
els.formatFilter.addEventListener('change', () => applyFilters())
els.statusFilter.addEventListener('change', () => applyFilters())
els.dialogClose.addEventListener('click', () => els.detailsDialog.close())
els.aboutButton.addEventListener('click', () => els.aboutDialog.showModal())
els.aboutClose.addEventListener('click', () => els.aboutDialog.close())
els.detailsDialog.addEventListener('close', revokePreview)

for (const eventName of ['dragenter', 'dragover']) {
  els.dropZone.addEventListener(eventName, event => {
    event.preventDefault()
    els.dropZone.classList.add('dragover')
  })
}
for (const eventName of ['dragleave', 'drop']) {
  els.dropZone.addEventListener(eventName, event => {
    event.preventDefault()
    els.dropZone.classList.remove('dragover')
  })
}
els.dropZone.addEventListener('drop', event => startFromFileList(event.dataTransfer.files))
els.dropZone.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') els.fileInput.click()
})

async function startFromFileList(fileList) {
  if (engine.running) engine.cancel()
  resetUi()
  const files = await collectSupportedFiles(fileList)
  if (!files.length) {
    els.progressPanel.classList.remove('hidden')
    els.progressText.textContent = 'Поддерживаемые изображения не найдены.'
    return
  }
  if (files.length > MAX_FILES) {
    els.progressPanel.classList.remove('hidden')
    els.progressText.textContent = `Выбрано ${files.length} файлов. По условию лабораторной допускается до ${MAX_FILES.toLocaleString('ru-RU')}.`
    return
  }

  els.summarySection.classList.remove('hidden')
  els.resultsSection.classList.remove('hidden')
  els.progressPanel.classList.remove('hidden')
  els.cancelButton.classList.remove('hidden')
  els.summaryTotal.textContent = files.length.toLocaleString('ru-RU')
  els.summaryProcessed.textContent = '0'
  els.summaryCorrupt.textContent = '0'
  els.summaryTime.textContent = '0 с'
  els.summaryRead.textContent = '0 Б'
  els.resultCount.textContent = `0 из ${files.length.toLocaleString('ru-RU')}`
  await engine.scan(files)
}

async function collectSupportedFiles(fileList) {
  const files = []
  let index = 0
  for (const file of fileList) {
    const ext = file.name.toLowerCase().split('.').pop() ?? ''
    if (SUPPORTED_EXTENSIONS.has(ext)) files.push(file)
    index += 1
    if (index % 2500 === 0) await new Promise(resolve => requestAnimationFrame(resolve))
  }
  return files
}

function updateProgress({ completed, total, corrupt, bytesRead, elapsedMs }) {
  const percent = total ? Math.min(100, (completed / total) * 100) : 0
  els.progressText.textContent = `Обработано ${completed.toLocaleString('ru-RU')} из ${total.toLocaleString('ru-RU')}`
  els.progressPercent.textContent = `${percent.toFixed(percent < 10 && percent > 0 ? 1 : 0)}%`
  els.progressBar.style.width = `${percent}%`
  els.progressTrack.setAttribute('aria-valuenow', String(Math.round(percent)))
  els.summaryProcessed.textContent = completed.toLocaleString('ru-RU')
  els.summaryCorrupt.textContent = corrupt.toLocaleString('ru-RU')
  els.summaryTime.textContent = formatDuration(elapsedMs)
  els.summaryRead.textContent = formatBytes(bytesRead)
  els.resultCount.textContent = `${completed.toLocaleString('ru-RU')} из ${total.toLocaleString('ru-RU')}`
}

function updateState({ state, completed, total, corrupt, bytesRead, elapsedMs }) {
  if (state === 'running') {
    els.cancelButton.classList.remove('hidden')
    return
  }
  els.cancelButton.classList.add('hidden')
  if (state === 'finished') {
    els.progressText.textContent = 'Сканирование завершено'
    els.progressPercent.textContent = '100%'
    els.progressBar.style.width = '100%'
    if (Number.isFinite(elapsedMs)) els.summaryTime.textContent = formatDuration(elapsedMs)
    if (Number.isFinite(bytesRead)) els.summaryRead.textContent = formatBytes(bytesRead)
    if (Number.isFinite(corrupt)) els.summaryCorrupt.textContent = corrupt.toLocaleString('ru-RU')
    if (Number.isFinite(completed)) els.summaryProcessed.textContent = completed.toLocaleString('ru-RU')
    if (Number.isFinite(total)) els.resultCount.textContent = `${completed.toLocaleString('ru-RU')} из ${total.toLocaleString('ru-RU')}`
    applyFilters()
  } else if (state === 'cancelled') {
    els.progressText.textContent = 'Сканирование остановлено пользователем'
    applyFilters()
  }
}

function scheduleFilter() {
  clearTimeout(filterTimer)
  filterTimer = setTimeout(() => applyFilters(), 120)
}

function applyFilters(resetScroll = true) {
  const query = els.searchInput.value.trim().toLowerCase()
  const format = els.formatFilter.value
  const status = els.statusFilter.value
  const filtered = results.filter(item => {
    const path = (item.file.webkitRelativePath || item.file.name).toLowerCase()
    const actual = item.metadata.actualFormat || item.metadata.format
    return (!query || path.includes(query)) && (format === 'all' || actual === format) && (status === 'all' || item.metadata.status === status)
  })
  table.setRows(filtered, { resetScroll })
  els.resultCount.textContent = `${filtered.length.toLocaleString('ru-RU')} показано · ${results.length.toLocaleString('ru-RU')} обработано`
}

function showDetails(item) {
  revokePreview()
  const { file, metadata } = item
  els.dialogTitle.textContent = file.webkitRelativePath || file.name
  els.detailsList.replaceChildren()

  const mainDetails = [
    ['Фактический формат', metadata.actualFormat || metadata.format || 'Не определен'],
    ['Формат по расширению', metadata.expectedFormat || 'Не определен'],
    ['Размер изображения', metadata.width && metadata.height ? `${metadata.width} × ${metadata.height} пикс.` : 'Не определен'],
    ['Разрешение', formatDpi(metadata.dpiX, metadata.dpiY)],
    ['Глубина цвета', metadata.colorDepth ? `${metadata.colorDepth} бит/пиксель` : 'Не определена'],
    ['Сжатие', metadata.compression || 'Не определено'],
    ['Размер файла', `${formatBytes(file.size)} (${file.size.toLocaleString('ru-RU')} байт)`],
    ['Считано парсером', `${formatBytes(metadata.bytesRead || 0)} (${(metadata.bytesRead || 0).toLocaleString('ru-RU')} байт)`]
  ]

  for (const pair of mainDetails) appendDefinition(pair[0], pair[1])
  for (const [key, value] of Object.entries(metadata.details || {})) appendDefinition(key, String(value))

  const diagnostics = [...(metadata.corruptReasons || []), ...(metadata.warnings || [])]
  if (diagnostics.length) {
    els.diagnosticsBlock.classList.remove('hidden')
    const title = document.createElement('strong')
    title.textContent = metadata.corruptReasons?.length ? 'Диагностика файла' : 'Предупреждения'
    const list = document.createElement('ul')
    for (const message of diagnostics) {
      const li = document.createElement('li')
      li.textContent = message
      list.appendChild(li)
    }
    els.diagnosticsBlock.replaceChildren(title, list)
  } else {
    els.diagnosticsBlock.classList.add('hidden')
    els.diagnosticsBlock.replaceChildren()
  }

  if (metadata.status !== 'corrupt') {
    currentPreviewUrl = URL.createObjectURL(file)
    els.previewImage.src = currentPreviewUrl
    els.previewWrap.classList.remove('hidden')
    els.previewImage.onerror = () => els.previewWrap.classList.add('hidden')
  } else {
    els.previewWrap.classList.add('hidden')
    els.previewImage.removeAttribute('src')
  }
  els.detailsDialog.showModal()
}

function appendDefinition(term, value) {
  const dt = document.createElement('dt')
  dt.textContent = term
  const dd = document.createElement('dd')
  dd.textContent = value
  els.detailsList.append(dt, dd)
}

function revokePreview() {
  if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl)
  currentPreviewUrl = null
  els.previewImage.removeAttribute('src')
}

function resetUi() {
  results = []
  lastTableRefreshAt = 0
  table.setRows([])
  els.searchInput.value = ''
  els.formatFilter.value = 'all'
  els.statusFilter.value = 'all'
  els.progressBar.style.width = '0%'
  els.progressPercent.textContent = '0%'
  els.progressTrack.setAttribute('aria-valuenow', '0')
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} мс`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)} с`
  return `${Math.floor(seconds / 60)} мин ${(seconds % 60).toFixed(0)} с`
}
