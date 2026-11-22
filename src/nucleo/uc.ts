// UC (unidade consumidora): acha o bloco da UC no DXF perto da rede nova e diz em que áreas protegidas ela está.
// Bloco de UC longe da obra (sobra do modelo do CAD) nunca vira a UC: sem bloco perto, o site pede o clique no mapa.
import type { Pt, Rede } from './tipos.ts';
import type { DxfGeo } from './dxf.ts';
import { semAcento, type AreaProtegida, type BaseAreas } from './areas.ts';
import type { AreaConfirmada } from './caso.ts';
import { redeNova } from './rede.ts';
import { G } from './geom.ts';
import type { CamadaKit } from './shp.ts';
import { PADROES_UC, RAIO_UC } from '../regras/uc.ts';

export interface CandidatoUc { ponto: Pt; bloco: string; camada: string; distancia: number }
export interface SituacaoUc { ponto: Pt; dentro: (AreaProtegida | AreaConfirmada)[]; emApp: boolean }

const ehBlocoUc = (nome: string): boolean => {
  const n = semAcento(nome).trim();
  return PADROES_UC.some((p) => p.test(n));
};

/** Blocos de UC a até RAIO_UC dos vãos novos ou dos postes novos; o mais perto primeiro. */
export function acharUcs(d: DxfGeo, rede: Rede): CandidatoUc[] {
  const alvos = [
    ...redeNova(rede).map((v) => G.linha(v.pts)),
    ...rede.postes.filter((p) => p.novo).map((p) => G.ponto(p.ponto)),
  ];
  if (alvos.length === 0) return [];
  const achados: CandidatoUc[] = [];
  for (const b of d.blocos) {
    if (!ehBlocoUc(b.nome)) continue;
    const g = G.ponto(b.ponto);
    const distancia = Math.min(...alvos.map((a) => G.distancia(g, a)));
    if (distancia <= RAIO_UC) achados.push({ ponto: b.ponto, bloco: b.nome, camada: b.camada, distancia });
  }
  return achados.sort((a, b) => a.distancia - b.distancia);
}

const caixaDe = (a: AreaProtegida | AreaConfirmada): [number, number, number, number] => {
  if ('caixa' in a) return a.caixa;
  const c: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poli of a.poligonos) for (const p of poli[0] ?? []) {
    if (p[0] < c[0]) c[0] = p[0];
    if (p[1] < c[1]) c[1] = p[1];
    if (p[0] > c[2]) c[2] = p[0];
    if (p[1] > c[3]) c[3] = p[1];
  }
  return c;
};

/** Áreas protegidas e APPs confirmadas que contêm o ponto. A caixa filtra antes do teste de polígono (a base tem milhares). */
export function situarUc(p: Pt, base: BaseAreas, confirmadas: AreaConfirmada[]): SituacaoUc {
  const g = G.ponto(p);
  const dentro: (AreaProtegida | AreaConfirmada)[] = [];
  for (const a of [...base.areas, ...confirmadas]) {
    const c = caixaDe(a);
    if (p[0] < c[0] || p[0] > c[2] || p[1] < c[1] || p[1] > c[3]) continue;
    if (a.poligonos.some((aneis) => aneis.length > 0 && aneis[0].length >= 4 && G.contem(G.poligono(aneis), g))) dentro.push(a);
  }
  return { ponto: p, dentro, emApp: dentro.some((a) => 'largura' in a) };
}

export function camadaUc(os: string, p: Pt): CamadaKit {
  return { nome: `${os} UC`, tipo: 'ponto', feicoes: [{ name: 'UC', geometria: [{ t: 'ponto', p }] }] };
}
