export class GridPainter {
  constructor(canvas, grid, cell = 18) {
    this.canvas = canvas;
    this.grid = grid;
    this.cell = cell;
    this.showGrid = true;
    this.showAxes = true;
    this.showLabels = true;
    this.theme = { base: '#fffefb', line: '#dce3ec', axis: '#71839f', pixel: [34, 95, 216] };
  }

  Paint() {
    const { canvas, grid, cell, theme } = this;
    const width = grid.width * cell;
    const height = grid.height * cell;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = theme.base;
    context.fillRect(0, 0, width, height);
    for (let row = 0; row < grid.height; row++) {
      const data = grid.rows[row];
      for (let col = 0; col < grid.width; col++) {
        const alpha = data[col];
        if (alpha <= 0) continue;
        context.fillStyle = `rgba(${theme.pixel[0]}, ${theme.pixel[1]}, ${theme.pixel[2]}, ${alpha})`;
        context.fillRect(col * cell, (grid.height - row - 1) * cell, cell, cell);
      }
    }
    if (this.showGrid) {
      context.fillStyle = theme.line;
      for (let col = 0; col <= grid.width; col++) context.fillRect(col * cell, 0, 1, height);
      for (let row = 0; row <= grid.height; row++) context.fillRect(0, row * cell, width, 1);
    }
    const axisColumn = -grid.minX;
    const axisRow = grid.height + grid.minY - 1;
    if (this.showAxes) {
      context.fillStyle = theme.axis;
      if (axisColumn >= 0 && axisColumn < grid.width) context.fillRect(axisColumn * cell + Math.floor(cell / 2), 0, 2, height);
      if (axisRow >= 0 && axisRow < grid.height) context.fillRect(0, axisRow * cell + Math.floor(cell / 2), width, 2);
    }
    if (this.showLabels && cell >= 10) {
      const frequency = cell >= 24 ? 5 : 10;
      context.font = '11px system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillStyle = '#52657e';
      const labelY = Math.max(16, Math.min(height - 4, (axisRow + 1) * cell + 16));
      for (let x = grid.minX; x < grid.minX + grid.width; x++) {
        if (x % frequency !== 0) continue;
        const px = (x - grid.minX + 0.5) * cell;
        context.fillStyle = theme.base;
        context.fillRect(px - 15, labelY - 12, 30, 15);
        context.fillStyle = '#52657e';
        context.fillText(String(x), px, labelY);
      }
      context.textAlign = 'left';
      const labelX = Math.max(5, Math.min(width - 26, (axisColumn + 1) * cell + 9));
      for (let y = grid.minY; y < grid.minY + grid.height; y++) {
        if (y % frequency !== 0 || y === 0) continue;
        const py = (grid.minY + grid.height - y - 0.5) * cell;
        context.fillStyle = theme.base;
        context.fillRect(labelX - 1, py - 8, 28, 15);
        context.fillStyle = '#52657e';
        context.fillText(String(y), labelX, py + 4);
      }
    }
  }
}
