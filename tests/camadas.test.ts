import { describe, expect, it } from 'vitest';
import type { Geometria, Poste, Pt, Rede, TipoRede, Vao } from '../src/nucleo/tipos.ts';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas.ts';
import { calcularCaso, type AreaConfirmada } from '../src/nucleo/caso.ts';
import { G } from '../src/nucleo/geom.ts';
import { gravarShp, type CamadaKit } from '../src/nucleo/shp.ts';
import { montarCamadas, unificar } from '../src/nucleo/camadas.ts';

// tudo inventado, em metros, perto de (500000, 9500000)
const OS = '0000000001';
const X = 500000;
const Y = 9500000;
const pt = (x: number, y: number): Pt => [X + x, Y + y];
const retangulo = (x0: number, y0: number, x1: number, y1: number): Pt[] => [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1), pt(x0, y0)];

let seq = 0;
function area(nome: string, pasta: string[], x0: number, y0: number, x1: number, y1: number): AreaProtegida {
  return { id: ++seq, nome, pasta, atributos: {}, poligonos: [[retangulo(x0, y0, x1, y1)]], linhas: [], caixa: [X + x0, Y + y0, X + x1, Y + y1] };
}
const UC = ['Unidade de Conservação Estadual', 'Uso Sustentável'];
const AGUA = ['Recursos Hídricos - COGERH', 'Açudes Monitorados'];
const base = (areas: AreaProtegida[]): BaseAreas => ({ revisao: 't', data: '', areas, municipios: [area('Cidade Teste', ['Municípios_CE'], -5000, -5000, 5000, 5000)] });
const vao = (id: string, tipo: TipoRede, pts: Pt[]): Vao => ({ id, pts, camada: 'C', tipo, situacao: 'novo', motivo: '' });
const poste = (id: string, ponto: Pt, numero: string | null = null, novo = true): Poste => ({ id, ponto, numero, novo, coordEscrita: null, etiqueta: null });
const rede = (vaos: Vao[], postes: Poste[] = []): Rede => ({ origem: 'dxf', vaos, postes });
const nomes = (cs: CamadaKit[]) => cs.map((c) => c.nome);
// área total (m²) dos polígonos de uma camada, sobreposição contada uma vez
const areaDaCamada = (c: CamadaKit): number =>
  G.area(G.uniao(c.feicoes.flatMap((f) => f.geometria).flatMap((g: Geometria) => (g.t === 'poligono' ? [G.poligono(g.aneis)] : []))));

