// única porta de entrada do JSTS no projeto: o resto do código usa só G
// (usa as classes de operação, sem o "monkey patch" do JSTS)
import ArrayList from 'jsts/java/util/ArrayList.js';
import Coordinate from 'jsts/org/locationtech/jts/geom/Coordinate.js';
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js';
import LengthIndexedLine from 'jsts/org/locationtech/jts/linearref/LengthIndexedLine.js';
import BoundaryOp from 'jsts/org/locationtech/jts/operation/BoundaryOp.js';
import BufferParameters from 'jsts/org/locationtech/jts/operation/buffer/BufferParameters.js';
import BufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js';
import DistanceOp from 'jsts/org/locationtech/jts/operation/distance/DistanceOp.js';
import LineMerger from 'jsts/org/locationtech/jts/operation/linemerge/LineMerger.js';
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js';
import RelateOp from 'jsts/org/locationtech/jts/operation/relate/RelateOp.js';
import UnaryUnionOp from 'jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js';
import TopologyPreservingSimplifier from 'jsts/org/locationtech/jts/simplify/TopologyPreservingSimplifier.js';
import type { Pt } from './tipos.ts';

export type Geo = unknown; // geometria do JSTS

// o pedaço da geometria do JSTS que este arquivo usa
interface J {
  isEmpty(): boolean;
  getGeometryType(): string;
  getNumGeometries(): number;
  getGeometryN(i: number): J;
  getCoordinates(): { x: number; y: number }[];
  getArea(): number;
  getLength(): number;
  getExteriorRing(): J;
  getNumInteriorRing(): number;
  getInteriorRingN(i: number): J;
  getEnvelopeInternal(): { getMinX(): number; getMinY(): number; getMaxX(): number; getMaxY(): number };
}

const fab = new GeometryFactory();
const j = (g: Geo) => g as J;
const coord = (p: Pt) => new Coordinate(p[0], p[1]);
const vazio = (): Geo => fab.createGeometryCollection();
const lista = (gs: Geo[]) => {
  const l = new ArrayList(undefined); // o tipo do JSTS exige o argumento (coleção inicial)
  for (const g of gs) l.add(g);
  return l;
};

// coleção mista vira suas partes; Multi* e geometria simples ficam inteiras
function partes(g: J): J[] {
  if (g.isEmpty()) return [];
  if (g.getGeometryType() !== 'GeometryCollection') return [g];
  const out: J[] = [];
  for (let i = 0; i < g.getNumGeometries(); i++) out.push(...partes(g.getGeometryN(i)));
  return out;
}

// componentes simples (ponto, linha, anel, polígono)
function folhas(g: J): J[] {
  if (g.isEmpty()) return [];
  const n = g.getNumGeometries();
  if (n === 1 && g.getGeometryN(0) === g) return [g];
  const out: J[] = [];
  for (let i = 0; i < n; i++) out.push(...folhas(g.getGeometryN(i)));
  return out;
}

const pts = (g: J): Pt[] => g.getCoordinates().map((c) => [c.x, c.y] as Pt);

function uniao(gs: Geo[]): Geo {
  const cheias = gs.filter((g) => !j(g).isEmpty());
  if (cheias.length === 0) return vazio();
  return UnaryUnionOp.union(lista(cheias));
}

// o overlay do JSTS não aceita GeometryCollection: opera parte a parte
function diferenca(a: Geo, b: Geo): Geo {
  const tira = partes(j(b));
  return uniao(partes(j(a)).map((pa) => tira.reduce<Geo>((r, pb) => (j(r).isEmpty() ? r : OverlayOp.difference(r, pb)), pa)));
}

function intersecao(a: Geo, b: Geo): Geo {
  const out: Geo[] = [];
  for (const pa of partes(j(a))) for (const pb of partes(j(b))) out.push(OverlayOp.intersection(pa, pb));
  return uniao(out);
}

function linha(p: Pt[]): Geo {
  return p.length < 2 ? fab.createLineString() : fab.createLineString(p.map(coord));
}

const poligono = (aneis: Pt[][]): Geo =>
  fab.createPolygon(
    fab.createLinearRing(aneis[0].map(coord)),
    aneis.slice(1).map((a) => fab.createLinearRing(a.map(coord))),
  );

