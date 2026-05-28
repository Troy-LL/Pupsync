/**
 * Renders the week grid to a canvas and exports WebP for popup display.
 */
var PUPGridImage = globalThis.PUPGridImage;
if (!PUPGridImage) {
  PUPGridImage = {
    EXPORT_WIDTH: 840,
    AXIS_WIDTH: 52,
    HEADER_HEIGHT: 24,
    PAD: 6,
    COL_GAP: 2,

    /** Vertical chrome above/below the time grid (header + padding). */
    exportChromeHeight() {
      return this.HEADER_HEIGHT + this.PAD * 2;
    },

    /** Min 2× for sharp text when the image is shown smaller in the popup. */
    exportPixelRatio() {
      const dpr = globalThis.devicePixelRatio || 1;
      return Math.max(2, Math.min(dpr, 3));
    },

    textColorForHex(hex) {
      const h = (hex || '#000').replace('#', '');
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return lum > 0.62 ? '#2a1a1e' : '#ffffff';
    },

    drawWeekGridCanvas(model, options = {}) {
      const width = options.width ?? this.EXPORT_WIDTH;
      const scale = options.scale ?? 1;
      const axisW = this.AXIS_WIDTH;
      const headerH = this.HEADER_HEIGHT;
      const pad = this.PAD;
      const gap = this.COL_GAP;
      const days = model.days;
      const dayCount = days.length;
      const gridW = width - axisW - pad * 2;
      const colW = (gridW - gap * (dayCount - 1)) / dayCount;
      const bodyH = model.totalHeight;
      const height = options.height ?? headerH + bodyH + pad * 2;

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      const gridLeft = axisW + pad;
      const bodyTop = headerH + pad;

      ctx.fillStyle = '#faf5f6';
      ctx.fillRect(gridLeft, bodyTop, gridW, bodyH);

      ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillStyle = '#7a0019';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < dayCount; i++) {
        const x = gridLeft + i * (colW + gap);
        const label = model.dayShort[days[i]] || days[i].slice(0, 2);
        ctx.fillStyle = '#faf5f6';
        ctx.fillRect(x, pad, colW, headerH - pad);
        ctx.fillStyle = '#7a0019';
        ctx.fillText(label, x + colW / 2, pad + (headerH - pad) / 2);
      }

      ctx.strokeStyle = '#e8d4d8';
      ctx.lineWidth = 1;
      for (let i = 1; i < dayCount; i++) {
        const lineX = gridLeft + i * colW + (i - 1) * gap + i * gap;
        const x = gridLeft + i * (colW + gap);
        ctx.beginPath();
        ctx.moveTo(x, bodyTop);
        ctx.lineTo(x, bodyTop + bodyH);
        ctx.stroke();
      }

      ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillStyle = '#6b5258';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const tick of model.hourLabels) {
        const y = bodyTop + tick.top;
        ctx.fillText(tick.label, axisW - 4, y);
        ctx.strokeStyle = '#e8dce0';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(gridLeft, y);
        ctx.lineTo(gridLeft + gridW, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.strokeStyle = '#e8d4d8';
      ctx.strokeRect(gridLeft, bodyTop, gridW, bodyH);

      for (const block of model.blocks) {
        const dayIdx = days.indexOf(block.day);
        if (dayIdx === -1) continue;
        const colX = gridLeft + dayIdx * (colW + gap);
        const inset = 2;
        const bw = (colW * block.widthPct) / 100 - inset * 2;
        const bx = colX + (colW * block.leftPct) / 100 + inset;
        const by = bodyTop + block.top + 1;
        const bh = Math.max(block.height - 2, 12);

        ctx.fillStyle = block.colorHex;
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 3);
          ctx.fill();
        } else {
          ctx.fillRect(bx, by, bw, bh);
        }

        const textColor = this.textColorForHex(block.colorHex);
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        const code = block.subjectCode || '';
        const typeLabel = block.type === 'Lab' ? 'Lab' : 'Lec';
        if (bh >= 22) {
          ctx.fillText(code, bx + 3, by + 3, bw - 6);
          ctx.font = '8px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillText(typeLabel, bx + 3, by + 14, bw - 6);
        } else {
          ctx.font = 'bold 8px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillText(code, bx + 2, by + 2, bw - 4);
        }
      }

      return canvas;
    },

    canvasToWebPBlob(canvas, quality = 0.9) {
      return new Promise((resolve, reject) => {
        if (!canvas?.toBlob) {
          reject(new Error('Canvas toBlob unavailable'));
          return;
        }
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('WebP export failed'));
          },
          'image/webp',
          quality
        );
      });
    },

    async exportWeekGridWebP(model, options = {}) {
      const scale = options.scale ?? this.exportPixelRatio();
      const canvas = this.drawWeekGridCanvas(model, { ...options, scale });
      const quality = options.quality ?? 0.97;
      try {
        return await this.canvasToWebPBlob(canvas, quality);
      } catch {
        return new Promise((resolve, reject) => {
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))),
            'image/png'
          );
        });
      }
    }
  };
  globalThis.PUPGridImage = PUPGridImage;
}
