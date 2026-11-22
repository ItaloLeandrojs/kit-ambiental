import { describe, expect, it } from 'vitest';
import { lerDxfGeometria } from '../src/nucleo/dxf.ts';
import { acharUcs, camadaUc, situarUc } from '../src/nucleo/uc.ts';
import { PADROES_UC, RAIO_UC } from '../src/regras/uc.ts';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas.ts';
import type { AreaConfirmada } from '../src/nucleo/caso.ts';
import type { Pt, Rede } from '../src/nucleo/tipos.ts';

// tudo inventado
type Par = [number, string | number];
const texto = (pares: Par[]) => pares.map(([c, v]) => `${String(c).padStart(3)}\n${v}`).join('\n') + '\n';
const linha = (camada: string, a: Pt, b: Pt): Par[] => [[0, 'LINE'], [8, camada], [10, a[0]], [20, a[1]], [11, b[0]], [21, b[1]]];
const bloco = (nome: string, camada: string, p: Pt): Par[] => [[0, 'INSERT'], [8, camada], [2, nome], [10, p[0]], [20, p[1]]];
const dxfCom = (extras: Par[]) =>
  lerDxfGeometria(new TextEncoder().encode(texto([
    [0, 'SECTION'], [2, 'HEADER'], [9, '$ACADVER'], [1, 'AC1027'], [0, 'ENDSEC'], [0, 'SECTION'], [2, 'ENTITIES'],
    ...linha('REDE MT NOVA', [500000, 9500000], [500100, 9500000]),
    ...extras,
    [0, 'ENDSEC'], [0, 'EOF'],
  ])));
// rede já proposta: um vão MT novo de 100 m (a proposta a partir do desenho é assunto de rede.test.ts)
const redeDe = (_d?: unknown): Rede => ({
  origem: 'dxf',
  vaos: [{ id: 'v1', pts: [[500000, 9500000], [500100, 9500000]], camada: 'REDE MT NOVA', tipo: 'MT', situacao: 'novo', motivo: '' }],
  postes: [],
});

describe('acharUcs', () => {
  it('só o bloco a até 300 m da rede nova; o de 100 km fica de fora', () => {
    const d = dxfCom([...bloco('UC À IMPLANTAR - ATUAL', 'UC', [500050, 9500040]), ...bloco('uc', '0', [600050, 9500040])]);
    const r = acharUcs(d, redeDe(d));
    expect(r).toHaveLength(1);
    expect(r[0].bloco).toBe('UC À IMPLANTAR - ATUAL');
    expect(r[0].camada).toBe('UC');
    expect(r[0].distancia).toBeCloseTo(40, 1);
    expect(r[0].ponto).toEqual([500050, 9500040]);
  });
  it('dois blocos de UC perto: os dois voltam, o mais perto primeiro', () => {
    const d = dxfCom([...bloco('UC À IMPLANTAR - ATUAL', 'UC', [500050, 9500200]), ...bloco('PADRÃO BT A IMPLANTAR', 'UC', [500050, 9500030])]);
    const r = acharUcs(d, redeDe(d));
    expect(r.map((c) => Math.round(c.distancia))).toEqual([30, 200]);
    expect(r[0].bloco).toBe('PADRÃO BT A IMPLANTAR');
  });
  it('bloco POSTE SUB perto da rede não conta', () => {
    const d = dxfCom([...bloco('POSTE SUB', 'POSTE', [500050, 9500010]), ...bloco('SUBESTAÇÃO DO CLIENTE', 'UC', [500050, 9500010])]);
    expect(acharUcs(d, redeDe(d)).map((c) => c.bloco)).toEqual(['SUBESTAÇÃO DO CLIENTE']);
  });
  it('bloco a mais de 300 m não conta; o limite é o RAIO_UC', () => {
    expect(RAIO_UC).toBe(300);
    const d = dxfCom([...bloco('UC', 'UC', [500050, 9500000 + 301])]);
    expect(acharUcs(d, redeDe(d))).toEqual([]);
  });
  it('sem rede nova não há UC, mesmo com bloco colocado', () => {
    const d = dxfCom(bloco('UC À IMPLANTAR - ATUAL', 'UC', [500050, 9500040]));
    expect(acharUcs(d, { origem: 'dxf', vaos: [], postes: [] })).toEqual([]);
  });
  it('poste novo também vale como ponto de partida; vão existente não', () => {
    const d = dxfCom(bloco('UC', 'UC', [501000, 9500000]));
    const poste = { id: 'p1', ponto: [501100, 9500000] as Pt, numero: null, novo: true, coordEscrita: null, etiqueta: null };
    expect(acharUcs(d, { ...redeDe(), postes: [poste] })[0]?.distancia).toBeCloseTo(100, 1);
    const antigo = { ...redeDe(), vaos: [{ ...redeDe().vaos[0], situacao: 'existente' as const }] };
    expect(acharUcs(d, antigo)).toEqual([]);
  });
  it('os padrões casam sobre o nome sem acento', () => {
    const casa = (n: string) => PADROES_UC.some((p) => p.test(n));
    expect(casa('UC A IMPLANTAR - ATUAL')).toBe(true);
    expect(casa('PADRAO BT A IMPLANTAR')).toBe(true);
    expect(casa('SUBESTACAO DO CLIENTE')).toBe(true);
    expect(casa('UC')).toBe(true);
    expect(casa('POSTE SUB')).toBe(false);
    expect(casa('UCHOA')).toBe(false);
  });
});

