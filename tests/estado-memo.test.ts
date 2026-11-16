// As contas pesadas (árvore em área, faixa de domínio, APPs propostas) só refazem quando o que elas usam muda.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas.ts';
import type { Pt } from '../src/nucleo/tipos.ts';
import { criarEstado } from '../src/tela/estado.ts';
import { jpegSemExif } from './jpeg-gps.ts';

const contas = vi.hoisted(() => ({ emArea: 0, faixa: 0, apps: 0 }));
vi.mock('../src/nucleo/arvores.ts', async (original) => {
  const m = await original<typeof import('../src/nucleo/arvores.ts')>();
  return { ...m, avisosEmArea: (...a: Parameters<typeof m.avisosEmArea>) => { contas.emArea++; return m.avisosEmArea(...a); } };
});
vi.mock('../src/nucleo/faixa.ts', async (original) => {
  const m = await original<typeof import('../src/nucleo/faixa.ts')>();
  return { ...m, avisosFaixa: (...a: Parameters<typeof m.avisosFaixa>) => { contas.faixa++; return m.avisosFaixa(...a); } };
});
vi.mock('../src/nucleo/app.ts', async (original) => {
  const m = await original<typeof import('../src/nucleo/app.ts')>();
  return { ...m, proporApps: (...a: Parameters<typeof m.proporApps>) => { contas.apps++; return m.proporApps(...a); } };
});

// tudo inventado, perto de (500000, 9500000)
const ret = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const area = (id: number, nome: string, pasta: string[], x0: number, y0: number, x1: number, y1: number): AreaProtegida => ({
  id, nome, pasta, atributos: {}, poligonos: [[ret(x0, y0, x1, y1)]], linhas: [], caixa: [x0, y0, x1, y1],
});
const BASE: BaseAreas = {
  revisao: '1', data: '01/01/2024',
  areas: [
    area(1, 'UC Inventada', ['Unidade de Conservação Estadual', 'Uso Sustentável'], 500000, 9500000, 500200, 9500100),
    area(3, 'Acude Inventado', ['Recursos Hídricos - COGERH', 'Açudes Monitorados'], 500170, 9500000, 500270, 9500100),
  ],
  municipios: [area(2, 'Cidade Teste', ['Municípios_CE'], 495000, 9495000, 505000, 9505000)],
};
type Par = [number, string | number];
const texto = (pares: Par[]) => pares.map(([c, v]) => `${String(c).padStart(3)}\n${v}`).join('\n') + '\n';
const lado = (a: Pt, b: Pt): Par[] => [[0, 'LINE'], [8, 'LINHAMT'], [10, a[0]], [20, a[1]], [11, b[0]], [21, b[1]]];
const etiqueta = (p: Pt): Par[] => [[0, 'TEXT'], [8, 'ETIQ'], [10, p[0]], [20, p[1] + 2], [1, '(1)2AN00438']];
const DXF = new TextEncoder().encode(texto([
  [0, 'SECTION'], [2, 'HEADER'], [9, '$ACADVER'], [1, 'AC1027'], [0, 'ENDSEC'], [0, 'SECTION'], [2, 'ENTITIES'],
  ...lado([500010, 9500050], [500050, 9500050]), ...etiqueta([500030, 9500050]),
  ...lado([500050, 9500050], [500110, 9500050]), ...etiqueta([500080, 9500050]),
  [0, 'ENDSEC'], [0, 'EOF'],
]));

async function comArvore() {
  const e = criarEstado({ lerAreas: async () => BASE });
  await e.carregarKmz(new Uint8Array([1]), 'Areas_Rev1.kmz');
  await e.carregarProjeto(DXF, 'obra.dxf', '0000000001');
  const [id] = e.adicionarFotos([{ nome: 'a.jpg', bytes: jpegSemExif() }]);
  e.colocarArvore(id);
  e.clicarNoMapa([500040, 9500045]);
  e.ler();
  return { e, id };
}

beforeEach(() => { contas.emArea = 0; contas.faixa = 0; contas.apps = 0; });

describe('estado: contas guardadas pela entrada', () => {
  it('digitar a espécie e trocar o tipo do vão não refazem a árvore em área', async () => {
    const { e, id } = await comArvore();
    expect(e.ler().avisosEmArea.map((a) => a.codigo)).toEqual(['ARVORE_EM_AREA']);
    const antes = contas.emArea;
    e.mudarArvore(id, { especie: 'Ipê' });
    e.mudarArvore(id, { especie: 'Ipê roxo' });
    e.marcarVao(e.ler().rede!.vaos[0].id, { tipo: 'BT' });
    expect(contas.emArea).toBe(antes);
    expect(e.ler().avisosEmArea.map((a) => a.codigo)).toEqual(['ARVORE_EM_AREA']);
  });

  it('mover a árvore, trocar a intervenção ou confirmar uma APP refazem a árvore em área', async () => {
    const { e, id } = await comArvore();
    let antes = contas.emArea;
    e.colocarArvore(id);
    e.clicarNoMapa([500500, 9500500]); // fora da UC
    expect(contas.emArea).toBe(antes + 1);
    expect(e.ler().avisosEmArea).toEqual([]);
    antes = contas.emArea;
    e.mudarArvore(id, { intervencao: 'supressao' });
    expect(contas.emArea).toBe(antes + 1);
    antes = contas.emArea;
    e.confirmarApp(0, 100);
    expect(contas.emArea).toBe(antes + 1);
  });

  it('trocar o tipo do vão (sem mudar o desenho da rede nova) não refaz a faixa nem as APPs propostas', async () => {
    const { e } = await comArvore();
    const [faixa, apps] = [contas.faixa, contas.apps];
    const v = e.ler().rede!.vaos[0].id;
    e.marcarVao(v, { tipo: 'BT' });
    e.marcarVao(v, { tipo: 'CONJ' });
    e.liberarEtiqueta(false);
    expect([contas.faixa, contas.apps]).toEqual([faixa, apps]);
    expect(e.ler().apps).toHaveLength(1);
    // tirar o vão da rede nova muda o desenho: refaz
    e.marcarVao(v, { situacao: 'existente' });
    expect(contas.faixa).toBe(faixa + 1);
    expect(contas.apps).toBe(apps + 1);
  });
});
