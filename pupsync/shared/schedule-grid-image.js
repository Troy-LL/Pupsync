/**
 * Week grid — live SVG preview + PNG export (canvas).
 * Fills its host with no letterboxing; export is always PNG.
 */
var PUPGridImage = globalThis.PUPGridImage;
if (!PUPGridImage) {
  PUPGridImage = {
    EXPORT_WIDTH: 840,
    AXIS_WIDTH: 54,
    HEADER_HEIGHT: 30,
    PAD: 4,
    COL_GAP: 0,
    BLOCK_RADIUS: 5,
    /** Fixed chip title size — same on every block. */
    TITLE_SIZE: 11,
    CODE_SIZE: 8.5,

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

    /** Compact range for chips: "9:00a–10:30a" (falls back to block.timeLabel). */
    compactBlockTime(block) {
      if (block?.timeLabel) {
        return String(block.timeLabel)
          .replace(/\s*AM/gi, 'a')
          .replace(/\s*PM/gi, 'p')
          .replace(/–/g, '–');
      }
      if (
        typeof block?.startMin === 'number' &&
        typeof block?.endMin === 'number' &&
        globalThis.PUPUtils?.formatTime12h
      ) {
        const fmt = (mins) => {
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          const t24 = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          return PUPUtils.formatTime12h(t24)
            .replace(/\s*AM/gi, 'a')
            .replace(/\s*PM/gi, 'p');
        };
        return `${fmt(block.startMin)}–${fmt(block.endMin)}`;
      }
      return '';
    },

    blockTypeShort(block) {
      return block?.type === 'Lab' ? 'Lab' : 'Lec';
    },

    /**
     * English side of a bilingual description.
     * "Art Appreciation/Pagpapahalaga…" → "Art Appreciation"
     */
    chipSubjectName(block) {
      let name = String(block?.description || '').trim();
      if (name.includes('/')) {
        name = name.split('/')[0].trim();
      }
      return name;
    },

    chipSubjectCode(block) {
      return String(block?.subjectCode || '').trim();
    },

    /** Split name into words + optional trailing course number ("4", "1A"). */
    splitSubjectWords(name) {
      let base = String(name || '').trim();
      let trailing = '';
      const numM = base.match(/\s+(\d+[A-Za-z]?)\s*$/);
      if (numM) {
        trailing = numM[1];
        base = base.slice(0, numM.index).trim();
      }
      const STOP = new Set([
        'and',
        'or',
        'of',
        'the',
        'a',
        'an',
        'for',
        'with',
        'to',
        'in',
        'on',
        'at',
        'by',
        'vs',
        'via',
        'into',
        'from'
      ]);
      const tokens = base
        .split(/[\s./_-]+/)
        .map((w) => w.replace(/[^A-Za-z0-9]/g, ''))
        .filter(Boolean);
      const significant = tokens.filter((t) => !STOP.has(t.toLowerCase()));
      return {
        words: significant.length ? significant : tokens,
        trailing
      };
    },

    /** "development" → "Dev"; keeps short ALL-CAPS tokens as-is. */
    abbreviateWord(word, len = 3) {
      const w = String(word || '');
      if (!w) return '';
      if (w.length <= 4 && w === w.toUpperCase() && /[A-Z]/.test(w)) return w;
      if (w.length <= len) return w[0].toUpperCase() + w.slice(1).toLowerCase();
      return w[0].toUpperCase() + w.slice(1, len).toLowerCase();
    },

    /**
     * Acronym from significant words. Skips filler words; keeps "CS"-like tokens.
     * 4+ words → last word contributes 3 letters (PATHFIT-style).
     */
    chipSubjectAcronym(name) {
      const { words, trailing } = this.splitSubjectWords(name);
      if (!words.length) return trailing || '';

      const withNum = (s) => (trailing ? `${s} ${trailing}` : s);

      if (words.length === 1) {
        const w = words[0];
        return withNum(
          w.length <= 6 ? w.toUpperCase() : w.slice(0, 4).toUpperCase()
        );
      }

      const parts = [];
      const useLastTrigraph = words.length >= 4;
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const isLast = i === words.length - 1;
        if (w.length <= 4 && w === w.toUpperCase() && /[A-Z]/.test(w)) {
          parts.push(w);
          continue;
        }
        if (isLast && useLastTrigraph && w.length > 3) {
          parts.push(w.slice(0, 3).toUpperCase());
        } else {
          parts.push(w[0].toUpperCase());
        }
      }
      return withNum(parts.join(''));
    },

    /**
     * Pick the longest sensible title that fits one line at TITLE_SIZE:
     * full → 2-word short (Web Dev) → tighter short (Info Man) → acronym → code.
     */
    chipTitleForWidth(block, maxW) {
      const size = this.TITLE_SIZE;
      const weight = 700;
      const fits = (t) =>
        !!t && this.measureTextWidth(t, size, weight) <= maxW;

      const full = this.chipSubjectName(block);
      const code = this.chipSubjectCode(block);
      if (fits(full)) return full;

      if (full) {
        const { words, trailing } = this.splitSubjectWords(full);
        const withNum = (s) => (trailing ? `${s} ${trailing}` : s);

        if (words.length === 2) {
          const soft = withNum(
            `${words[0]} ${this.abbreviateWord(words[1], 3)}`
          );
          if (fits(soft)) return soft;
          const tight = withNum(
            `${this.abbreviateWord(words[0], 4)} ${this.abbreviateWord(words[1], 3)}`
          );
          if (fits(tight)) return tight;
        } else if (words.length === 1) {
          // Single word that somehow doesn't fit — keep it (better than MULT)
          if (words[0]) return withNum(words[0]);
        }

        const acr = this.chipSubjectAcronym(full);
        if (acr && fits(acr)) return acr;
        if (acr) return acr;
      }

      return code || full || '—';
    },

    _measureCtx: null,

    measureTextWidth(text, size, weight = 650) {
      if (typeof document === 'undefined') {
        return String(text || '').length * size * 0.55;
      }
      if (!this._measureCtx) {
        this._measureCtx = document.createElement('canvas').getContext('2d');
      }
      this._measureCtx.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      return this._measureCtx.measureText(String(text || '')).width;
    },

    /**
     * Title (custom chipLabel or fit-aware name) + subject code + time.
     * No Lec/Lab.
     */
    blockTextLines(block, bw, bh, { showTime = true } = {}) {
      const padX = 6;
      const maxW = Math.max(bw - padX * 2, 8);
      const titleSize = this.TITLE_SIZE;
      const custom = String(block?.chipLabel || '').trim();
      const title = custom ? custom : this.chipTitleForWidth(block, maxW);
      const code = this.chipSubjectCode(block);
      const timeLabel = this.compactBlockTime(block);

      const norm = (s) =>
        String(s || '')
          .replace(/\s+/g, '')
          .toUpperCase();
      const showCode = !!code && norm(code) !== norm(title);

      const canCode = showCode && bh >= 26;
      const canTime = showTime && !!timeLabel && bh >= (canCode ? 40 : 28);

      const lines = [
        { text: title, size: titleSize, weight: 700, muted: false }
      ];
      if (canCode) {
        lines.push({
          text: code,
          size: this.CODE_SIZE,
          weight: 600,
          muted: true
        });
      }
      if (canTime) {
        lines.push({
          text: timeLabel,
          size: 8,
          weight: 500,
          muted: true
        });
      }
      return { lines, padX };
    },

    /** Short section: "3 - BSIT 3-3" → "BSIT 3-3"; "1N - BSIT 2-1N" → "1N" */
    compactSection(section) {
      const s = String(section || '').trim();
      if (!s) return '';
      const parts = s
        .split(/\s+-\s+/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
        return parts.slice(1).join(' - ');
      }
      if (parts.length >= 1) return parts[0];
      return s;
    },

    /** One label for the grid corner (shared section, or short mix). */
    cornerSectionLabel(model) {
      const set = new Set();
      for (const b of model?.blocks || []) {
        const s = this.compactSection(b.section);
        if (s) set.add(s);
      }
      const list = [...set];
      if (!list.length) return '';
      if (list.length === 1) return list[0];
      const joined = list.join('/');
      return joined.length <= 14 ? joined : `${list.length}`;
    },

    /**
     * Square-ish pill in the axis×header corner. Same cy as day names.
     */
    cornerBadgeLayout(L, label) {
      const text = String(label || '');
      const fontSize = text.length > 3 ? 9 : 10;
      const tw = this.measureTextWidth(text, fontSize, 700);
      const badgeH = 22;
      const badgeW = Math.min(
        L.axisW - 6,
        Math.max(badgeH, Math.ceil(tw + 10))
      );
      const cx = L.pad + L.axisW / 2;
      const cy = L.pad + L.headerH / 2;
      return { x: cx - badgeW / 2, y: cy - badgeH / 2, w: badgeW, h: badgeH, cx, cy, fontSize };
    },

    /** Canvas: center glyph ink on (cx, cy). */
    fillCenteredLabel(ctx, text, cx, cy, fontSize, weight = 700) {
      ctx.font = `${weight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const m = ctx.measureText(text);
      const left = m.actualBoundingBoxLeft ?? 0;
      const right = m.actualBoundingBoxRight ?? m.width;
      const ascent = m.actualBoundingBoxAscent ?? fontSize * 0.8;
      const descent = m.actualBoundingBoxDescent ?? fontSize * 0.2;
      ctx.fillText(
        text,
        cx - (right - left) / 2,
        cy + (ascent - descent) / 2
      );
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
          `<text x="${x + L.colW / 2}" y="${L.pad + L.headerH / 2}" dy="0.35em" text-anchor="middle" fill="${C.text}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="11" font-weight="500">${this.esc(draw)}</text>`
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
        const { lines, padX } = this.blockTextLines(block, bw, bh, {
          showTime: true
        });
        const custom = String(block.chipLabel || '').trim();
        const displayTitle = custom || lines[0]?.text || block.subjectCode || '';

        parts.push(
          `<g class="schedule-block" data-code="${this.esc(block.subjectCode)}" data-label="${this.esc(displayTitle)}" role="button" tabindex="0" style="cursor:pointer">`
        );
        parts.push(
          `<title>Edit grid label: ${this.esc(block.subjectCode)}</title>`
        );
        parts.push(
          `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${this.BLOCK_RADIUS}" ry="${this.BLOCK_RADIUS}" fill="${this.esc(block.colorHex)}" stroke="rgba(17,17,17,0.06)" stroke-width="1"/>`
        );

        let y = by + 5 + (lines[0]?.size || 11);
        for (const line of lines) {
          if (y > by + bh - 3) break;
          const opacity = line.muted ? ' fill-opacity="0.88"' : '';
          parts.push(
            `<text x="${bx + padX}" y="${y}" fill="${textColor}"${opacity} font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="${line.size}" font-weight="${line.weight}" pointer-events="none">${this.esc(line.text)}</text>`
          );
          y += line.size + 3;
        }
        parts.push('</g>');
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

      const corner = this.cornerSectionLabel(model);
      if (corner) {
        const b = this.cornerBadgeLayout(L, corner);
        this.roundRectPath(ctx, b.x, b.y, b.w, b.h, 4);
        ctx.fillStyle = C.maroon;
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        this.fillCenteredLabel(ctx, corner, b.cx, b.cy, b.fontSize, 700);
      }

      ctx.font =
        '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.text;
      for (let i = 0; i < L.dayCount; i++) {
        const x = L.gridLeft + i * (L.colW + L.gap);
        const draw = this.dayHeaderLabel(L.days[i], L.colW);
        ctx.fillText(draw, x + L.colW / 2, L.pad + L.headerH / 2);
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
        const { lines, padX } = this.blockTextLines(block, bw, bh, {
          showTime: true
        });
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        let y = by + 6;
        for (const line of lines) {
          if (y + line.size > by + bh - 2) break;
          ctx.font = `${line.weight} ${line.size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
          ctx.globalAlpha = line.muted ? 0.88 : 1;
          ctx.fillStyle = textColor;
          ctx.fillText(line.text, bx + padX, y);
          ctx.globalAlpha = 1;
          y += line.size + 3;
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
