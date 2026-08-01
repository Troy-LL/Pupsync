/**
 * Week grid — live SVG preview + PNG export (canvas).
 * Fills its host with no letterboxing; export is always PNG.
 */
var PUPGridImage = globalThis.PUPGridImage;
if (!PUPGridImage) {
  PUPGridImage = {
    EXPORT_WIDTH: 840,
    AXIS_WIDTH: 40,
    HEADER_HEIGHT: 28,
    PAD: 4,
    COL_GAP: 0,
    BLOCK_RADIUS: 5,

    DAY_LABELS: {
      Monday: 'Monday',
      Tuesday: 'Tuesday',
      Wednesday: 'Wednesday',
      Thursday: 'Thursday',
      Friday: 'Friday',
      Saturday: 'Saturday',
      Sunday: 'Sunday'
    },

    COLORS: {
      surface: '#ffffff',
      gridBg: '#ffffff',
      text: '#111111',
      textMuted: '#6b6b6b',
      line: '#ececec',
      lineHour: '#e4e4e4',
      headerBorder: '#e8e8e8',
      maroon: '#7a0019',
      darkText: '#111111',
      lightText: '#ffffff'
    },

    exportChromeHeight() {
      return this.HEADER_HEIGHT + this.PAD * 2;
    },

    exportPixelRatio() {
      const dpr = globalThis.devicePixelRatio || 1;
      return Math.max(2, Math.min(dpr, 3));
    },

    textColorForHex(hex) {
      const h = (hex || '#000').replace('#', '');
      if (h.length < 6) return this.COLORS.lightText;
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return lum > 0.55 ? this.COLORS.darkText : this.COLORS.lightText;
    },

    compactHourLabel(label) {
      const s = String(label || '');
      const m = s.match(/^(\d{1,2}):00\s*(AM|PM)$/i);
      if (m) return `${m[1]}${m[2].toUpperCase()}`;
      return s.replace(/\s+/g, '');
    },

    esc(text) {
      return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },

    layout(model, options = {}) {
      const width = options.width ?? this.EXPORT_WIDTH;
      const axisW = this.AXIS_WIDTH;
      const headerH = this.HEADER_HEIGHT;
      const pad = this.PAD;
      const gap = this.COL_GAP;
      const days = model.days;
      const dayCount = days.length;
      const gridW = width - axisW - pad * 2;
      const colW = (gridW - gap * Math.max(dayCount - 1, 0)) / dayCount;
      const bodyH = model.totalHeight;
      const height = options.height ?? headerH + bodyH + pad * 2;
      return {
        width,
        height,
        axisW,
        headerH,
        pad,
        gap,
        days,
        dayCount,
        gridW,
        colW,
        bodyH,
        gridLeft: axisW + pad,
        bodyTop: headerH + pad
      };
    },

    dayHeaderLabel(day, colW) {
      const label = this.DAY_LABELS[day] || day;
      return colW < 72 && label.length > 3 ? label.slice(0, 3) : label;
    },

    /** Live preview: SVG that stretches to fill its host (no letterbox). */
    buildWeekGridSvg(model, options = {}) {
      const C = this.COLORS;
      const L = this.layout(model, options);
      const parts = [];

      parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" class="schedule-grid-svg" viewBox="0 0 ${L.width} ${L.height}" width="100%" height="100%" preserveAspectRatio="none" role="img" aria-label="${this.esc(options.ariaLabel || 'Weekly schedule')}">`
      );
      parts.push(
        `<rect width="${L.width}" height="${L.height}" fill="${C.surface}"/>`
      );
      parts.push(
        `<rect x="${L.gridLeft}" y="${L.bodyTop}" width="${L.gridW}" height="${L.bodyH}" fill="${C.gridBg}"/>`
      );

      for (let i = 0; i < L.dayCount; i++) {
        const x = L.gridLeft + i * (L.colW + L.gap);
        const draw = this.dayHeaderLabel(L.days[i], L.colW);
        parts.push(
          `<text x="${x + L.colW / 2}" y="${L.pad + L.headerH / 2}" text-anchor="middle" dominant-baseline="middle" fill="${C.text}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="11" font-weight="500">${this.esc(draw)}</text>`
        );
      }

      parts.push(
        `<line x1="${L.gridLeft}" y1="${L.bodyTop}" x2="${L.gridLeft + L.gridW}" y2="${L.bodyTop}" stroke="${C.headerBorder}" stroke-width="1"/>`
      );

      for (let i = 0; i <= L.dayCount; i++) {
        const x = L.gridLeft + i * L.colW;
        parts.push(
          `<line x1="${x}" y1="${L.bodyTop}" x2="${x}" y2="${L.bodyTop + L.bodyH}" stroke="${C.line}" stroke-width="1"/>`
        );
      }

      for (const tick of model.hourLabels) {
        const y = L.bodyTop + tick.top;
        parts.push(
          `<text x="${L.axisW - 6}" y="${y}" text-anchor="end" dominant-baseline="middle" fill="${C.textMuted}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="10">${this.esc(this.compactHourLabel(tick.label))}</text>`
        );
        parts.push(
          `<line x1="${L.gridLeft}" y1="${y}" x2="${L.gridLeft + L.gridW}" y2="${y}" stroke="${C.lineHour}" stroke-width="1"/>`
        );
      }

      parts.push(
        `<rect x="${L.gridLeft}" y="${L.bodyTop}" width="${L.gridW}" height="${L.bodyH}" fill="none" stroke="${C.headerBorder}" stroke-width="1"/>`
      );

      for (const block of model.blocks) {
        const dayIdx = L.days.indexOf(block.day);
        if (dayIdx === -1) continue;
        const colX = L.gridLeft + dayIdx * L.colW;
        const inset = 2;
        const bw = Math.max((L.colW * block.widthPct) / 100 - inset * 2, 8);
        const bx = colX + (L.colW * block.leftPct) / 100 + inset;
        const by = L.bodyTop + block.top + 1;
        const bh = Math.max(block.height - 2, 14);
        const textColor = this.textColorForHex(block.colorHex);
        const code = block.subjectCode || '';
        const typeLabel = block.type === 'Lab' ? 'Lab' : 'Lec';

        parts.push(
          `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${this.BLOCK_RADIUS}" ry="${this.BLOCK_RADIUS}" fill="${this.esc(block.colorHex)}" stroke="rgba(17,17,17,0.06)" stroke-width="1"/>`
        );

        if (bh >= 26) {
          parts.push(
            `<text x="${bx + 5}" y="${by + 14}" fill="${textColor}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="11" font-weight="650">${this.esc(code)}</text>`
          );
          parts.push(
            `<text x="${bx + 5}" y="${by + 26}" fill="${textColor}" fill-opacity="0.88" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="9" font-weight="500">${this.esc(typeLabel)}</text>`
          );
        } else if (bh >= 18) {
          parts.push(
            `<text x="${bx + 5}" y="${by + 12}" fill="${textColor}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="10" font-weight="650">${this.esc(code)}</text>`
          );
        } else {
          parts.push(
            `<text x="${bx + 3}" y="${by + 10}" fill="${textColor}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="9" font-weight="650">${this.esc(code)}</text>`
          );
        }
      }

      parts.push('</svg>');
      const wrap = document.createElement('div');
      wrap.innerHTML = parts.join('');
      return wrap.firstElementChild;
    },

    mountWeekGrid(container, model, options = {}) {
      if (!container) return null;
      const svg = this.buildWeekGridSvg(model, options);
      container.replaceChildren(svg);
      return svg;
    },

    roundRectPath(ctx, x, y, w, h, r) {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, radius);
      } else {
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
      }
    },

    /** High-res canvas for PNG download (same geometry as SVG). */
    drawWeekGridCanvas(model, options = {}) {
      const C = this.COLORS;
      const L = this.layout(model, options);
      const scale = options.scale ?? 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(L.width * scale);
      canvas.height = Math.round(L.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.fillStyle = C.surface;
      ctx.fillRect(0, 0, L.width, L.height);
      ctx.fillStyle = C.gridBg;
      ctx.fillRect(L.gridLeft, L.bodyTop, L.gridW, L.bodyH);

      ctx.font =
        '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.text;
      for (let i = 0; i < L.dayCount; i++) {
        const x = L.gridLeft + i * (L.colW + L.gap);
        const draw = this.dayHeaderLabel(L.days[i], L.colW);
        ctx.fillText(draw, x + L.colW / 2, L.pad + L.headerH / 2 - 1, L.colW - 4);
      }

      ctx.strokeStyle = C.headerBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(L.gridLeft, L.bodyTop - 0.5);
      ctx.lineTo(L.gridLeft + L.gridW, L.bodyTop - 0.5);
      ctx.stroke();

      ctx.strokeStyle = C.line;
      for (let i = 0; i <= L.dayCount; i++) {
        const x = L.gridLeft + i * L.colW + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, L.bodyTop);
        ctx.lineTo(x, L.bodyTop + L.bodyH);
        ctx.stroke();
      }

      ctx.font =
        '400 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const tick of model.hourLabels) {
        const y = L.bodyTop + tick.top + 0.5;
        ctx.fillStyle = C.textMuted;
        ctx.fillText(this.compactHourLabel(tick.label), L.axisW - 6, y);
        ctx.strokeStyle = C.lineHour;
        ctx.beginPath();
        ctx.moveTo(L.gridLeft, y);
        ctx.lineTo(L.gridLeft + L.gridW, y);
        ctx.stroke();
      }

      ctx.strokeStyle = C.headerBorder;
      ctx.strokeRect(L.gridLeft + 0.5, L.bodyTop + 0.5, L.gridW - 1, L.bodyH - 1);

      for (const block of model.blocks) {
        const dayIdx = L.days.indexOf(block.day);
        if (dayIdx === -1) continue;
        const colX = L.gridLeft + dayIdx * L.colW;
        const inset = 2;
        const bw = Math.max((L.colW * block.widthPct) / 100 - inset * 2, 8);
        const bx = colX + (L.colW * block.leftPct) / 100 + inset;
        const by = L.bodyTop + block.top + 1;
        const bh = Math.max(block.height - 2, 14);

        this.roundRectPath(ctx, bx, by, bw, bh, this.BLOCK_RADIUS);
        ctx.fillStyle = block.colorHex;
        ctx.fill();
        ctx.strokeStyle = 'rgba(17, 17, 17, 0.06)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const textColor = this.textColorForHex(block.colorHex);
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const code = block.subjectCode || '';
        const typeLabel = block.type === 'Lab' ? 'Lab' : 'Lec';
        const padX = 5;
        const maxW = bw - padX * 2;

        if (bh >= 26) {
          ctx.font =
            '650 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillText(code, bx + padX, by + 5, maxW);
          ctx.font =
            '500 9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.globalAlpha = 0.88;
          ctx.fillText(typeLabel, bx + padX, by + 17, maxW);
          ctx.globalAlpha = 1;
        } else if (bh >= 18) {
          ctx.font =
            '650 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillText(code, bx + padX, by + 3, maxW);
        } else {
          ctx.font =
            '650 9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillText(code, bx + 3, by + 2, bw - 6);
        }
      }

      return canvas;
    },

    canvasToPngBlob(canvas) {
      return new Promise((resolve, reject) => {
        if (!canvas?.toBlob) {
          reject(new Error('Canvas toBlob unavailable'));
          return;
        }
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error('PNG export failed')),
          'image/png'
        );
      });
    },

    async exportWeekGridPng(model, options = {}) {
      const scale = options.scale ?? this.exportPixelRatio();
      const canvas = this.drawWeekGridCanvas(model, { ...options, scale });
      return this.canvasToPngBlob(canvas);
    }
  };
  globalThis.PUPGridImage = PUPGridImage;
}
