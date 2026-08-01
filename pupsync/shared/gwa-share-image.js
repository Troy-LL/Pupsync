/**
 * Shareable GWA card → square PNG (for posting).
 * Themed leaf field by medal: gold / silver / green (bronze).
 */
var PUPGwaShare = globalThis.PUPGwaShare;
if (!PUPGwaShare) {
  PUPGwaShare = {
    SIZE: 1080,

    themes: {
      gold: {
        bgTop: '#fff8e8',
        bgBot: '#f3e2b0',
        accent: '#7a0019',
        gwa: '#7a0019',
        leaf: ['#e8b923', '#d4a017', '#f0d060', '#b8860b'],
        pillBg: '#e8f5ec',
        pillFg: '#0a6b38',
        label: 'Summa glow'
      },
      silver: {
        bgTop: '#f4f6f8',
        bgBot: '#d9dee4',
        accent: '#5c0013',
        gwa: '#3d454c',
        leaf: ['#c5c9ce', '#a8b0b8', '#e8eaed', '#7d848c'],
        pillBg: '#eef2f5',
        pillFg: '#3d454c',
        label: 'Magna gleam'
      },
      bronze: {
        bgTop: '#f3faf4',
        bgBot: '#d7edd9',
        accent: '#7a0019',
        gwa: '#1f6b3a',
        leaf: ['#6fbf73', '#4f9a55', '#a8d5a2', '#2f6b38'],
        pillBg: '#e8f5ec',
        pillFg: '#0a6b38',
        label: 'Cum Laude green'
      },
      plain: {
        bgTop: '#faf8f8',
        bgBot: '#f0e8ea',
        accent: '#7a0019',
        gwa: '#7a0019',
        leaf: ['#c4a8ad', '#e0cfd3', '#9a7a80', '#7a0019'],
        pillBg: '#ebe6e7',
        pillFg: '#1c1214',
        label: 'Steady'
      }
    },

    shareLine(standing, firstName) {
      const name = firstName || '';
      if (standing?.tier) {
        return name
          ? `${name} · on track for ${standing.tier}`
          : `On track for ${standing.tier}`;
      }
      if (standing?.disqualified && standing?.qualifiesTier) {
        return name
          ? `${name} · GWA in ${standing.qualifiesTier} range`
          : `GWA in ${standing.qualifiesTier} range`;
      }
      if (standing?.disqualified) {
        return name
          ? `${name} · still putting in the work`
          : 'Still putting in the work';
      }
      return name
        ? `${name} · doing fine — no honors cutoff yet`
        : 'Doing fine — no honors cutoff yet';
    },

    medalMeta(standing) {
      const tiers = globalThis.PUPSYNC?.HONOR_TIERS || [];
      const label = standing?.tier || standing?.qualifiesTier;
      if (!label) return { medal: null, fools: false, themeKey: 'plain' };
      const row = tiers.find((t) => t.label === label);
      const medal = row?.medal || null;
      return {
        medal,
        fools: !!(standing.disqualified && standing.qualifiesTier),
        themeKey: medal || 'plain'
      };
    },

    themeFor(standing) {
      const meta = this.medalMeta(standing);
      const theme = this.themes[meta.themeKey] || this.themes.plain;
      return { ...theme, ...meta };
    },

    drawLeaf(ctx, x, y, scale, rot, color) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(scale, scale);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -28);
      ctx.bezierCurveTo(18, -18, 22, 8, 0, 28);
      ctx.bezierCurveTo(-22, 8, -18, -18, 0, -28);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(28,18,20,0.12)';
      ctx.lineWidth = 1.5 / Math.max(scale, 0.5);
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.quadraticCurveTo(4, 0, 0, 22);
      ctx.stroke();
      ctx.restore();
    },

    drawLeafField(ctx, size, colors, fools) {
      const spots = [
        [90, 160, 1.1, -0.6],
        [180, 90, 0.85, 0.4],
        [300, 140, 1.3, -0.2],
        [780, 110, 1.0, 0.5],
        [900, 180, 1.25, -0.45],
        [980, 280, 0.9, 0.7],
        [100, 880, 1.15, 0.35],
        [210, 980, 0.95, -0.55],
        [860, 920, 1.2, 0.25],
        [970, 820, 0.85, -0.7],
        [70, 520, 0.7, 0.9],
        [1010, 560, 0.75, -0.85],
        [540, 70, 0.65, 0.15],
        [500, 1010, 0.7, -0.1]
      ];
      spots.forEach(([x, y, s, r], i) => {
        const color = colors[i % colors.length];
        this.drawLeaf(ctx, x, y, fools ? s * 0.92 : s, fools ? r + 0.2 : r, color);
      });
    },

    drawMedal(ctx, cx, cy, medal, fools) {
      if (!medal) return;
      const fills = {
        gold: { face: '#e8b923', rim: '#b8860b', ribbon: '#7a0019' },
        silver: { face: '#c5c9ce', rim: '#7d848c', ribbon: '#5c0013' },
        bronze: { face: '#6fbf73', rim: '#2f6b38', ribbon: '#7a0019' }
      };
      const c = fills[medal] || fills.bronze;
      ctx.save();
      if (fools) {
        ctx.translate(cx, cy);
        ctx.rotate((-8 * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }
      ctx.fillStyle = c.ribbon;
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy - 28);
      ctx.lineTo(cx - 28, cy - 78);
      ctx.lineTo(cx - 8, cy - 78);
      ctx.lineTo(cx, cy - 46);
      ctx.lineTo(cx + 8, cy - 78);
      ctx.lineTo(cx + 28, cy - 78);
      ctx.lineTo(cx + 18, cy - 28);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = fools ? '#b89a6a' : c.rim;
      ctx.beginPath();
      ctx.arc(cx, cy, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = fools && medal === 'gold' ? '#e6c35c' : c.face;
      if (fools && medal === 'silver') ctx.fillStyle = '#b8c0c6';
      if (fools && medal === 'bronze') ctx.fillStyle = '#e0a045';
      ctx.beginPath();
      ctx.arc(cx, cy, 38, 0, Math.PI * 2);
      ctx.fill();
      if (!fools) {
        ctx.fillStyle = c.rim;
        ctx.globalAlpha = 0.9;
        this.drawStar(ctx, cx, cy, 5, 20, 9);
        ctx.globalAlpha = 1;
      } else if (medal === 'bronze') {
        ctx.strokeStyle = '#8a4b12';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
          const x = cx + Math.cos(a) * 22;
          const y = cy + Math.sin(a) * 22;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    },

    drawStar(ctx, cx, cy, points, outer, inner) {
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = -Math.PI / 2 + (i * Math.PI) / points;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    },

    roundRect(ctx, x, y, w, h, r) {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
      else {
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
      }
    },

    drawShareCard(payload = {}) {
      const standing = payload.standing || {};
      const firstName = payload.firstName || '';
      const size = this.SIZE;
      const scale = payload.scale || 2;
      const theme = this.themeFor(standing);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(size * scale);
      canvas.height = Math.round(size * scale);
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);

      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, theme.bgTop);
      grad.addColorStop(1, theme.bgBot);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      this.drawLeafField(ctx, size, theme.leaf, theme.fools);

      /* Soft center stage so type stays readable */
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      this.roundRect(ctx, 120, 160, size - 240, 760, 36);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle = theme.accent;
      ctx.font =
        '700 36px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText('PUPSync', size / 2, 230);
      ctx.fillStyle = '#5a454a';
      ctx.font =
        '500 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText('GWA snapshot', size / 2, 268);

      if (theme.medal) {
        this.drawMedal(ctx, size / 2, 360, theme.medal, theme.fools);
      }

      ctx.fillStyle = theme.gwa;
      ctx.font =
        '700 148px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      const gwaText =
        standing.gwa != null ? Number(standing.gwa).toFixed(2) : '—';
      ctx.fillText(gwaText, size / 2, 560);

      ctx.fillStyle = '#5a454a';
      ctx.font =
        '500 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText(
        `Overall GWA · ${standing.totalUnits || 0} units`,
        size / 2,
        620
      );

      const line = this.shareLine(standing, firstName);
      ctx.font =
        '650 26px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      const pillW = Math.min(size - 200, ctx.measureText(line).width + 72);
      const pillX = (size - pillW) / 2;
      const pillY = 670;
      ctx.fillStyle = theme.pillBg;
      this.roundRect(ctx, pillX, pillY, pillW, 64, 18);
      ctx.fill();
      ctx.fillStyle = theme.pillFg;
      ctx.fillText(line, size / 2, pillY + 42);

      ctx.fillStyle = '#5a454a';
      ctx.font =
        '400 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText(
        'Indicative only · confirm with your registrar',
        size / 2,
        820
      );
      ctx.fillText('made with PUPSync', size / 2, 852);

      return canvas;
    },

    async exportPng(payload = {}) {
      const canvas = this.drawShareCard(payload);
      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error('GWA PNG export failed')),
          'image/png'
        );
      });
    }
  };
  globalThis.PUPGwaShare = PUPGwaShare;
}
