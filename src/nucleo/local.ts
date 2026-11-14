import type { Aviso, Pt, Rede } from './tipos.ts';
import type { AreaProtegida } from './areas.ts';
import { G, type Geo } from './geom.ts';
import { redeNova } from './rede.ts';
import { TEXTOS } from '../regras/textos.ts';

const E_MIN = 150000, E_MAX = 800000, N_MIN = 9000000, N_MAX = 9800000;
const LIMITE_ETIQUETA = 100; // metros

const foraDaFaixa = ([e, n]: Pt): boolean => !(e >= E_MIN && e <= E_MAX && n >= N_MIN && n <= N_MAX);

// o desenho está no Ceará? 1) dentro da faixa UTM; 2) o meio de cada vão novo cai em algum município
export function conferirLocal(r: Rede, municipios: AreaProtegida[]): Aviso | null {
  if (r.vaos.some((v) => v.pts.some(foraDaFaixa))) {
    return {
      nivel: 'vermelho',
      codigo: 'FORA_UTM',
      texto: TEXTOS.foraDaCoordenada,
      comoCorrigir: 'No CAD, mova o desenho para a coordenada real (SIRGAS 2000 UTM 24 Sul) e salve o DXF de novo.',
    };
  }
  const poligonos = new Map<AreaProtegida, Geo[]>();
  const geosDe = (m: AreaProtegida): Geo[] => {
    let g = poligonos.get(m);
    if (!g) poligonos.set(m, (g = m.poligonos.map((p) => G.poligono(p))));
    return g;
  };
  const dentroDeAlgum = (p: Pt): boolean => {
    const ponto = G.ponto(p);
    return municipios.some(
      (m) => p[0] >= m.caixa[0] && p[0] <= m.caixa[2] && p[1] >= m.caixa[1] && p[1] <= m.caixa[3] && geosDe(m).some((g) => G.contem(g, ponto)),
    );
  };
  for (const v of redeNova(r)) {
    if (v.pts.length < 2) continue;
    if (!dentroDeAlgum(G.noMeio(v.pts, 0.5))) {
      return {
        nivel: 'vermelho',
        codigo: 'FORA_CEARA',
        texto: 'A rede está fora do Ceará pelo limite dos municípios do KMZ.',
        comoCorrigir: 'Confira no CAD se o desenho está na coordenada certa e se o arquivo é da obra que você quer enviar.',
      };
    }
  }
  return null;
}

// compara a posição do poste no desenho com a coordenada escrita na etiqueta; usa a mediana
export function conferirEtiquetas(r: Rede): { aviso: Aviso | null; distancia: number | null } {
  const ds = r.postes
    .filter((p) => p.coordEscrita && p.etiqueta)
    .map((p) => Math.hypot(p.coordEscrita![0] - p.etiqueta![0], p.coordEscrita![1] - p.etiqueta![1]))
    .sort((a, b) => a - b);
  if (ds.length === 0) return { aviso: null, distancia: null };
  const meio = ds.length >> 1;
  const d = ds.length % 2 ? ds[meio] : (ds[meio - 1] + ds[meio]) / 2;
  if (d <= LIMITE_ETIQUETA) return { aviso: null, distancia: d };
  return {
    aviso: {
      nivel: 'vermelho',
      codigo: 'ETIQUETA_LONGE',
      texto: `o desenho e as coordenadas das etiquetas não batem (${Math.round(d)} m); o kit sairia deslocado`,
      comoCorrigir: 'No CAD, confira se os postes estão na posição das coordenadas escritas nas etiquetas e corrija o que estiver deslocado.',
    },
    distancia: d,
  };
}
