// TRIMMED EXCERPT of app/team/marketing/carousel/page.tsx (1533 lines in origin).
// Kept: the portable machinery. Types + template constants, the EXPORT_RATIOS table,
// seeded RNG (mulberry32) + Perlin/fBm + marching-squares generative backgrounds,
// canvas text layout with **bold** segment parsing, renderSlide() drawing a fixed
// 1080x1080 safe content box centered inside each ratio's larger canvas, the
// per-slide gradient progression (makeOpts), the toBlob batch download loops, and
// the CTA-word classifier used by generate-from-text.
// Dropped: ~15 brand slide presets, the full editor JSX (sidebar, modals, library
// save/load fetches), icons, and inline styles. All kept code is verbatim.
'use client';
// ─── Types ──────────────────────────────────────────────────────────
type SlideMode = 'text-only' | 'image-text';

interface SlideConfig {
  id: string;
  mode: SlideMode;
  headline: string;
  subtext: string;
  cta: string;
  stepLabel: string;
  showArrow: boolean;
  showLogo: boolean;
  screenshotUrl: string | null;
  dateStamp: string;
  headlineSize: number;
  subtextSize: number;
  gapHeadlineSub: number;
  gapSubCta: number;
}

// ─── Constants (therma carousel template spec v1.0) ─────────────────
const CANVAS_SIZE = 1080;

const COLORS = {
  bgTop: '#DDB4A0',
  bgBottom: '#DABFAB',
  ink: '#050F1A',
  brown: '#6B5443',
  gold: '#C8A96E',
  stepLabel: '#7A7470',
};

const FONT = {
  headline: { family: 'PP Pangaia', weight: 500, style: 'italic', size: 72, lineHeight: 1.17, color: COLORS.ink },
  imageHeadline: { family: 'PP Pangaia', weight: 500, style: 'italic', size: 60, lineHeight: 1.17, color: COLORS.ink },
  subtext: { family: 'DM Sans', weight: 400, style: 'normal', size: 34, lineHeight: 1.4, color: COLORS.brown },
  cta: { family: 'PP Pangaia', weight: 700, style: 'italic', size: 26, color: COLORS.ink },
  stepLabel: { family: 'DM Sans', weight: 500, style: 'normal', size: 18, color: COLORS.stepLabel, letterSpacing: 0.5 },
  dateStamp: { family: 'DM Sans', weight: 600, style: 'normal', size: 14, color: COLORS.brown, letterSpacing: 0.2 },
};

const LOGO = { height: 80, rightMargin: 56, bottomMargin: 58, color: COLORS.gold, opacity: 0.85 };
const ARROW = { width: 30, height: 15, stroke: 2, color: COLORS.ink };
const DATE_MARGIN = { top: 74, left: 42 };

// ─── Helpers ────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 9); }

function makeSlide(overrides?: Partial<SlideConfig>): SlideConfig {
  return {
    id: uid(), mode: 'text-only', headline: '', subtext: '', cta: '', stepLabel: '',
    showArrow: false, showLogo: false, screenshotUrl: null,
    dateStamp: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(),
    headlineSize: 72, subtextSize: 36, gapHeadlineSub: 80, gapSubCta: 80,
    ...overrides,
  };
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Perlin noise (2D, seeded) ──────────────────────────────────────
// Classic Perlin noise with gradient permutation table seeded by mulberry32.
// Used to generate a continuous elevation field for contour extraction.
function makePerlin(seed: number) {
  const rng = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const grad2 = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + t * (b - a);
  const dot2 = (g: number[], x: number, y: number) => g[0] * x + g[1] * y;

  return (x: number, y: number): number => {
    const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[xi] + yi], ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi], bb = perm[perm[xi + 1] + yi + 1];
    return lerp(
      lerp(dot2(grad2[aa & 7], xf, yf), dot2(grad2[ba & 7], xf - 1, yf), u),
      lerp(dot2(grad2[ab & 7], xf, yf - 1), dot2(grad2[bb & 7], xf - 1, yf - 1), u),
      v
    );
  };
}

