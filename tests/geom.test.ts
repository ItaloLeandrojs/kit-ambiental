import { describe, expect, it } from 'vitest';
import { G } from '../src/nucleo/geom.ts';
import type { Pt } from '../src/nucleo/tipos.ts';

const comp = (l: Pt[]) => G.comprimento(G.linha(l));

describe('G: acréscimos', () => {
  it('dentro: pedaço da linha dentro da caixa', () => {
    const r = G.dentro([[0, 0], [100, 0]], G.caixa(20, -5, 50, 5));
    expect(r).toHaveLength(1);
    expect(comp(r[0])).toBeCloseTo(30, 9);
  });

  it('dentro: linha que cruza duas vezes um polígono em U dá 2 pedaços', () => {
    const u = G.poligono([[[0, 0], [30, 0], [30, 30], [20, 30], [20, 10], [10, 10], [10, 30], [0, 30], [0, 0]]]);
    const r = G.dentro([[-5, 20], [35, 20]], u);
    expect(r).toHaveLength(2);
    expect(comp(r[0])).toBeCloseTo(10, 9);
    expect(comp(r[1])).toBeCloseTo(10, 9);
  });

  it('dentro: linha fora do polígono não dá pedaço', () => {
    expect(G.dentro([[0, 100], [100, 100]], G.caixa(20, -5, 50, 5))).toEqual([]);
  });

  it('poligono com buraco: a área desconta o buraco', () => {
    const p = G.poligono([[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]]]);
    expect(G.area(p)).toBeCloseTo(96, 9);
  });

  it('contem: caixa grande contém a pequena, não o contrário', () => {
    const grande = G.caixa(0, 0, 10, 10);
    const pequena = G.caixa(2, 2, 4, 4);
    expect(G.contem(grande, pequena)).toBe(true);
    expect(G.contem(pequena, grande)).toBe(false);
    expect(G.contem(grande, G.ponto([5, 5]))).toBe(true);
    expect(G.contem(grande, G.ponto([15, 5]))).toBe(false);
  });

  it('pontos: devolve os vértices', () => {
    expect(G.pontos(G.linha([[0, 0], [1, 2], [3, 4]]))).toEqual([[0, 0], [1, 2], [3, 4]]);
    expect(G.pontos(G.ponto([7, 8]))).toEqual([[7, 8]]);
  });

  it('poligonos: anel externo e furo de cada polígono, e vazio dá lista vazia', () => {
    const anel = G.diferenca(G.caixa(0, 0, 10, 10), G.caixa(3, 3, 6, 6));
    const r = G.poligonos(anel);
    expect(r).toHaveLength(1);
    expect(r[0]).toHaveLength(2);
    expect(G.area(G.poligono(r[0]))).toBeCloseTo(91, 9);
    const dois = G.poligonos(G.uniao([G.caixa(0, 0, 1, 1), G.caixa(5, 5, 6, 6)]));
    expect(dois).toHaveLength(2);
    expect(G.poligonos(G.diferenca(G.caixa(0, 0, 1, 1), G.caixa(0, 0, 1, 1)))).toEqual([]);
  });
});
