// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { criarEstado, type Estado } from '../src/tela/estado.ts';
import { criarPainel, nomeDoVao, totaisDaRede } from '../src/tela/painel.ts';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas.ts';
import type { Poste, Pt, Vao } from '../src/nucleo/tipos.ts';

const retangulo = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const municipio: AreaProtegida = {
  id: 1, nome: 'Cidade Teste', pasta: ['Municípios_CE'], atributos: {},
  poligonos: [[retangulo(495000, 9495000, 505000, 9505000)]], linhas: [], caixa: [495000, 9495000, 505000, 9505000],
};
const base = (revisao: string): BaseAreas => ({ revisao, data: '12/11/2024', areas: [], municipios: [municipio] });

type Par = [number, string | number];
const texto = (pares: Par[]) => pares.map(([c, v]) => `${String(c).padStart(3)}\n${v}`).join('\n') + '\n';
const DXF = new TextEncoder().encode(texto([
  [0, 'SECTION'], [2, 'HEADER'], [9, '$ACADVER'], [1, 'AC1027'], [0, 'ENDSEC'], [0, 'SECTION'], [2, 'ENTITIES'],
  [0, 'LINE'], [8, 'LINHAMT'], [10, 500010], [20, 9500050], [11, 500050], [21, 9500050],
  [0, 'TEXT'], [8, 'ETIQ'], [10, 500030], [20, 9500052], [1, '(1)2AN00438'],
  [0, 'ENDSEC'], [0, 'EOF'],
]));

let raiz: HTMLElement;
let estado: Estado;
const passo = (n: number) => raiz.querySelectorAll('details.passo')[n - 1] as HTMLDetailsElement;
const comKmz = async (revisao = '37') => {
  estado = criarEstado({ lerAreas: async () => base(revisao) });
  criarPainel(raiz, estado);
  await estado.carregarKmz(new Uint8Array([1]), 'Areas.kmz');
};

beforeEach(() => {
  document.body.innerHTML = '<div id="passos"></div>';
  raiz = document.getElementById('passos')!;
});

describe('painel', () => {
  it('no começo só o passo 1 está aberto e os passos 2, 3 e 5 estão travados', () => {
    estado = criarEstado();
    criarPainel(raiz, estado);
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => passo(n).hasAttribute('open'))).toEqual([true, false, false, false, false, false, false]);
    expect(passo(2).classList.contains('bloqueado')).toBe(true);
  });

  it('com o KMZ lido, o passo 1 vira uma linha de resumo e o passo 2 abre', async () => {
    await comKmz();
    expect(passo(1).hasAttribute('open')).toBe(false);
    expect(passo(1).querySelector('summary small')!.textContent).toBe('Rev. 37 · 12/11/2024 · 0 áreas');
    expect(passo(2).hasAttribute('open')).toBe(true);
  });

  it('clicar no resumo reabre o passo, e clicar de novo fecha', async () => {
    await comKmz();
    passo(1).querySelector('summary')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(passo(1).hasAttribute('open')).toBe(true);
    expect(passo(2).hasAttribute('open')).toBe(true);
    passo(1).querySelector('summary')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(passo(1).hasAttribute('open')).toBe(false);
  });

  it('KMZ sem revisão no nome: aviso amarelo no passo 1', async () => {
    await comKmz('?');
    passo(1).querySelector('summary')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(passo(1).textContent).toContain('Revisão não identificada no nome do arquivo; confira se é a mais nova.');
    expect(passo(1).querySelector('.amarelo-txt')).not.toBeNull();
  });

  it('OS errada mostra o texto do desenho no passo 2', async () => {
    await comKmz();
    await estado.carregarProjeto(DXF, 'obra.dxf', '12');
    expect(passo(2).querySelector('.erro')!.textContent).toBe('A OS tem 10 dígitos, com os zeros da frente.');
  });

  it('projeto lido: passo 3 aberto com a tabela, e clicar no tipo troca a marca', async () => {
    await comKmz();
    await estado.carregarProjeto(DXF, 'obra.dxf', '0000000001');
    expect(passo(2).querySelector('summary small')!.textContent).toBe('OS 0000000001 · obra.dxf');
    expect(passo(3).hasAttribute('open')).toBe(true);
    const botao = () => passo(3).querySelector<HTMLButtonElement>('button.ciclo[data-vao="v1"]')!;
    expect(botao().textContent).toBe('MT');
    botao().click();
    expect(botao().textContent).toBe('BT');
  });

  it('o passo 5 só abre sem bloqueio', async () => {
    await comKmz();
    // desenho em coordenada de folha: FORA_UTM
    const longe = new TextEncoder().encode(texto([
      [0, 'SECTION'], [2, 'ENTITIES'], [0, 'LINE'], [8, 'LINHAMT'], [10, 0], [20, 0], [11, 40], [21, 0],
      [0, 'TEXT'], [8, 'ETIQ'], [10, 20], [20, 2], [1, '(1)2AN00438'], [0, 'ENDSEC'], [0, 'EOF'],
    ]));
    await estado.carregarProjeto(longe, 'obra.dxf', '0000000001');
    expect(estado.ler().bloqueio?.codigo).toBe('FORA_UTM');
    expect(passo(5).classList.contains('bloqueado')).toBe(true);
    passo(5).querySelector('summary')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(passo(5).hasAttribute('open')).toBe(false);
    expect(passo(3).textContent).toContain('FORA_UTM');

    await estado.carregarProjeto(DXF, 'obra.dxf', '0000000001');
    expect(passo(5).classList.contains('bloqueado')).toBe(false);
    passo(5).querySelector('summary')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(passo(5).hasAttribute('open')).toBe(true);
  });
});

describe('painel: contas', () => {
  const vao = (id: string, tipo: Vao['tipo'], situacao: Vao['situacao'], pts: Pt[]): Vao => ({ id, pts, camada: 'C', tipo, situacao, motivo: '' });
  const poste = (id: string, ponto: Pt, numero: string | null): Poste => ({ id, ponto, numero, novo: true, coordEscrita: null, etiqueta: null });

  it('totais: só vão novo conta; vão novo sem tipo é contado à parte', () => {
    const t = totaisDaRede([
      vao('a', 'MT', 'novo', [[0, 0], [30, 0]]),
      vao('b', 'BT', 'novo', [[0, 0], [0, 10]]),
      vao('c', 'MT', 'existente', [[0, 0], [99, 0]]),
      vao('d', null, 'novo', [[0, 0], [50, 0]]),
    ]);
    expect(t).toEqual({ MT: 30, BT: 10, CONJ: 0, semTipo: 1 });
  });

  it('nome do vão pelos números dos postes das pontas, senão o id', () => {
    const v = vao('v7', 'MT', 'novo', [[0, 0], [100, 0]]);
    expect(nomeDoVao(v, [poste('p1', [1, 1], '12'), poste('p2', [100, 2], '13')])).toBe('P-12 a P-13');
    expect(nomeDoVao(v, [poste('p1', [1, 1], '12')])).toBe('v7');
  });
});
