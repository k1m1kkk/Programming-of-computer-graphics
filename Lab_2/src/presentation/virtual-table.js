const ROW_HEIGHT = 52
const BUFFER = 8

export class VirtualTable {
  constructor({ viewport, spacer, rowsLayer, onDetails }) {
    this.viewport = viewport
    this.spacer = spacer
    this.rowsLayer = rowsLayer
    this.onDetails = onDetails
    this.rows = []
    this.lastStart = -1
    this.lastEnd = -1

    this.viewport.addEventListener('scroll', () => this.render())
    window.addEventListener('resize', () => this.render(true))
    this.rowsLayer.addEventListener('click', event => {
      const button = event.target.closest('[data-details-index]')
      if (!button) return
      const index = Number(button.dataset.detailsIndex)
      const row = this.rows[index]
      if (row) this.onDetails(row)
    })
  }

  setRows(rows, { resetScroll = true } = {}) {
    this.rows = rows
    this.spacer.style.height = `${rows.length * ROW_HEIGHT}px`
    if (resetScroll) this.viewport.scrollTop = 0
    this.render(true)
  }

  render(force = false) {
    const height = this.viewport.clientHeight || 400
    const firstVisible = Math.floor(this.viewport.scrollTop / ROW_HEIGHT)
    const visibleCount = Math.ceil(height / ROW_HEIGHT)
    const start = Math.max(0, firstVisible - BUFFER)
    const end = Math.min(this.rows.length, firstVisible + visibleCount + BUFFER)
    if (!force && start === this.lastStart && end === this.lastEnd) return
    this.lastStart = start
    this.lastEnd = end
    this.rowsLayer.style.transform = `translateY(${start * ROW_HEIGHT}px)`
    this.rowsLayer.replaceChildren(...this.rows.slice(start, end).map((row, localIndex) => this.#createRow(row, start + localIndex)))
  }

  #createRow(row, index) {
    const { file, metadata } = row
    const div = document.createElement('div')
    div.className = 'table-row'
    div.setAttribute('role', 'row')

    const status = document.createElement('span')
    const badge = document.createElement('span')
    badge.className = `status-badge status-${metadata.status}`
    badge.textContent = metadata.status === 'ok' ? 'OK' : metadata.status === 'warning' ? 'Внимание' : 'Поврежден'
    status.appendChild(badge)

    const name = document.createElement('span')
    name.className = 'file-name'
    name.title = file.webkitRelativePath || file.name
    name.textContent = file.webkitRelativePath || file.name

    const format = textCell(metadata.actualFormat || metadata.format || '—')
    const dimensions = textCell(metadata.width && metadata.height ? `${metadata.width} × ${metadata.height}` : '—')
    const dpi = textCell(formatDpi(metadata.dpiX, metadata.dpiY))
    const depth = textCell(metadata.colorDepth ? `${metadata.colorDepth} бит` : '—')
    const compression = textCell(metadata.compression || '—')
    const size = textCell(formatBytes(file.size))

    const action = document.createElement('span')
    const button = document.createElement('button')
    button.className = 'row-button'
    button.type = 'button'
    button.textContent = 'Подробнее'
    button.dataset.detailsIndex = index
    action.appendChild(button)

    div.append(status, name, format, dimensions, dpi, depth, compression, size, action)
    return div
  }
}

function textCell(text) {
  const span = document.createElement('span')
  span.textContent = text
  span.title = text
  return span
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—'
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = unit === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[unit]}`
}

export function formatDpi(x, y) {
  if (!x && !y) return 'Не задано'
  if (x && y && Math.abs(x - y) < 0.01) return `${round(x)} dpi`
  return `${x ? round(x) : '—'} × ${y ? round(y) : '—'} dpi`
}

function round(value) {
  return Math.round(value * 100) / 100
}