const quadrado = (x: number, y: number, l: number): Pt[][][] => [[[[x, y], [x + l, y], [x + l, y + l], [x, y + l], [x, y]]]];
const area = (id: number, nome: string, x: number, y: number, l: number): AreaProtegida => ({
  id, nome, pasta: ['Teste'], atributos: {}, poligonos: quadrado(x, y, l), linhas: [], caixa: [x, y, x + l, y + l],
});
const base = (areas: AreaProtegida[]): BaseAreas => ({ revisao: '1', data: '01/01/2026', areas, municipios: [] });
const app = (x: number, y: number, l: number): AreaConfirmada => ({ nome: 'APP teste', tipo: 'APP', poligonos: quadrado(x, y, l), largura: 30 });

describe('situarUc', () => {
  it('ponto dentro de uma área e de uma APP confirmada: as duas, emApp true', () => {
    const a = area(1, 'Área X', 500000, 9500000, 100);
    const s = situarUc([500050, 9500050], base([a, area(2, 'Longe', 700000, 9500000, 100)]), [app(500020, 9500020, 100)]);
    expect(s.dentro).toHaveLength(2);
    expect(s.dentro[0]).toBe(a);
    expect(s.emApp).toBe(true);
  });
  it('só área protegida: emApp false', () => {
    const s = situarUc([500050, 9500050], base([area(1, 'Área X', 500000, 9500000, 100)]), []);
    expect(s.dentro).toHaveLength(1);
    expect(s.emApp).toBe(false);
  });
  it('ponto fora de tudo: dentro vazio', () => {
    const s = situarUc([510000, 9510000], base([area(1, 'Área X', 500000, 9500000, 100)]), [app(500020, 9500020, 100)]);
    expect(s.dentro).toEqual([]);
    expect(s.emApp).toBe(false);
  });
  it('ponto na caixa mas fora do polígono não conta', () => {
    const a = area(1, 'Triângulo', 500000, 9500000, 100);
    a.poligonos = [[[[500000, 9500000], [500100, 9500000], [500000, 9500100], [500000, 9500000]]]];
    expect(situarUc([500090, 9500090], base([a]), []).dentro).toEqual([]);
  });
});

describe('camadaUc', () => {
  it('nome com a OS e tipo ponto', () => {
    const c = camadaUc('0000000001', [500000, 9500000]);
    expect(c.nome).toBe('0000000001 UC');
    expect(c.tipo).toBe('ponto');
    expect(c.feicoes[0].geometria).toEqual([{ t: 'ponto', p: [500000, 9500000] }]);
  });
});
