// @vitest-environment happy-dom
// Quando a conta do caso lança (ex.: polígono quebrado do KMZ no JSTS), a tela não pode ficar com o caso velho.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas.ts';
import type { Pt } from '../src/nucleo/tipos.ts';
import { criarEstado, ERRO_APP_PENDENTE, ERRO_CALCULO } from '../src/tela/estado.ts';
import { ERRO_APP_SEM_DESENHO } from '../src/nucleo/app.ts';
import { criarPainel } from '../src/tela/painel.ts';

const ERRO_INGLES = 'TopologyException: found non-noded intersection between LINESTRING';
const falhas = vi.hoisted(() => ({ caso: false, faixa: false }));
vi.mock('../src/nucleo/caso.ts', async (original) => {
  const m = await original<typeof import('../src/nucleo/caso.ts')>();
  return { ...m, calcularCaso: (...a: Parameters<typeof m.calcularCaso>) => { if (falhas.caso) throw new Error(ERRO_INGLES); return m.calcularCaso(...a); } };
});
vi.mock('../src/nucleo/faixa.ts', async (original) => {
  const m = await original<typeof import('../src/nucleo/faixa.ts')>();
  return { ...m, avisosFaixa: (...a: Parameters<typeof m.avisosFaixa>) => { if (falhas.faixa) throw new Error(ERRO_INGLES); return m.avisosFaixa(...a); } };
});


