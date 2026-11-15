import type { Geometria, Pt } from './tipos.ts';
import type { CamadaKit } from './shp.ts';
import { deUtm } from './utm.ts';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function coords(pts: Pt[]): string {
  return pts
    .map((p) => {
      const [lon, lat] = deUtm(p);
      return `${lon.toFixed(8)},${lat.toFixed(8)},0`;
    })
    .join(' ');
}

function fechado(a: Pt[]): Pt[] {
  const p = a[0];
  const u = a[a.length - 1];
  return p && (p[0] !== u[0] || p[1] !== u[1]) ? [...a, p] : a;
}

function geometriaKml(g: Geometria): string {
  if (g.t === 'ponto') return `<Point><coordinates>${coords([g.p])}</coordinates></Point>`;
  if (g.t === 'linha') return `<LineString><coordinates>${coords(g.pts)}</coordinates></LineString>`;
  const [ext, ...buracos] = g.aneis;
  const anel = (a: Pt[]) => `<LinearRing><coordinates>${coords(fechado(a))}</coordinates></LinearRing>`;
  return `<Polygon><outerBoundaryIs>${anel(ext)}</outerBoundaryIs>${buracos.map((b) => `<innerBoundaryIs>${anel(b)}</innerBoundaryIs>`).join('')}</Polygon>`;
}

/** KML de uma camada: um Document, um Placemark por feição, coordenadas lon,lat,0 com 8 casas. */
export function gravarKml(c: CamadaKit): string {
  const marcas = c.feicoes.map((f) => {
    const gs = f.geometria.filter((g) => g.t !== 'poligono' || g.aneis.length > 0).map(geometriaKml);
    const geo = gs.length === 1 ? gs[0] : gs.length > 1 ? `<MultiGeometry>${gs.join('')}</MultiGeometry>` : '';
    return `<Placemark><name>${esc(f.name)}</name>${geo}</Placemark>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(c.nome)}</name>${marcas.join('\n')}</Document></kml>\n`;
}