describe('montarCamadas', () => {
  const uc = area('UC Inventada', UC, 0, 0, 100, 100);
  const r = rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])], [poste('p1', pt(10, 50), '1'), poste('p2', pt(55, 50), '2'), poste('p3', pt(70, 50), '3', false)]);
  const b = base([uc]);
  const caso = calcularCaso(r, b, []);

  it('45 m de BT numa UC: REDE BT, POSTES, a UC e a faixa, nessa ordem', () => {
    expect(nomes(montarCamadas(OS, caso, r, [], b))).toEqual([
      `${OS} REDE BT`, `${OS} POSTES`, `${OS} UC Inventada`, `${OS} REDE EM UC Inventada - POLÍGONO`,
    ]);
  });

  it('tipos: rede linha, postes ponto (um por poste, só os novos), área e faixa polígono', () => {
    const cs = montarCamadas(OS, caso, r, [], b);
    expect(cs.map((c) => c.tipo)).toEqual(['linha', 'ponto', 'poligono', 'poligono']);
    expect(cs[1].feicoes).toHaveLength(2);
    expect(cs[1].feicoes.every((f) => f.geometria.length === 1 && f.geometria[0].t === 'ponto')).toBe(true);
    expect(cs[1].feicoes.map((f) => f.name)).toEqual(['1', '2']);
    for (const c of cs) for (const f of c.feicoes) for (const g of f.geometria) expect(g.t).toBe(c.tipo);
  });

  it('a camada da área traz o polígono inteiro, não só o pedaço da obra', () => {
    const g = montarCamadas(OS, caso, r, [], b)[2].feicoes[0].geometria[0];
    expect(g.t === 'poligono' && g.aneis[0]).toEqual(uc.poligonos[0][0]);
  });

  it('a área da faixa ÷ 10.000 dá 0,0135 ha (±1%)', () => {
    const ha = areaDaCamada(montarCamadas(OS, caso, r, [], b)[3]) / 10000;
    expect(ha).toBeGreaterThan(0.0135 * 0.99);
    expect(ha).toBeLessThan(0.0135 * 1.01);
  });

  it('faixa de trecho com curva continua dentro de ±1% dos hectares do caso', () => {
    const uc2 = area('UC Curva', UC, 0, 0, 400, 400);
    const rc = rede([vao('a', 'MT', [pt(10, 50), pt(150, 50), pt(150, 70), pt(300, 80)])]);
    const bc = base([uc2]);
    const cc = calcularCaso(rc, bc, []);
    const f = montarCamadas(OS, cc, rc, [], bc).find((c) => c.nome.includes('POLÍGONO'))!;
    const ha = areaDaCamada(f) / 10000;
    expect(Math.abs(ha / cc.intervencoes[0].hectares - 1)).toBeLessThan(0.01);
  });

  it('sem caso de área não sai camada de área nem faixa', () => {
    const fora = base([area('Longe', UC, 5000, 5000, 5100, 5100)]);
    const c = calcularCaso(r, fora, []);
    expect(nomes(montarCamadas(OS, c, r, [], fora))).toEqual([`${OS} REDE BT`, `${OS} POSTES`]);
  });

  it('só os tipos de rede que existem, e só vãos novos', () => {
    const r2 = rede([vao('a', 'MT', [pt(0, 0), pt(10, 0)]), vao('b', 'CONJ', [pt(10, 0), pt(20, 0)]), { ...vao('c', 'BT', [pt(20, 0), pt(30, 0)]), situacao: 'existente' }]);
    const c = calcularCaso(r2, base([]), []);
    expect(nomes(montarCamadas(OS, c, r2, [], base([])))).toEqual([`${OS} REDE MT`, `${OS} REDE CONJUGADA`]);
  });

  it('só poste novo na área: sai a camada da área, sem faixa (não há trecho)', () => {
    const rp = rede([], [poste('p1', pt(50, 50), '1')]);
    const c = calcularCaso(rp, b, []);
    expect(c.intervencoes[0].postesSemRede).toHaveLength(1);
    const cs = montarCamadas(OS, c, rp, [], b);
    expect(nomes(cs)).toEqual([`${OS} POSTES`, `${OS} UC Inventada`]);
    expect(cs.every((x) => x.feicoes.length > 0)).toBe(true);
  });

  it('duas áreas com o mesmo nome ganham sufixo " 2" e a faixa acompanha', () => {
    const a1 = area('Repetida', UC, 0, 0, 100, 100);
    const a2 = area('Repetida', UC, 100, 0, 200, 100);
    const rr = rede([vao('a', 'BT', [pt(10, 50), pt(190, 50)])]);
    const bb = base([a1, a2]);
    const cs = montarCamadas(OS, calcularCaso(rr, bb, []), rr, [], bb);
    expect(nomes(cs)).toEqual([
      `${OS} REDE BT`, `${OS} Repetida`, `${OS} Repetida 2`, `${OS} REDE EM Repetida - POLÍGONO`, `${OS} REDE EM Repetida 2 - POLÍGONO`,
    ]);
  });

  it('APP confirmada sai como APP <água>, com a água ao lado e a faixa', () => {
    const agua = area('Açude Teste', AGUA, 0, 0, 200, 200);
    const app: AreaConfirmada = { nome: 'APP Açude Teste', tipo: 'APP', poligonos: [[retangulo(-100, -100, 300, 300)]], largura: 100, aguaId: agua.id };
    const rr = rede([vao('a', 'MT', [pt(-50, 250), pt(150, 250)])]);
    const bb = base([agua]);
    const cs = montarCamadas(OS, calcularCaso(rr, bb, [app]), rr, [], bb);
    expect(nomes(cs)).toEqual([
      `${OS} REDE MT`, `${OS} APP Açude Teste`, `${OS} Açude Teste`, `${OS} REDE EM APP Açude Teste - POLÍGONO`,
    ]);
    expect(cs[2].tipo).toBe('poligono');
  });

  it('APP confirmada sem a água na base não derruba: sai sem a camada da água', () => {
    const app: AreaConfirmada = { nome: 'APP X', tipo: 'APP', poligonos: [[retangulo(-100, -100, 300, 300)]], largura: 100, aguaId: 9999 };
    const rr = rede([vao('a', 'MT', [pt(-50, 250), pt(150, 250)])]);
    const bb = base([]);
    const cs = montarCamadas(OS, calcularCaso(rr, bb, [app]), rr, [], bb);
    expect(nomes(cs)).toEqual([`${OS} REDE MT`, `${OS} APP X`, `${OS} REDE EM APP X - POLÍGONO`]);
  });

  it('extras entram no fim', () => {
    const extra: CamadaKit = { nome: `${OS} PODA`, tipo: 'ponto', feicoes: [{ name: 'a', geometria: [{ t: 'ponto', p: pt(1, 1) }] }] };
    const cs = montarCamadas(OS, caso, r, [extra], b);
    expect(cs[cs.length - 1]).toBe(extra);
  });
});

describe('unificar', () => {
  const uc = area('UC Inventada', UC, 0, 0, 100, 100);
  const r = rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])], [poste('p1', pt(10, 50), '1')]);
  const b = base([uc]);
  const cs = montarCamadas(OS, calcularCaso(r, b, []), r, [], b);

  it('as duas se chamam <OS> UNIFICADO', () => {
    const u = unificar(OS, cs);
    expect(u.kml.nome).toBe(`${OS} UNIFICADO`);
    expect(u.shp.nome).toBe(`${OS} UNIFICADO`);
  });

  it('o KML guarda tudo, cada geometria no tipo dela', () => {
    const tipos = new Set(unificar(OS, cs).kml.feicoes.flatMap((f) => f.geometria.map((g) => g.t)));
    expect(tipos).toEqual(new Set(['linha', 'ponto', 'poligono']));
  });

  it('o SHP é todo linha (tipo 3): polígono vira contorno e o ponto fica de fora', () => {
    const u = unificar(OS, cs).shp;
    expect(u.tipo).toBe('linha');
    expect(u.feicoes.flatMap((f) => f.geometria).every((g) => g.t === 'linha')).toBe(true);
    expect(u.feicoes.some((f) => f.name === '1')).toBe(false);
    const contorno = u.feicoes.find((f) => f.name === 'UC Inventada')!;
    expect(contorno.geometria.length).toBeGreaterThan(0);
    expect(new DataView(gravarShp(u).shp.buffer).getInt32(32, true)).toBe(3);
  });
});
