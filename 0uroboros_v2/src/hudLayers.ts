export type Band = { rmin: number; rmax: number };
export type BandGroup = Band & { members: number[] };

/**
 * Splits a straight-on drawing of concentric shapes into its layers: elements whose radial bands overlap (or sit
 * within `gap` of each other) belong together. Smallest layer first.
 */
export function groupConcentric(bands: Band[], gap = .2): BandGroup[] {
  const groups: BandGroup[] = [];
  for (const i of bands.map((_, i) => i).sort((a, b) => bands[a].rmin - bands[b].rmin)) {
    const last = groups.at(-1), band = bands[i];
    if (last && band.rmin <= last.rmax + gap) { last.rmax = Math.max(last.rmax, band.rmax); last.members.push(i); }
    else groups.push({ rmin: band.rmin, rmax: band.rmax, members: [i] });
  }
  return groups;
}

/** Depth of each layer along the stack, front (0) to back: gaps widen evenly from `near` to `far`. */
export function stackDepths(count: number, near = 2, far = 6) {
  const depths = [0];
  for (let k = 1; k < count; k++) depths.push(depths[k - 1] + (count > 2 ? near + (far - near) * (k - 1) / (count - 2) : near));
  return depths;
}

/** One rasterized layer; its canvas spans `reach` drawing units either side of the shared centre. */
export type HudLayer = Band & { reach: number; canvas: HTMLCanvasElement };
export type HudLayers = { layers: HudLayer[]; center: [number, number] };

const SKIPPED = 'defs,mask,clipPath,pattern,symbol,marker';
const drawables = (svg: Element) => [...svg.querySelectorAll<SVGGeometryElement>('path,rect,circle,ellipse,polygon,polyline,line')].filter(el => !el.parentElement?.closest(SKIPPED) && !el.closest(SKIPPED));

/** Drops the drawing's raster content: placed images, and shapes painted with image patterns. Vector shapes stay. */
function stripRasters(svg: Element) {
  const patterns = new Set([...svg.querySelectorAll('pattern')].map(pattern => pattern.id));
  const paintsPattern = (el: Element) => ['fill', 'stroke'].some(attr => {
    const paint = el.getAttribute(attr) ?? (el as SVGElement).style?.getPropertyValue(attr) ?? '';
    const id = /url\(\s*['"]?#([^'")\s]+)/.exec(paint)?.[1];
    return !!id && patterns.has(id);
  });
  svg.querySelectorAll('*').forEach(el => { if (!el.closest(SKIPPED) && paintsPattern(el)) el.remove(); });
  svg.querySelectorAll('image').forEach(image => { if (!image.closest(SKIPPED)) image.remove(); });
}

/**
 * Loads a drawing of concentric shapes, without its raster images, and rasterizes each layer on its own straight
 * from the SVG, so masks and opacity come through exactly as drawn.
 */
export async function loadConcentricLayers(url: string, pixelsPerUnit: number): Promise<HudLayers> {
  const source = new DOMParser().parseFromString(await (await fetch(url)).text(), 'image/svg+xml').documentElement;
  stripRasters(source);

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none';
  const live = document.importNode(source, true) as unknown as SVGSVGElement;
  host.appendChild(live);
  document.body.appendChild(host);
  let points: [number, number][][];
  try {
    const toRoot = live.getScreenCTM()!.inverse();
    points = drawables(live).map(el => {
      const matrix = toRoot.multiply(el.getScreenCTM()!), length = el.getTotalLength(), samples = Math.max(16, Math.ceil(length / 2));
      return Array.from({ length: samples + 1 }, (_, k) => {
        const on = el.getPointAtLength(length * k / samples), p = new DOMPoint(on.x, on.y).matrixTransform(matrix);
        return [p.x, p.y] as [number, number];
      });
    });
  } finally { host.remove(); }

  const all = points.flat();
  const center: [number, number] = [(Math.min(...all.map(p => p[0])) + Math.max(...all.map(p => p[0]))) / 2, (Math.min(...all.map(p => p[1])) + Math.max(...all.map(p => p[1]))) / 2];
  const bands = points.map(pts => { const r = pts.map(([x, y]) => Math.hypot(x - center[0], y - center[1])); return { rmin: Math.min(...r), rmax: Math.max(...r) }; });

  const layers = await Promise.all(groupConcentric(bands).map(async group => {
    const svg = source.cloneNode(true) as Element, keep = new Set(group.members);
    drawables(svg).forEach((el, i) => { if (!keep.has(i)) el.remove(); });
    const reach = group.rmax + 1, size = Math.min(2048, Math.max(32, Math.ceil(2 * reach * pixelsPerUnit)));
    svg.setAttribute('viewBox', `${center[0] - reach} ${center[1] - reach} ${2 * reach} ${2 * reach}`);
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    const blob = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    try {
      const image = new Image();
      image.src = blob;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d')!.drawImage(image, 0, 0, size, size);
      return { rmin: group.rmin, rmax: group.rmax, reach, canvas };
    } finally { URL.revokeObjectURL(blob); }
  }));
  return { layers, center };
}