// Multi-octave fractal Perlin (fBm) for richer terrain
function fbm(perlin: (x: number, y: number) => number, x: number, y: number, octaves: number): number {
  let val = 0, amp = 1, freq = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    val += perlin(x * freq, y * freq) * amp;
    max += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return val / max;
}

// ─── Marching squares contour extraction ────────────────────────────
// Extracts isolines from the Perlin noise field at evenly-spaced thresholds.
// Returns SVG path strings for each contour line.
function extractContours(w: number, h: number, field: Float64Array, cols: number, rows: number, threshold: number): string[] {
  const paths: string[] = [];
  const cellW = w / (cols - 1), cellH = h / (rows - 1);

  // Track visited edges to avoid duplicate segments
  const visited = new Set<string>();

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = field[r * cols + c], tr = field[r * cols + c + 1];
      const bl = field[(r + 1) * cols + c], br = field[(r + 1) * cols + c + 1];

      // Classify corners: above (1) or below (0) threshold
      const code = (tl >= threshold ? 8 : 0) | (tr >= threshold ? 4 : 0) | (br >= threshold ? 2 : 0) | (bl >= threshold ? 1 : 0);
      if (code === 0 || code === 15) continue;

      // Interpolate edge crossing positions
      const interp = (a: number, b: number) => (a === b) ? 0.5 : (threshold - a) / (b - a);
      const x0 = c * cellW, y0 = r * cellH;

      const top = { x: x0 + interp(tl, tr) * cellW, y: y0 };
      const right = { x: x0 + cellW, y: y0 + interp(tr, br) * cellH };
      const bottom = { x: x0 + interp(bl, br) * cellW, y: y0 + cellH };
      const left = { x: x0, y: y0 + interp(tl, bl) * cellH };

      // Segment pairs for each marching squares case
      const segments: [typeof top, typeof top][] = [];
      switch (code) {
        case 1: case 14: segments.push([left, bottom]); break;
        case 2: case 13: segments.push([bottom, right]); break;
        case 3: case 12: segments.push([left, right]); break;
        case 4: case 11: segments.push([top, right]); break;
        case 5: segments.push([left, top], [bottom, right]); break;
        case 6: case 9: segments.push([top, bottom]); break;
        case 7: case 8: segments.push([left, top]); break;
        case 10: segments.push([left, bottom], [top, right]); break;
      }

      for (const [a, b] of segments) {
        const key = `${a.x.toFixed(1)},${a.y.toFixed(1)}-${b.x.toFixed(1)},${b.y.toFixed(1)}`;
        if (visited.has(key)) continue;
        visited.add(key);
        paths.push(`M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
      }
    }
  }
  return paths;
}

// ─── Overlay generators ─────────────────────────────────────────────
function genContourPaths(seed: number, w: number, h: number): string[] {
  const perlin = makePerlin(seed);
  const cols = 60, rows = Math.round(60 * (h / w));
  const field = new Float64Array(cols * rows);
  const noiseScale = 2.4; // lower = larger, calmer terrain features

  // Sample the noise field
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      field[r * cols + c] = fbm(perlin, c / cols * noiseScale, r / rows * noiseScale, 3);
    }
  }

  // Extract contours at 8 evenly-spaced elevation thresholds
  const allPaths: string[] = [];
  const levels = 8;
  for (let i = 1; i < levels; i++) {
    const t = -0.5 + (i / levels);
    const segments = extractContours(w, h, field, cols, rows, t);
    // Join nearby segments into longer paths for smoother rendering
    allPaths.push(...segments);
  }
  return allPaths;
}

function genWavePaths(seed: number, w: number, h: number): string[] {
  const paths: string[] = [];
  const rng = mulberry32(seed);
  const scale = Math.max(w, h) / 100;
  for (let i = 0; i < 14; i++) {
    const y0 = (i + 0.5) * (h / 14);
    const amp = (1.5 + rng() * 2.5) * scale;
    const freq = 0.03 + rng() * 0.02;
    const phase = rng() * Math.PI * 2;
    let d = `M 0 ${y0.toFixed(1)}`;
    for (let x = 0; x <= w; x += 20) {
      d += ` L ${x} ${(y0 + Math.sin(x / scale * freq + phase) * amp).toFixed(1)}`;
    }
    paths.push(d);
  }
  return paths;
}

function genGridPaths(w: number, h: number): string[] {
  const paths: string[] = [];
  const step = Math.max(w, h) / 12;
  for (let i = step; i < h; i += step) paths.push(`M 0 ${i} L ${w} ${i}`);
  for (let i = step; i < w; i += step) paths.push(`M ${i} 0 L ${i} ${h}`);
  return paths;
}

type OverlayType = 'off' | 'topo' | 'waves' | 'grid';

function getOverlayPaths(type: OverlayType, seed: number, w: number, h: number): string[] {
  if (type === 'topo') return genContourPaths(seed, w, h);
  if (type === 'waves') return genWavePaths(seed, w, h);
  if (type === 'grid') return genGridPaths(w, h);
  return [];
}

// ─── Canvas rendering ───────────────────────────────────────────────
async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

interface FontSpec { family: string; weight: number; style: string; size: number; lineHeight?: number; color: string; }

function setFont(ctx: CanvasRenderingContext2D, spec: FontSpec) {
  ctx.font = `${spec.style} ${spec.weight} ${spec.size}px '${spec.family}', serif`;
}

function measureBlock(ctx: CanvasRenderingContext2D, lines: string[], spec: FontSpec): number {
  setFont(ctx, spec);
  return lines.length * spec.size * (spec.lineHeight || 1.2);
}

// Parse **bold** markers into segments: [{text, bold}]
function parseBoldSegments(line: string): { text: string; bold: boolean }[] {
  const segs: { text: string; bold: boolean }[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) segs.push({ text: line.slice(last, m.index), bold: false });
    segs.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) segs.push({ text: line.slice(last), bold: false });
  return segs.length ? segs : [{ text: line, bold: false }];
}

function drawCenteredLines(ctx: CanvasRenderingContext2D, lines: string[], spec: FontSpec, centerX: number, startY: number) {
  ctx.fillStyle = spec.color;
  const lineH = spec.size * (spec.lineHeight || 1.2);
  const boldWeight = 700;
  for (let i = 0; i < lines.length; i++) {
    const segs = parseBoldSegments(lines[i]);
    // measure total width for centering
    let totalW = 0;
    for (const seg of segs) {
      ctx.font = `${spec.style} ${seg.bold ? boldWeight : spec.weight} ${spec.size}px '${spec.family}', serif`;
      totalW += ctx.measureText(seg.text).width;
    }
    // draw segments left to right from centered start
    let x = centerX - totalW / 2;
    const y = startY + i * lineH;
    for (const seg of segs) {
      ctx.font = `${spec.style} ${seg.bold ? boldWeight : spec.weight} ${spec.size}px '${spec.family}', serif`;
      ctx.fillText(seg.text, x, y);
      x += ctx.measureText(seg.text).width;
    }
  }
}

// ─── Export ratio presets (SOT-aligned) ─────────────────────────────
const EXPORT_RATIOS: Record<string, { label: string; w: number; h: number; token: string }> = {
  '1x1':      { label: 'Instagram/Threads 1:1',      w: 1080, h: 1080, token: '1x1' },
  '4x5':      { label: 'IG Feed/Carousel 4:5',       w: 1080, h: 1350, token: '4x5' },
  '9x16':     { label: 'TikTok/Reels/Pinterest 9:16', w: 1080, h: 1920, token: '9x16' },
  '16x9':     { label: 'X/Twitter 16:9',              w: 1920, h: 1080, token: '16x9' },
  '1-91x1':   { label: 'LinkedIn/Facebook 1.91:1',    w: 1200, h: 628,  token: '1-91x1' },
};

// Lerp between two hex colors by t (0-1)
function lerpColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

interface RenderOptions {
  slide: SlideConfig;
  bgColor: string;
  bgColorBottom?: string;
  bgImageSrc: string | null;
  overlayType: OverlayType;
  overlayColor: string;
  overlayOpacity: number;
  overlaySeed: number;
  canvasW?: number;
  canvasH?: number;
  dpr?: number;
}

async function renderSlide(canvas: HTMLCanvasElement, opts: RenderOptions) {
  const ctx = canvas.getContext('2d')!;
  const S = CANVAS_SIZE; // 1080 = master content area
  const W = opts.canvasW || S;
  const H = opts.canvasH || S;
  const dpr = opts.dpr || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  // Offset to center the 1080x1080 content area within the larger canvas
  const ox = (W - S) / 2;
  const oy = (H - S) / 2;

  // 1. Background -- fills full W x H canvas
  if (opts.bgImageSrc) {
    try {
      const img = await loadImage(opts.bgImageSrc);
      ctx.drawImage(img, 0, 0, W, H);
    } catch {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, opts.bgColor || COLORS.bgTop);
      grad.addColorStop(1, opts.bgColorBottom || COLORS.bgBottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, opts.bgColor || COLORS.bgTop);
    grad.addColorStop(1, COLORS.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // 2. Overlay -- fills full W x H
  const paths = getOverlayPaths(opts.overlayType, opts.overlaySeed, W, H);
  if (paths.length > 0) {
    ctx.save();
    ctx.globalAlpha = opts.overlayOpacity;
    ctx.strokeStyle = opts.overlayColor;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (const d of paths) { ctx.stroke(new Path2D(d)); }
    ctx.restore();
  }

  // 3. Date stamp -- positioned relative to canvas edges, not content area
  if (opts.slide.dateStamp) {
    ctx.save();
    const ds = FONT.dateStamp;
    ctx.font = `${ds.weight} ${ds.size}px '${ds.family}', sans-serif`;
    ctx.fillStyle = ds.color;
    ctx.letterSpacing = `${ds.letterSpacing}em`;
    ctx.fillText(opts.slide.dateStamp.toUpperCase(), DATE_MARGIN.left, DATE_MARGIN.top);
    ctx.restore();
  }

  // All content below is offset by (ox, oy) to center the 1080x1080 content area
  ctx.save();
  ctx.translate(ox, oy);

  // 4. Content
  const { slide } = opts;
  const headlineLines = slide.headline.split('\n').filter(Boolean);
  const subtextLines = slide.subtext.split('\n').filter(Boolean);

  if (slide.mode === 'text-only') {
    const cx = S / 2;
    const hSpec = { ...FONT.headline, size: slide.headlineSize || FONT.headline.size };
    const sSpec = { ...FONT.subtext, size: slide.subtextSize || FONT.subtext.size };
    const headlineLineH = hSpec.size * (hSpec.lineHeight || 1.17);
    const subtextLineH = sSpec.size * (sSpec.lineHeight || 1.28);
    const gapHS = slide.gapHeadlineSub ?? 80;
    const gapSC = slide.gapSubCta ?? 80;

    const hH = headlineLines.length * headlineLineH;
    const gap1 = subtextLines.length > 0 ? gapHS : 0;
    const sH = subtextLines.length * subtextLineH;
    const gap2 = slide.showArrow && !slide.cta && subtextLines.length === 0 ? 24 : 0;
    const arrowH = slide.showArrow && !slide.cta && subtextLines.length === 0 ? ARROW.height : 0;
    const gap3 = slide.cta ? gapSC : 0;
    const ctaH = slide.cta ? FONT.cta.size * 1.2 : 0;
    const totalH = hH + gap1 + sH + gap2 + arrowH + gap3 + ctaH;

    let y = S / 2 - totalH / 2 + hSpec.size * 0.8;

    if (headlineLines.length > 0) {
      drawCenteredLines(ctx, headlineLines, hSpec, cx, y);
      y += hH;
    }

    if (slide.showArrow && !slide.cta && subtextLines.length === 0) {
      y += gap2;
      ctx.save();
      ctx.font = `italic 500 40px 'PP Pangaia', serif`;
      ctx.fillStyle = COLORS.brown;
      ctx.globalAlpha = 0.9;
      const arrowText = '\u2192';
      const w = ctx.measureText(arrowText).width;
      ctx.fillText(arrowText, cx - w / 2, y + ARROW.height / 2 + 4);
      ctx.restore();
      y += arrowH;
    }

    if (subtextLines.length > 0) {
      y += gap1;
      drawCenteredLines(ctx, subtextLines, sSpec, cx, y);
      y += sH;
    }

    if (slide.cta) {
      y += gap3;
      setFont(ctx, FONT.cta);
      ctx.fillStyle = FONT.cta.color;
      const w = ctx.measureText(slide.cta).width;
      ctx.fillText(slide.cta, cx - w / 2, y);
    }
  } else {
    // Image+text mode
    let y = S * 0.08 + FONT.stepLabel.size;

    if (slide.stepLabel) {
      ctx.save();
      const sl = FONT.stepLabel;
      ctx.font = `${sl.weight} ${sl.size}px '${sl.family}', sans-serif`;
      ctx.letterSpacing = `${sl.letterSpacing}em`;
      ctx.fillStyle = sl.color;
      const w = ctx.measureText(slide.stepLabel.toUpperCase()).width;
      ctx.fillText(slide.stepLabel.toUpperCase(), S / 2 - w / 2, y);
      ctx.restore();
      y += sl.size * 2.0;
    }

    if (headlineLines.length > 0) {
      drawCenteredLines(ctx, headlineLines, FONT.imageHeadline, S / 2, y);
      y += measureBlock(ctx, headlineLines, FONT.imageHeadline) + FONT.imageHeadline.size * 0.5;
    }

    if (slide.screenshotUrl) {
      try {
        const img = await loadImage(slide.screenshotUrl);
        const phoneW = S * 0.28;
        const phoneH = (img.height / img.width) * phoneW;
        const px = S / 2 - phoneW / 2;
        const py = y + 10;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.15)';
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 10;
        ctx.beginPath(); ctx.roundRect(px, py, phoneW, phoneH, 20); ctx.clip();
        ctx.drawImage(img, px, py, phoneW, phoneH);
        ctx.restore();
      } catch { /* skip */ }
    }
  }

  ctx.restore(); // pop the translate(ox, oy)

  // 5. Logo -- italic T blended into background, no box
  if (opts.slide.showLogo) {
    ctx.save();
    const logoSize = LOGO.height;
    const lx = W - LOGO.rightMargin;
    const ly = H - LOGO.bottomMargin;
    ctx.globalAlpha = LOGO.opacity;
    ctx.font = `italic 500 ${logoSize}px Georgia, 'Times New Roman', serif`;
    ctx.fillStyle = COLORS.gold;
    ctx.textAlign = 'right';
    ctx.fillText('T', lx, ly);
    ctx.textAlign = 'left';
    ctx.restore();
  }
}

// ─── Inside the page component ──────────────────────────────────────
// makeOpts builds RenderOptions per slide; when a preset sets bgColorEnd,
// the background hue walks from bgColor toward bgColorEnd across the deck.
  const makeOpts = useCallback((slide: SlideConfig, slideIdx?: number): RenderOptions => {
    // Gradient progression: shift bgColor and bgBottom per slide when bgColorEnd is set
    let slideBgColor = bgColor;
    let slideBgBottom: string | undefined;
    if (bgColorEnd && slides.length > 1 && slideIdx !== undefined) {
      const t = slideIdx / (slides.length - 1); // 0 for first slide, 1 for last
      slideBgColor = lerpColor(bgColor, bgColorEnd, t * 0.6); // top shifts 60%
      slideBgBottom = lerpColor(COLORS.bgBottom, bgColorEnd, t); // bottom shifts 100%
    }
    return {
      slide, bgColor: slideBgColor, bgColorBottom: slideBgBottom, bgImageSrc: bgImage,
      overlayType, overlayColor, overlayOpacity, overlaySeed,
    };
  }, [bgColor, bgColorEnd, bgImage, overlayType, overlayColor, overlayOpacity, overlaySeed, slides.length]);

// Export machinery. Runs in-component (uses slides / makeOpts / assetTitle
// / setExporting state). The "All ratios" button drives exportAllRatios,
// which is also what the headless Playwright driver clicks.
  const EXPORT_DPR = 2; // 2x for Retina/4K sharpness

  const exportSlide = async (idx: number) => {
    const c = document.createElement('canvas');
    await renderSlide(c, { ...makeOpts(slides[idx], idx), dpr: EXPORT_DPR });
    c.toBlob((blob) => { if (!blob) return; const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `slide_${idx + 1}.png`; a.click(); }, 'image/png');
  };

  const exportAll = async () => {
    setExporting(true);
    for (let i = 0; i < slides.length; i++) {
      const c = document.createElement('canvas');
      await renderSlide(c, { ...makeOpts(slides[i], i), dpr: EXPORT_DPR });
      await new Promise<void>((resolve) => {
        c.toBlob((blob) => { if (!blob) { resolve(); return; } const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `slide_${i + 1}.png`; a.click(); setTimeout(resolve, 200); }, 'image/png');
      });
    }
    setExporting(false);
  };

  const exportAllRatios = async () => {
    setExporting(true);
    const ratioKeys = Object.keys(EXPORT_RATIOS);
    for (let i = 0; i < slides.length; i++) {
      for (const rk of ratioKeys) {
        const r = EXPORT_RATIOS[rk];
        const c = document.createElement('canvas');
        await renderSlide(c, { ...makeOpts(slides[i], i), canvasW: r.w, canvasH: r.h, dpr: EXPORT_DPR });
        await new Promise<void>((resolve) => {
          c.toBlob((blob) => {
            if (!blob) { resolve(); return; }
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `therma_${assetTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, '')}_slide_${i + 1}_${r.token}.png`;
            a.click();
            setTimeout(resolve, 150);
          }, 'image/png');
        });
      }
    }
    setExporting(false);
  };

// CTA-word linting: lines starting with an action word are classified as
// CTAs (not headline/subtext) when generating slides from pasted text.
  const CTA_WORDS = ['download', 'try', 'get', 'join', 'sign up', 'start', 'subscribe', 'learn more', 'link in bio', 'free on', 'swipe', 'tap', 'click', 'follow', 'founding member', 'therma.one'];

  const generateFromText = () => {
    const raw = generateText.trim();
    if (!raw) return;
    const withoutCaption = raw.replace(/^caption\b[^\n]*/im, '').trim();
    const hasSlideMarkers = /^slide\s+\d+/im.test(withoutCaption);
    let blocks: string[];
    if (hasSlideMarkers) {
      blocks = withoutCaption.split(/^slide\s+\d+\s*$/im).map((b) => b.trim()).filter(Boolean);
    } else {
      blocks = withoutCaption.split(/\n\s*\n|^---$/m).map((b) => b.trim()).filter(Boolean);
    }
    const newSlides: SlideConfig[] = blocks.map((block, idx) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      let headline = '', subtext = '', cta = '';
      for (const line of lines) {
        const lower = line.toLowerCase();
        const isCta = CTA_WORDS.some((w) => lower.startsWith(w));
        if (isCta && !cta) { cta = line; }
        else if (!headline) { headline = line; }
        else if (!subtext) { subtext = line; }
        else { subtext += '\n' + line; }
      }
      const isFirst = idx === 0, isLast = idx === blocks.length - 1;
      return makeSlide({
        headline, subtext, cta, showLogo: isFirst || isLast,
        showArrow: isFirst && !subtext && !cta,
        dateStamp: isFirst ? new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase() : '',
      });
    });
    if (newSlides.length > 0) { setSlides(newSlides); setActiveIdx(0); setShowGenerate(false); setGenerateText(''); }
  };