// tudo inventado, perto de (500000, 9500000)
const ret = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const area = (id: number, nome: string, pasta: string[], x0: number, y0: number, x1: number, y1: number): AreaProtegida => ({
  id, nome, pasta, atributos: {}, poligonos: [[ret(x0, y0, x1, y1)]], linhas: [], caixa: [x0, y0, x1, y1],
});
const BASE: BaseAreas = {
  revisao: '1', data: '01/01/2024',
  areas: [area(1, 'UC Inventada', ['Unidade de Conservação Estadual', 'Uso Sustentável'], 500000, 9500000, 500200, 9500100)],
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

let raiz: HTMLElement;
const passo = (n: number) => raiz.querySelectorAll('details.passo')[n - 1] as HTMLDetailsElement;
const botao = (rotulo: string): HTMLButtonElement => [...raiz.querySelectorAll('button')].find((b) => b.textContent === rotulo) as HTMLButtonElement;

async function noCaso() {
  const e = criarEstado({ lerAreas: async () => BASE });
  criarPainel(raiz, e, { salvar: () => {} });
  await e.carregarKmz(new Uint8Array([1]), 'Areas_Rev1.kmz');
  await e.carregarProjeto(DXF, 'obra.dxf', '0000000001');
  botao('Rede confirmada, seguir').click();
  botao('Seguir para o caso').click();
  return e;
}

beforeEach(() => {
  falhas.caso = false;
  falhas.faixa = false;
  document.body.innerHTML = '<div id="passos"></div>';
  raiz = document.getElementById('passos')!;
});

describe('estado: a conta do caso lança', () => {
  it('clique no vão com a conta lançando: sem caso velho, vermelho em português, a tela é avisada', async () => {
    const e = await noCaso();
    expect(e.ler().caso?.intervencoes).toHaveLength(1);
    const ouvinte = vi.fn();
    e.aoMudar(ouvinte);
    falhas.caso = true;
    expect(() => e.marcarVao(e.ler().rede!.vaos[1].id, { situacao: 'existente' })).not.toThrow();
    const r = e.ler();
    expect(ouvinte).toHaveBeenCalled();
    expect(r.caso).toBeNull();
    expect(r.bloqueio?.nivel).toBe('vermelho');
    expect(r.bloqueio?.codigo).toBe('CALCULO_FALHOU');
    expect(r.bloqueio?.texto).toBe(ERRO_CALCULO);
    expect(JSON.stringify(r.bloqueio)).not.toMatch(/Exception|non-noded/);
    // a tela: nada do caso velho nem do resumo; o vermelho no passo 3, sem inglês
    expect(raiz.querySelector('.resumo-txt')).toBeNull();
    expect(passo(5).hasAttribute('open')).toBe(false);
    expect(passo(3).querySelector('.aviso.vermelho')!.textContent).toContain(ERRO_CALCULO);
    expect(raiz.textContent).not.toMatch(/Exception|non-noded/);
    expect(() => e.baixarPacote()).toThrow();
    // a conta volta: o caso volta
    falhas.caso = false;
    e.marcarVao(e.ler().rede!.vaos[1].id, { situacao: 'novo', tipo: 'MT' });
    expect(e.ler().bloqueio).toBeNull();
    expect(e.ler().caso?.intervencoes).toHaveLength(1);
  });

  it('ao abrir o projeto: o vermelho em português no passo 3, sem o erro em inglês no passo 2', async () => {
    falhas.caso = true;
    const e = criarEstado({ lerAreas: async () => BASE });
    criarPainel(raiz, e, { salvar: () => {} });
    await e.carregarKmz(new Uint8Array([1]), 'Areas_Rev1.kmz');
    await e.carregarProjeto(DXF, 'obra.dxf', '0000000001');
    expect(e.ler().erro).toBeNull();
    expect(e.ler().bloqueio?.texto).toBe(ERRO_CALCULO);
    expect(raiz.textContent).not.toMatch(/Exception|non-noded/);
    expect(passo(3).hasAttribute('open')).toBe(true);
  });

  it('responder a APP com a conta lançando também não deixa o caso velho', async () => {
    const e = await noCaso();
    expect(e.ler().apps).toHaveLength(0);
    falhas.caso = true;
    e.mudarM2Poste('qualquer', 3);
    expect(e.ler().caso).toBeNull();
    expect(e.ler().bloqueio?.codigo).toBe('CALCULO_FALHOU');
  });

  it('a faixa de domínio lançando também vira o vermelho, sem caso', async () => {
    const e = await noCaso();
    falhas.faixa = true;
    e.marcarVao(e.ler().rede!.vaos[1].id, { situacao: 'existente' });
    expect(e.ler().caso).toBeNull();
    expect(e.ler().bloqueio?.codigo).toBe('CALCULO_FALHOU');
    expect(e.ler().avisosFaixa).toEqual([]);
  });
});

describe('estado: APP de água com desenho quebrado', () => {
  // açude com um laço que sai do meio do lado de cima e volta ao mesmo ponto: o JSTS lança ao desenhar a margem
  const x = 500130; // a 20 m do fim da rede
  const laco: Pt[] = [[x, 9500000], [x + 100, 9500000], [x + 100, 9500100], [x + 50, 9500100], [x + 70, 9500050], [x + 30, 9500050], [x + 50, 9500100], [x, 9500100], [x, 9500000]];
  const acude: AreaProtegida = { ...area(3, 'Açude Quebrado', ['Recursos Hídricos - COGERH', 'Açudes Monitorados'], x, 9500000, x + 100, 9500100), poligonos: [[laco]] };

  it('o cartão da APP traz o erro claro, a APP não se confirma e o baixar fica travado até a resposta', async () => {
    const e = criarEstado({ lerAreas: async () => ({ ...BASE, areas: [...BASE.areas, acude] }) });
    await e.carregarKmz(new Uint8Array([1]), 'Areas_Rev1.kmz');
    await e.carregarProjeto(DXF, 'obra.dxf', '0000000001');
    const [app] = e.ler().apps;
    expect(app.proposta.semDesenho).toBe(true);
    expect(app.erro).toBe(ERRO_APP_SEM_DESENHO);
    e.confirmarApp(0, 100);
    expect(e.ler().apps[0].resposta).toBe('pendente');
    expect(e.ler().apps[0].erro).toBe(ERRO_APP_SEM_DESENHO);
    e.refazerApp(0, 50);
    expect(e.ler().apps[0].erro).toBe(ERRO_APP_SEM_DESENHO);
    expect(() => e.baixarPacote()).toThrow(ERRO_APP_PENDENTE);
    e.recusarApp(0);
    expect(() => e.baixarPacote()).not.toThrow();
  });
});
