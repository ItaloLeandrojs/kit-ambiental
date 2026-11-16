// APP proposta em volta da água (desenho §6.3 e §8): sempre editável e confirmada pelo projetista
import type { Pt } from './tipos.ts';
import { ehAgua, type AreaProtegida, type BaseAreas } from './areas.ts';
import type { AreaConfirmada } from './caso.ts';
import { redeNova } from './rede.ts';
import type { Rede } from './tipos.ts';
import { G, type Geo } from './geom.ts';
import { LARGURA_APP, RAIO_PROXIMA } from '../regras/faixas.ts';

type Caixa = [number, number, number, number];

// `caixa` guarda o recorte (rede + 500 m), para refazerApp refazer igual sem receber a rede; `poligonos` são todas as partes da APP;
// `semDesenho`: o JSTS não conseguiu desenhar a margem (água com desenho quebrado no KMZ)
export interface AppProposta { agua: AreaProtegida; largura: number; poligonos: Pt[][][]; porque: string; caixa: Caixa; semDesenho?: true }

export const ERRO_APP_SEM_DESENHO =
  'O site não conseguiu desenhar esta APP: o desenho da água no KMZ tem defeito. Confira em campo; se for APP, desenhe a margem à mão no Google Earth e avise o responsável pelo site.';

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

// polígonos da APP: água em polígono = buffer menos a água; rio em linha = buffer; tudo recortado à caixa.
// Se o JSTS lança (água com desenho quebrado), devolve null: quem chama marca a proposta como sem desenho.
function geometriaApp(agua: AreaProtegida, largura: number, caixa: Caixa): Pt[][][] | null {
  try {
    // só o pedaço da água a até `largura` do recorte importa: engrossar o açude inteiro custa segundos
    // (dentro do recorte o resultado é o mesmo: todo ponto a menos de `largura` dele vem desse pedaço)
    const folga = largura + 1;
    const g = G.intersecao(geoDaAgua(agua), G.caixa(caixa[0] - folga, caixa[1] - folga, caixa[2] + folga, caixa[3] + folga));
    const grosso = G.engrossa(g, largura);
    const faixa = agua.poligonos.length ? G.diferenca(grosso, g) : grosso;
    return G.poligonos(G.intersecao(faixa, G.caixa(...caixa)));
  } catch {
    return null;
  }
}

function comDesenho(p: Omit<AppProposta, 'poligonos' | 'semDesenho'>, poligonos: Pt[][][] | null): AppProposta {
  return poligonos ? { ...p, poligonos } : { ...p, poligonos: [], semDesenho: true };
}

// Uma proposta por água, com TODAS as partes da APP (o recorte à caixa pode partir a faixa de um rio em várias).
// Propõe para toda água a até RAIO_PROXIMA da rede nova, com a largura padrão; o projetista alarga se precisar.
export function proporApps(rede: Rede, base: BaseAreas): AppProposta[] {
  const alvos = geosDaRede(rede);
  if (alvos.length === 0) return [];
  const caixa = caixaDaRede(rede);
  const out: AppProposta[] = [];
  for (const agua of base.areas) {
    const tipo = ehAgua(agua);
    if (tipo === null || agua.defeito) continue; // água com defeito: o caso já dá o vermelho "não pôde ser conferida"
    // caixa da água longe da caixa da rede + 100 m: não há como ficar a 100 m (pula a conta pesada)
    const d = MARGEM_CAIXA - RAIO_PROXIMA;
    if (agua.caixa[0] > caixa[2] - d || agua.caixa[2] < caixa[0] + d || agua.caixa[1] > caixa[3] - d || agua.caixa[3] < caixa[1] + d) continue;
    const largura = LARGURA_APP[tipo];
    let perto: boolean;
    try {
      const g = geoDaAgua(agua);
      perto = Math.min(...alvos.map((r) => G.distancia(r, g))) <= RAIO_PROXIMA;
    } catch {
      perto = true; // nem a distância deu: a caixa já está a 100 m da rede; propõe, para não sumir em silêncio
    }
    if (!perto) continue;
    out.push(comDesenho({ agua, largura, porque: PORQUE[tipo], caixa }, geometriaApp(agua, largura, caixa)));
  }
  return out;
}

// refaz todas as partes com outra largura
export function refazerApp(p: AppProposta, largura: number): AppProposta {
  const { semDesenho: _antes, poligonos: _velhos, ...resto } = p;
  return comDesenho({ ...resto, largura }, geometriaApp(p.agua, largura, p.caixa));
}

// APP sem área não pode ser aceita: apagaria o aviso sem proteger nada
export function confirmarApp(p: AppProposta): AreaConfirmada {
  if (p.semDesenho) throw new Error(ERRO_APP_SEM_DESENHO);
  if (!p.poligonos.some((aneis) => G.area(G.poligono(aneis)) > 0)) {
    throw new Error('A APP ficou vazia. Aumente a largura e tente de novo.');
  }
  return { nome: `APP ${p.agua.nome}`, tipo: 'APP', poligonos: p.poligonos, largura: p.largura, aguaId: p.agua.id };
}
