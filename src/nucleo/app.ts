// APP proposta em volta da água (desenho §6.3 e §8): sempre editável e confirmada pelo projetista
import type { Pt } from './tipos.ts';
import { ehAgua, type AreaProtegida, type BaseAreas } from './areas.ts';
import type { AreaConfirmada } from './caso.ts';
import { redeNova } from './rede.ts';
import type { Rede } from './tipos.ts';
import { G, type Geo } from './geom.ts';
import { LARGURA_APP } from '../regras/faixas.ts';

type Caixa = [number, number, number, number];

// `caixa` (fora do contrato do plano) guarda o recorte da rede + 500 m, para refazerApp refazer igual sem receber a rede
export interface AppProposta { agua: AreaProtegida; largura: number; poligono: Pt[][]; porque: string; caixa?: Caixa }

const MARGEM_CAIXA = 500; // metros em volta da rede nova: não gera a margem de um rio de 300 km

const PORQUE = {
  acude:
    'Açude (reservatório artificial): o Código Florestal (Lei 12.651, art. 4º) pede 100 m de APP em volta, como nos kits aprovados; ' +
    'a licença do açude pode dizer outra largura. Confirme a largura.',
  lagoa:
    'Lagoa natural: o Código Florestal (Lei 12.651, art. 4º) pede 100 m de APP na zona rural; ' +
    'na zona urbana é 30 m; até 20 ha na zona rural, 50 m. Confirme a largura.',
  rio:
    'Rio: o Código Florestal (Lei 12.651, art. 4º) pede 30 m de APP de cada lado se ele tiver menos de 10 m de largura, ' +
    '50 m de 10 a 50 m e 100 m de 50 a 200 m. O KMZ não traz a largura do rio. Confirme a largura.',
};

const geoDaAgua = (a: AreaProtegida): Geo =>
  G.uniao([
    ...a.poligonos.filter((an) => an.length > 0 && an[0].length >= 4).map((an) => G.poligono(an)),
    ...a.linhas.filter((l) => l.length >= 2).map((l) => G.linha(l)),
  ]);

function geosDaRede(rede: Rede): Geo[] {
  return [...redeNova(rede).map((v) => G.linha(v.pts)), ...rede.postes.filter((p) => p.novo).map((p) => G.ponto(p.ponto))];
}

function caixaDaRede(rede: Rede): Caixa {
  const c: Caixa = [Infinity, Infinity, -Infinity, -Infinity];
  const pts: Pt[] = [...redeNova(rede).flatMap((v) => v.pts), ...rede.postes.filter((p) => p.novo).map((p) => p.ponto)];
  for (const p of pts) {
    c[0] = Math.min(c[0], p[0]); c[1] = Math.min(c[1], p[1]);
    c[2] = Math.max(c[2], p[0]); c[3] = Math.max(c[3], p[1]);
  }
  return [c[0] - MARGEM_CAIXA, c[1] - MARGEM_CAIXA, c[2] + MARGEM_CAIXA, c[3] + MARGEM_CAIXA];
}

// polígonos da APP: água em polígono = buffer menos a água; rio em linha = buffer; tudo recortado à caixa
function geometriaApp(agua: AreaProtegida, largura: number, caixa: Caixa | undefined): Pt[][][] {
  const g = geoDaAgua(agua);
  const grosso = G.engrossa(g, largura);
  const faixa = agua.poligonos.length ? G.diferenca(grosso, g) : grosso;
  return G.poligonos(caixa ? G.intersecao(faixa, G.caixa(...caixa)) : faixa);
}

const areaDe = (aneis: Pt[][]): number => G.area(G.poligono(aneis));
const porqueDe = (tipo: 'acude' | 'lagoa' | 'rio'): string => PORQUE[tipo];

// Um polígono por proposta. Se o recorte à caixa separar a APP em partes (rio que sai e volta, por exemplo),
// sai uma proposta para cada parte: nenhuma parte é jogada fora.
export function proporApps(rede: Rede, base: BaseAreas): AppProposta[] {
  const alvos = geosDaRede(rede);
  if (redeNova(rede).length === 0 && alvos.length === 0) return [];
  const caixa = caixaDaRede(rede);
  const out: AppProposta[] = [];
  for (const agua of base.areas) {
    const tipo = ehAgua(agua);
    if (tipo === null) continue;
    const largura = LARGURA_APP[tipo];
    const g = geoDaAgua(agua);
    if (Math.min(Infinity, ...alvos.map((r) => G.distancia(r, g))) > largura) continue;
    for (const poligono of geometriaApp(agua, largura, caixa)) {
      out.push({ agua, largura, poligono, porque: porqueDe(tipo), caixa });
    }
  }
  return out;
}

// refaz com outra largura; se a APP tinha várias partes, devolve a que mais se sobrepõe à anterior
export function refazerApp(p: AppProposta, largura: number): AppProposta {
  const tipo = ehAgua(p.agua);
  const partes = geometriaApp(p.agua, largura, p.caixa);
  const antiga = G.poligono(p.poligono);
  let melhor: Pt[][] = [];
  let pontos = -1;
  for (const parte of partes) {
    const s = G.area(G.intersecao(antiga, G.poligono(parte)));
    if (s > pontos || (s === pontos && areaDe(parte) > areaDe(melhor))) { melhor = parte; pontos = s; }
  }
  return { ...p, largura, poligono: melhor, porque: tipo ? porqueDe(tipo) : p.porque };
}

export const confirmarApp = (p: AppProposta): AreaConfirmada => ({
  nome: `APP ${p.agua.nome}`, tipo: 'APP', poligono: p.poligono, largura: p.largura, aguaId: p.agua.id,
});
