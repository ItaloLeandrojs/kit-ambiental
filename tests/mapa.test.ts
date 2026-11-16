// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { classeDoVao, criarMapa } from '../src/tela/mapa.ts';
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
});
