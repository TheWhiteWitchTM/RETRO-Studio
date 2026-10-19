/** Draw a machine screen. Sprites are centered on their engine point. */

function drawBits(ctx, bits, x, y, w, h, color) {
  if (!bits || !bits.length) {
    ctx.fillStyle = color || '#ffffff';
    ctx.fillRect(x, y, Math.max(1, w), Math.max(1, h));
    return;
  }
  const rows = bits.length;
  const cw = w / 8;
  const ch = h / rows;
  ctx.fillStyle = color || '#ffffff';
  for (let row = 0; row < rows; row += 1) {
    const value = bits[row] ?? 0;
    for (let col = 0; col < 8; col += 1) {
      if ((value >> (7 - col)) & 1) {
        ctx.fillRect(x + col * cw, y + row * ch, Math.ceil(cw), Math.ceil(ch));
      }
    }
  }
}

export function paintScreen(canvas, model) {
  const wrap = canvas.parentElement;
  const cssW = Math.max(1, wrap?.clientWidth || 320);
  const cssH = Math.max(1, wrap?.clientHeight || 200);
  if (!model) {
    canvas.width = 0;
    canvas.height = 0;
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  const borderPx = 12;
  const pw = model.pixelWidth || 320;
  const ph = model.pixelHeight || 200;
  const fullW = pw + borderPx * 2;
  const fullH = ph + borderPx * 2;
  const scale = Math.max(1, Math.floor(Math.min(cssW / fullW, cssH / fullH)));
  canvas.width = Math.floor(fullW * scale * dpr);
  canvas.height = Math.floor(fullH * scale * dpr);
  canvas.style.width = `${fullW * scale}px`;
  canvas.style.height = `${fullH * scale}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = model.border || '#000000';
  ctx.fillRect(0, 0, fullW * scale, fullH * scale);
  ctx.fillStyle = model.background || '#000000';
  ctx.fillRect(borderPx * scale, borderPx * scale, pw * scale, ph * scale);

  if (model.pixels && model.pixels.length) {
    const cols = 40;
    const rows = Math.max(1, Math.round(model.pixels.length / cols));
    const cw = pw / cols;
    const ch = ph / rows;
    for (let i = 0; i < model.pixels.length; i += 1) {
      const colorIndex = model.pixels[i];
      if (colorIndex == null || colorIndex < 0) continue;
      ctx.fillStyle = model.palette?.[colorIndex] || '#ffffff';
      const x = i % cols;
      const y = Math.floor(i / cols);
      ctx.fillRect((borderPx + x * cw) * scale, (borderPx + y * ch) * scale, Math.ceil(cw * scale), Math.ceil(ch * scale));
    }
  }

  const cols = model.cols || 40;
  const rows = model.rows || 25;
  const cellW = pw / cols;
  const cellH = ph / rows;
  ctx.font = `${Math.max(8, Math.floor(cellH * scale * 0.72))}px "JetBrains Mono", monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const cells = model.cells || [];
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = borderPx + col * cellW;
    const y = borderPx + row * cellH;
    if (cell.bits && cell.bits.length) {
      drawBits(ctx, cell.bits, x * scale, y * scale, cellW * scale, cellH * scale, cell.fg);
    } else if (cell.ch && cell.ch !== ' ') {
      ctx.fillStyle = cell.fg || model.foreground || '#ffffff';
      ctx.fillText(cell.ch, (x + cellW / 2) * scale, (y + cellH / 2) * scale);
    }
  }

  for (const sprite of model.sprites || []) {
    const size = sprite.size || 8;
    const left = borderPx + sprite.x - size / 2;
    const top = borderPx + sprite.y - size / 2;
    drawBits(ctx, sprite.bits, left * scale, top * scale, size * scale, size * scale, sprite.color);
  }
}