export const G = {
  linha,
  poligono,
  // a contém b
  contem: (a: Geo, b: Geo): boolean => RelateOp.contains(a, b),
  pontos: (g: Geo): Pt[] => pts(j(g)),
  // pedaços da linha que ficam dentro do polígono
  dentro: (l: Pt[], poli: Geo): Pt[][] =>
    folhas(j(intersecao(linha(l), poli)))
      .filter((f) => f.getGeometryType() === 'LineString')
      .map(pts),
  ponto: (p: Pt): Geo => fab.createPoint(coord(p)),
  caixa: (x0: number, y0: number, x1: number, y1: number): Geo =>
    fab.createPolygon([coord([x0, y0]), coord([x1, y0]), coord([x1, y1]), coord([x0, y1]), coord([x0, y0])]),
  uniao,
  diferenca,
  intersecao,
  // buffer; segmentos por quadrante, padrão 4; ponta 'redonda' (padrão) ou 'reta' (corta na ponta da linha)
  engrossa: (g: Geo, d: number, segmentos = 4, ponta: 'redonda' | 'reta' = 'redonda'): Geo => {
    if (j(g).isEmpty()) return vazio();
    if (ponta === 'redonda') return BufferOp.bufferOp(g, d, segmentos);
    return BufferOp.bufferOp(g, d, new BufferParameters(segmentos, BufferParameters.CAP_FLAT));
  },
  simplifica: (g: Geo, tol: number): Geo => (j(g).isEmpty() ? g : TopologyPreservingSimplifier.simplify(g, tol)),
  contorno: (g: Geo): Geo => (j(g).isEmpty() ? vazio() : BoundaryOp.getBoundary(g)),
  // linemerge
  costura: (g: Geo): Geo => {
    const ls = folhas(j(g)).filter((f) => f.getGeometryType() === 'LineString' || f.getGeometryType() === 'LinearRing');
    if (ls.length === 0) return vazio();
    const m = new LineMerger();
    for (const l of ls) m.add(l);
    return fab.buildGeometry(m.getMergedLineStrings());
  },
  // tira os buracos de área até areaMin; buraco que toca `abertos` fica, de qualquer tamanho
  semBuracos: (g: Geo, areaMin: number, abertos: Geo = vazio()): Geo =>
    uniao(
      folhas(j(g))
        .filter((f) => f.getGeometryType() === 'Polygon')
        .map((p) => {
          const buracos: Geo[] = [];
          for (let i = 0; i < p.getNumInteriorRing(); i++) {
            const anel = p.getInteriorRingN(i);
            const b = fab.createPolygon(anel);
            const toca = !j(abertos).isEmpty() && DistanceOp.distance(b, abertos) === 0;
            if (toca || j(b).getArea() > areaMin) buracos.push(anel);
          }
          return fab.createPolygon(p.getExteriorRing(), buracos);
        }),
    ),
  // polígonos da geometria, cada um como anéis [externo, ...furos]
  poligonos: (g: Geo): Pt[][][] =>
    folhas(j(g))
      .filter((f) => f.getGeometryType() === 'Polygon')
      .map((p) => {
        const aneis = [pts(p.getExteriorRing())];
        for (let i = 0; i < p.getNumInteriorRing(); i++) aneis.push(pts(p.getInteriorRingN(i)));
        return aneis;
      }),
  linhas: (g: Geo): Pt[][] =>
    folhas(j(g))
      .filter((f) => f.getGeometryType() === 'LineString' || f.getGeometryType() === 'LinearRing')
      .map(pts),
  // retângulo envolvente [x0, y0, x1, y1]; vazio dá um retângulo invertido, que não cruza nada
  envelope: (g: Geo): [number, number, number, number] => {
    if (j(g).isEmpty()) return [Infinity, Infinity, -Infinity, -Infinity];
    const e = j(g).getEnvelopeInternal();
    return [e.getMinX(), e.getMinY(), e.getMaxX(), e.getMaxY()];
  },
  area: (g: Geo): number => j(g).getArea(),
  comprimento: (g: Geo): number => j(g).getLength(),
  distancia: (a: Geo, b: Geo): number => DistanceOp.distance(a, b),
  maisPerto: (g: Geo, p: Pt): Pt => {
    const c = DistanceOp.nearestPoints(g, fab.createPoint(coord(p)))[0];
    return [c.x, c.y];
  },
  trecho: (l: Pt[], de: number, ate: number): Pt[] => pts(new LengthIndexedLine(linha(l)).extractLine(de, ate)),
  noMeio: (l: Pt[], fracao: number): Pt => {
    const g = linha(l);
    const c = new LengthIndexedLine(g).extractPoint(fracao * j(g).getLength());
    return [c.x, c.y];
  },
};

// arredonda as quinas: cada passada troca cada lado por dois pontos a 1/4 e 3/4, mantendo as pontas
export function chaikin(p: Pt[], vezes = 2): Pt[] {
  let atual = p;
  for (let v = 0; v < vezes; v++) {
    const novo: Pt[] = [atual[0]];
    for (let i = 0; i + 1 < atual.length; i++) {
      const [ax, ay] = atual[i];
      const [bx, by] = atual[i + 1];
      novo.push([0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by], [0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by]);
    }
    novo.push(atual[atual.length - 1]);
    atual = novo;
  }
  return atual;
}
