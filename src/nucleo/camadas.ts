import type { Geometria, Pt, Rede, TipoRede } from './tipos.ts';
import type { AreaProtegida, BaseAreas } from './areas.ts';
import type { AreaConfirmada, Caso, Intervencao } from './caso.ts';
import type { CamadaKit } from './shp.ts';
import { redeNova } from './rede.ts';
import { G } from './geom.ts';
import { FAIXA } from '../regras/faixas.ts';

const NOME_REDE: Record<TipoRede, string> = { MT: 'REDE MT', BT: 'REDE BT', CONJ: 'REDE CONJUGADA' };
const ORDEM: TipoRede[] = ['MT', 'BT', 'CONJ'];
const SEGMENTOS = 4;

/** Troca os caracteres que o Windows não aceita em nome de arquivo por espaço. */
export const nomeDeArquivo = (nome: string): string => nome.replace(/[\/:*?"<>|]/g, ' ');

const poligonosDe = (poligonos: Pt[][][]): Geometria[] =>
  poligonos.filter((an) => an.length > 0 && an[0].length >= 4).map((aneis) => ({ t: 'poligono', aneis }));

/**
 * Gera as camadas do kit, na ordem do desenho: rede (MT, BT, conjugada), postes, uma por área com
 * intervenção (a APP confirmada traz a água ao lado), uma faixa por área, e por fim os `extras`.
 *
 * A água de uma APP confirmada é achada em `base.areas` pelo `aguaId`; sem `base` (ou sem a água lá),
 * a camada da água simplesmente não sai.
 *
 * Faixa = buffer(trechos, FAIXA/2) com ponta reta. Intervenção só de poste (sem trecho) não tem faixa:
 * a área dela é 2,856 m² por poste, não uma faixa, e uma camada vazia não sai.
 *
 * Nomes de camada repetidos (o KMZ real repete nomes de área) ganham " 2", " 3"... para não
 * virarem o mesmo arquivo; a faixa acompanha o nome da sua área.
 */
export function montarCamadas(os: string, caso: Caso, rede: Rede, extras: CamadaKit[] = [], base?: BaseAreas): CamadaKit[] {
  const saida: CamadaKit[] = [];
  const usados = new Set<string>();
  const chave = (n: string) => nomeDeArquivo(n).toLowerCase();
  // devolve o nome sem o prefixo da OS, único entre as camadas já criadas
  const unico = (parte: string): string => {
    let n = parte;
    for (let i = 2; usados.has(chave(`${os} ${n}`)); i++) n = `${parte} ${i}`;
    usados.add(chave(`${os} ${n}`));
    return n;
  };
  const camada = (parte: string, tipo: CamadaKit['tipo'], feicoes: CamadaKit['feicoes']): void => {
    saida.push({ nome: `${os} ${parte}`, tipo, feicoes });
  };

  // 1. rede nova por tipo
  const novos = redeNova(rede);
  for (const tipo of ORDEM) {
    const vaos = novos.filter((v) => v.tipo === tipo);
    if (vaos.length) {
      camada(unico(NOME_REDE[tipo]), 'linha', vaos.map((v) => ({ name: v.id, geometria: [{ t: 'linha', pts: v.pts }] })));
    }
  }

  // 2. postes novos, um por feição
  const postes = rede.postes.filter((p) => p.novo);
  if (postes.length) {
    camada(unico('POSTES'), 'ponto', postes.map((p) => ({ name: p.numero ?? p.id, geometria: [{ t: 'ponto', p: p.ponto }] })));
  }

  // 3. uma camada por área com intervenção
  const nomesDasAreas = new Map<Intervencao, string>();
  const aguasFeitas = new Set<number>();
  for (const iv of caso.intervencoes) {
    const a: AreaProtegida | AreaConfirmada = iv.area;
    const parte = unico(a.nome);
    nomesDasAreas.set(iv, parte);
    camada(parte, 'poligono', [{ name: a.nome, geometria: poligonosDe(a.poligonos) }]);
    if ('aguaId' in a && a.aguaId !== undefined && !aguasFeitas.has(a.aguaId)) {
      const agua = base?.areas.find((x) => x.id === a.aguaId);
      if (agua) {
        aguasFeitas.add(agua.id);
        if (agua.poligonos.length) camada(unico(agua.nome), 'poligono', [{ name: agua.nome, geometria: poligonosDe(agua.poligonos) }]);
        else if (agua.linhas.length) camada(unico(agua.nome), 'linha', [{ name: agua.nome, geometria: agua.linhas.map((pts) => ({ t: 'linha', pts })) }]);
      }
    }
  }

  // 4. faixa da intervenção: a área dela é o que dá os hectares
  for (const iv of caso.intervencoes) {
    if (iv.trechos.length === 0) continue;
    const faixa = G.uniao(iv.trechos.map((t) => G.engrossa(G.linha(t.pts), FAIXA[t.tipo] / 2, SEGMENTOS, 'reta')));
    const polis = G.poligonos(faixa).map((aneis): Geometria => ({ t: 'poligono', aneis }));
    if (polis.length === 0) continue;
    const parte = unico(`REDE EM ${nomesDasAreas.get(iv)} - POLÍGONO`);
    camada(parte, 'poligono', [{ name: parte, geometria: polis }]);
  }

  return [...saida, ...extras];
}

/**
 * As duas camadas `<OS> UNIFICADO`.
 * - `kml`: tudo, cada geometria no tipo dela (o campo `tipo` não vale para ela, o KML aceita misturar).
 * - `shp`: só linhas, como nos kits aprovados: o polígono entra pelo contorno e o ponto fica de fora.
 */
export function unificar(os: string, cs: CamadaKit[]): { kml: CamadaKit; shp: CamadaKit } {
  const nome = `${os} UNIFICADO`;
  const kml: CamadaKit = { nome, tipo: 'linha', feicoes: cs.flatMap((c) => c.feicoes) };
  const feicoes: CamadaKit['feicoes'] = [];
  for (const c of cs) {
    for (const f of c.feicoes) {
      const geometria: Geometria[] = f.geometria.flatMap((g): Geometria[] => {
        if (g.t === 'linha') return [g];
        if (g.t === 'ponto') return [];
        return G.linhas(G.contorno(G.poligono(g.aneis))).map((pts): Geometria => ({ t: 'linha', pts }));
      });
      if (geometria.length) feicoes.push({ name: f.name, geometria });
    }
  }
  return { kml, shp: { nome, tipo: 'linha', feicoes } };
}
