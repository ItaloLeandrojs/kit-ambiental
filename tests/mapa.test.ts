// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { AVISO_SEM_ESTRADAS, caixaDaRede, classeDoVao, criarMapa, ligarEstradas } from '../src/tela/mapa.ts';
import type { Aresta } from '../src/nucleo/base.ts';
import type { Retrato } from '../src/tela/estado.ts';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas.ts';
import type { Poste, Pt, Rede, Vao } from '../src/nucleo/tipos.ts';

const vao = (id: string, pts: Pt[], tipo: Vao['tipo'] = 'MT', situacao: Vao['situacao'] = 'novo'): Vao => ({ id, pts, camada: 'C', tipo, situacao, motivo: '' });
const poste = (id: string, ponto: Pt, extra: Partial<Poste> = {}): Poste => ({ id, ponto, numero: null, novo: true, coordEscrita: null, etiqueta: null, ...extra });
const REDE: Rede = {
  origem: 'dxf',
  vaos: [vao('v1', [[500000, 9500000], [500100, 9500000]]), vao('v2', [[500100, 9500000], [500200, 9500050]], 'BT')],
  postes: [poste('p1', [500000, 9500000]), poste('p2', [500100, 9500000], { aConfirmar: true })],
};
const area = (id: number, nome: string, pasta: string[], x0: number, y0: number, x1: number, y1: number): AreaProtegida => ({
  id, nome, pasta, atributos: {}, poligonos: [[[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]], linhas: [], caixa: [x0, y0, x1, y1],
});
const BASE: BaseAreas = {
  revisao: '1', data: '', municipios: [],
  areas: [
    area(1, 'Perto', ['Unidade de Conservação Estadual'], 500050, 9499950, 500300, 9500200),
    area(2, 'Longe', ['Unidade de Conservação Estadual'], 520000, 9520000, 521000, 9521000),
    area(3, 'Açude', ['Recursos Hídricos - COGERH', 'Açudes Monitorados'], 499900, 9499900, 500000, 9499990),
  ],
};

let raiz: HTMLElement;
let chamadas: string[];
const montar = () => {
  const mapa = criarMapa(raiz, { marcarVao: (id) => { chamadas.push(id); } });
  mapa.atualizar({ base: BASE, rede: REDE });
  return mapa;
};

beforeEach(() => {
  document.body.innerHTML = '<div id="palco"></div>';
  raiz = document.getElementById('palco')!;
  chamadas = [];
});

describe('mapa', () => {
  it('clicar num polyline data-vao chama marcarVao com o id do vão', () => {
    const m = montar();
    m.elemento.querySelector<SVGElement>('polyline[data-vao="v1"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    m.elemento.querySelector<SVGElement>('polyline[data-vao="v2"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(chamadas).toEqual(['v1', 'v2']);
  });

  it('clicar fora de um vão não chama nada', () => {
    const m = montar();
    m.elemento.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    m.elemento.querySelector<SVGElement>('path.poste')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(chamadas).toEqual([]);
  });

  it('arrastar o mapa não conta como clique', () => {
    const m = montar();
    const toque = m.elemento.querySelector<SVGElement>('polyline[data-vao="v1"]')!;
    toque.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, clientY: 40 }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 60, clientY: 40 }));
    toque.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(chamadas).toEqual([]);
    toque.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(chamadas).toEqual(['v1']);
  });

  it('desenha os vãos com a classe do tipo e da situação, e o vão sem tipo destacado', () => {
    expect(classeDoVao(vao('a', [], 'MT'))).toBe('vao mt');
    expect(classeDoVao(vao('a', [], 'BT'))).toBe('vao bt');
    expect(classeDoVao(vao('a', [], 'CONJ'))).toBe('vao conj');
    expect(classeDoVao(vao('a', [], 'MT', 'existente'))).toBe('vao fora');
    expect(classeDoVao(vao('a', [], null))).toBe('vao sem-tipo');
    const m = criarMapa(raiz, { marcarVao: () => {} });
    m.atualizar({ base: BASE, rede: { ...REDE, vaos: [vao('v1', [[500000, 9500000], [500100, 9500000]], null)] } });
    expect(m.elemento.querySelectorAll('polyline.vao.sem-tipo')).toHaveLength(1);
  });

  it('o y vai invertido: norte em cima', () => {
    const m = montar();
    const pts = m.elemento.querySelector('polyline[data-vao="v2"]')!.getAttribute('points')!;
    expect(pts).toBe('500100.00,-9500000.00 500200.00,-9500050.00');
  });

  it('postes: o novo, o a confirmar e o existente têm classes diferentes', () => {
    const m = criarMapa(raiz, { marcarVao: () => {} });
    m.atualizar({ base: BASE, rede: { ...REDE, postes: [poste('a', [1, 1]), poste('b', [2, 2], { aConfirmar: true }), poste('c', [3, 3], { novo: false })] } });
    expect([...m.elemento.querySelectorAll('.postes path')].map((p) => p.getAttribute('class'))).toEqual(['poste novo', 'poste a-confirmar', 'poste']);
  });

  it('mostra só as áreas a até 1 km da rede, e a água com classe própria', () => {
    const m = montar();
    const areas = [...m.elemento.querySelectorAll('.areas path')];
    expect(areas.map((a) => a.querySelector('title')!.textContent)).toEqual(['Perto', 'Açude']);
    expect(areas.map((a) => a.getAttribute('class'))).toEqual(['area', 'area agua']);
  });

  it('desenha as estradas da base', () => {
    const m = montar();
    m.definirEstradas([{ id: 1, a: 1, b: 2, ref: 'CE-001', classe: 'primary', m: 10, pts: [[500000, 9499000], [500500, 9499000]] }]);
    expect(m.elemento.querySelectorAll('.estradas polyline.estrada.primary')).toHaveLength(1);
  });

  it('sem rede, o mapa fica vazio', () => {
    const m = montar();
    m.atualizar({ base: BASE, rede: null });
    expect(m.elemento.querySelectorAll('.vaos *, .postes *, .areas *')).toHaveLength(0);
  });

  it('a roda do mouse muda o zoom e ajustar volta ao enquadramento da rede', () => {
    const m = montar();
    const largura = () => Number(m.elemento.getAttribute('viewBox')!.split(' ')[2]);
    const inicial = largura();
    m.elemento.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, bubbles: true, cancelable: true }));
    expect(largura()).toBeLessThan(inicial);
    m.ajustar();
    expect(largura()).toBeCloseTo(inicial, 6);
  });

  it('reenquadra só quando a obra muda, não ao marcar um vão', () => {
    const m = montar();
    m.elemento.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, bubbles: true, cancelable: true }));
    const mexido = m.elemento.getAttribute('viewBox');
    m.atualizar({ base: BASE, rede: { ...REDE, vaos: [{ ...REDE.vaos[0], tipo: 'BT' }, REDE.vaos[1]] } });
    expect(m.elemento.getAttribute('viewBox')).toBe(mexido);
  });

  it('poste existente a 400 km não muda a caixa nem traz área distante', () => {
    const longe: Rede = { ...REDE, postes: [...REDE.postes, poste('x', [100000, 9100000], { novo: false })] };
    expect(caixaDaRede(longe)).toEqual(caixaDaRede(REDE));
    const m = criarMapa(raiz, { marcarVao: () => {} });
    const base: BaseAreas = { ...BASE, areas: [...BASE.areas, area(9, 'Perto do poste solto', ['Unidade de Conservação Estadual'], 99900, 9099900, 100100, 9100100)] };
    m.atualizar({ base, rede: longe });
    const nomes = [...m.elemento.querySelectorAll('.areas path title')].map((t) => t.textContent);
    expect(nomes).not.toContain('Perto do poste solto');
    expect(Number(m.elemento.getAttribute('viewBox')!.split(' ')[2])).toBeLessThan(2000);
  });

  it('sem vão, só o poste novo enquadra', () => {
    const r: Rede = { origem: 'dxf', vaos: [], postes: [poste('a', [500000, 9500000]), poste('b', [100000, 9100000], { novo: false })] };
    expect(caixaDaRede(r)).toEqual([500000, 9500000, 500000, 9500000]);
  });

  describe('árvores e limpeza de faixa', () => {
    const arvores = [
      { id: 'a1', foto: 'a.jpg', ponto: [500020, 9500010] as Pt, especie: 'Mulungu', intervencao: 'poda' as const },
      { id: 'a2', foto: 'b.jpg', ponto: null, especie: '', intervencao: 'poda' as const },
      { id: 'a3', foto: 'c.jpg', ponto: [500030, 9500010] as Pt, especie: '', intervencao: 'supressao' as const },
    ];

    it('desenha só as árvores com ponto, a limpeza fechada e a que está sendo desenhada', () => {
      const m = criarMapa(raiz, { marcarVao: () => {} });
      m.atualizar({ base: BASE, rede: REDE, arvores, limpeza: [[[0, 0], [10, 0], [10, 10]]], modoMapa: { t: 'limpeza', pts: [[1, 1], [2, 2]] } });
      expect(m.elemento.querySelectorAll('path.arvore-ponto.poda, path.arvore-ponto.supressao')).toHaveLength(2);
      expect(m.elemento.querySelectorAll('polygon.limpeza')).toHaveLength(1);
      expect(m.elemento.querySelectorAll('polyline.limpeza.rascunho')).toHaveLength(1);
    });

    it('com um modo ativo, o clique vai para clicarNoMapa e não troca a marca do vão', () => {
      const cliques: Pt[] = [];
      const m = criarMapa(raiz, { marcarVao: (id) => { chamadas.push(id); }, clicarNoMapa: (p) => { cliques.push(p); } });
      m.atualizar({ base: BASE, rede: REDE, arvores: [], limpeza: [], modoMapa: { t: 'arvore', id: 'a2' } });
      expect(m.elemento.classList.contains('clicando')).toBe(true);
      m.elemento.querySelector<SVGElement>('polyline[data-vao="v1"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      expect(cliques).toHaveLength(1);
      expect(chamadas).toEqual([]);
      // o segundo clique de um duplo clique não vira vértice
      m.elemento.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
      expect(cliques).toHaveLength(1);
    });

    it('duplo clique fecha a limpeza só com modo ativo', () => {
      let fechou = 0;
      const m = criarMapa(raiz, { marcarVao: () => {}, fecharLimpeza: () => { fechou++; } });
      m.atualizar({ base: BASE, rede: REDE, arvores: [], limpeza: [], modoMapa: null });
      m.elemento.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(fechou).toBe(0);
      m.atualizar({ base: BASE, rede: REDE, arvores: [], limpeza: [], modoMapa: { t: 'limpeza', pts: [] } });
      m.elemento.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(fechou).toBe(1);
    });
  });
});

describe('UC do cliente no mapa (Parte 2)', () => {
  it('desenha a UC com a classe uc e os outros blocos de UC com a classe uc-cand', () => {
    const m = criarMapa(raiz, { marcarVao: () => {} });
    m.atualizar({ base: BASE, rede: REDE, uc: [500060, 9500080], candidatosUc: [[500060, 9500080], [500150, 9500120]] });
    const ucs = m.elemento.querySelectorAll('.ucs path.uc');
    expect(ucs).toHaveLength(1);
    expect(ucs[0].querySelector('title')!.textContent).toContain('UC do cliente');
    // o bloco que já é a UC não aparece duas vezes como candidato
    expect(m.elemento.querySelectorAll('.ucs .uc-cand')).toHaveLength(1);
    m.atualizar({ base: BASE, rede: REDE, uc: null, candidatosUc: [] });
    expect(m.elemento.querySelectorAll('.ucs *')).toHaveLength(0);
  });

  it('marcando a UC, o mapa entra no modo de clique e o clique vai para clicarNoMapa', () => {
    const cliques: Pt[] = [];
    const m = criarMapa(raiz, { marcarVao: (id) => { chamadas.push(id); }, clicarNoMapa: (p) => { cliques.push(p); } });
    m.atualizar({ base: BASE, rede: REDE, marcandoUc: true });
    expect(m.elemento.classList.contains('clicando')).toBe(true);
    m.elemento.querySelector<SVGElement>('polyline[data-vao="v1"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(cliques).toHaveLength(1);
    expect(chamadas).toEqual([]);
    m.atualizar({ base: BASE, rede: REDE, marcandoUc: false });
    expect(m.elemento.classList.contains('clicando')).toBe(false);
  });
});

describe('estradas do mapa (busca por janela)', () => {
  // estado de mentira: só a rede muda; quem escuta é chamado a cada troca
  function estadoFalso(rede: Rede | null) {
    let r = { base: BASE, rede } as unknown as Retrato;
    const ouvintes: (() => void)[] = [];
    return {
      ler: () => r,
      aoMudar: (f: () => void) => { ouvintes.push(f); return () => {}; },
      trocar(rede: Rede | null) { r = { base: BASE, rede } as unknown as Retrato; ouvintes.forEach((f) => f()); },
    };
  }
  const longe: Rede = { ...REDE, vaos: [vao('v9', [[530000, 9530000], [530100, 9530000]])], postes: [] };
  const aresta = (id: number): Aresta => ({ id, a: 1, b: 2, ref: '', classe: 'primary', m: 1, pts: [[0, 0], [1, 1]] });

  it('a resposta de uma busca velha que chega depois não apaga nem troca as estradas da busca nova', async () => {
    const e = estadoFalso(REDE);
    const definidas: number[][] = [];
    const avisos: (string | null)[] = [];
    const pedidos: { resolver: (a: Aresta[]) => void; falhar: () => void }[] = [];
    ligarEstradas(e, { atualizar: () => {}, definirEstradas: (a) => { definidas.push(a.map((x) => x.id)); } }, (t) => avisos.push(t),
      () => new Promise<Aresta[]>((resolver, falhar) => { pedidos.push({ resolver, falhar: () => falhar(new Error('x')) }); }));
    e.trocar(REDE);
    expect(pedidos).toHaveLength(1);
    e.trocar(longe); // a obra mudou de lugar: busca nova
    expect(pedidos).toHaveLength(2);
    pedidos[1].resolver([aresta(2)]);
    await Promise.resolve();
    pedidos[0].falhar(); // a velha falha depois: não pode apagar as estradas nem avisar
    pedidos[0].resolver([aresta(1)]);
    await new Promise((r) => setTimeout(r, 0));
    expect(definidas).toEqual([[2]]);
    expect(avisos.filter((a) => a !== null)).toEqual([]);
  });

  it('busca que falha avisa na barra; tirar o projeto tira o aviso', async () => {
    const e = estadoFalso(REDE);
    const avisos: (string | null)[] = [];
    ligarEstradas(e, { atualizar: () => {}, definirEstradas: () => {} }, (t) => avisos.push(t), () => Promise.reject(new Error('x')));
    e.trocar(REDE);
    await new Promise((r) => setTimeout(r, 0));
    expect(avisos[avisos.length - 1]).toBe(AVISO_SEM_ESTRADAS);
    e.trocar(null);
    expect(avisos[avisos.length - 1]).toBeNull();
  });
});
