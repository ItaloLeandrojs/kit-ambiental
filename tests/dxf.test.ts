import { describe, expect, it } from 'vitest';
import { lerDxfGeometria } from '../src/nucleo/dxf.ts';

type Par = [number, string | number];
const texto = (pares: Par[]) => pares.map(([c, v]) => `${String(c).padStart(3)}\n${v}`).join('\n') + '\n';
const cabecalho = (versao: string): Par[] => [[0, 'SECTION'], [2, 'HEADER'], [9, '$ACADVER'], [1, versao], [0, 'ENDSEC']];
const tabelas = (estilos: [string, string][]): Par[] => [
  [0, 'SECTION'], [2, 'TABLES'],
  ...estilos.flatMap(([nome, post]): Par[] => [[0, 'DIMSTYLE'], [2, nome], [3, post]]),
  [0, 'ENDSEC'],
];
const entidades = (e: Par[]): Par[] => [[0, 'SECTION'], [2, 'ENTITIES'], ...e, [0, 'ENDSEC'], [0, 'EOF']];
const montar = (versao: string, estilos: [string, string][], e: Par[]) =>
  new TextEncoder().encode(texto([...cabecalho(versao), ...tabelas(estilos), ...entidades(e)]));

describe('lerDxfGeometria', () => {
  it('lê LINE com cor e sem cor', () => {
    const dxf = lerDxfGeometria(montar('AC1027', [], [
      [0, 'LINE'], [8, 'LINHAMT'], [62, 3], [10, 100], [20, 200], [11, 150.5], [21, 250.5],
      [0, 'LINE'], [8, 'OUTRA'], [10, 0], [20, 0], [11, 1], [21, 1],
    ]));
    expect(dxf.versao).toBe('AC1027');
    expect(dxf.linhas).toEqual([
      { camada: 'LINHAMT', cor: 3, pts: [[100, 200], [150.5, 250.5]] },
      { camada: 'OUTRA', cor: null, pts: [[0, 0], [1, 1]] },
    ]);
  });

  it('lê LWPOLYLINE fechada (bulge vira reta) e aberta', () => {
    const dxf = lerDxfGeometria(montar('AC1027', [], [
      [0, 'LWPOLYLINE'], [8, 'A'], [90, 3], [70, 1], [10, 0], [20, 0], [42, 0.5], [10, 10], [20, 0], [10, 10], [20, 10],
      [0, 'LWPOLYLINE'], [8, 'B'], [90, 2], [70, 0], [10, 5], [20, 5], [10, 6], [20, 7],
    ]));
    expect(dxf.linhas).toEqual([
      { camada: 'A', cor: null, pts: [[0, 0], [10, 0], [10, 10], [0, 0]] },
      { camada: 'B', cor: null, pts: [[5, 5], [6, 7]] },
    ]);
  });

  it('lê POLYLINE com 3 VERTEX até o SEQEND', () => {
    const dxf = lerDxfGeometria(montar('AC1015', [], [
      [0, 'POLYLINE'], [8, 'BT'], [62, 5], [70, 0],
      [0, 'VERTEX'], [8, 'BT'], [10, 1], [20, 1],
      [0, 'VERTEX'], [8, 'BT'], [10, 2], [20, 3],
      [0, 'VERTEX'], [8, 'BT'], [10, 4], [20, 9],
      [0, 'SEQEND'], [8, 'BT'],
      [0, 'LINE'], [8, 'X'], [10, 0], [20, 0], [11, 1], [21, 0],
    ]));
    expect(dxf.linhas).toEqual([
      { camada: 'BT', cor: 5, pts: [[1, 1], [2, 3], [4, 9]] },
      { camada: 'X', cor: null, pts: [[0, 0], [1, 0]] },
    ]);
  });

  it('lê INSERT só como ponto', () => {
    const dxf = lerDxfGeometria(montar('AC1027', [], [[0, 'INSERT'], [8, 'POSTES'], [2, 'POSTE_DT'], [10, 300.5], [20, 400.25]]));
    expect(dxf.blocos).toEqual([{ camada: 'POSTES', nome: 'POSTE_DT', ponto: [300.5, 400.25] }]);
  });

  it('lê TEXT e MTEXT com linhas limpas', () => {
    const dxf = lerDxfGeometria(montar('AC1027', [], [
      [0, 'MTEXT'], [8, 'ETIQ'], [62, 1], [10, 7], [20, 8], [1, '{\\C0;(1)AM035T26}\\PSegunda linha'],
      [0, 'TEXT'], [8, 'ETIQ'], [10, 1], [20, 2], [40, 2.5], [1, 'P%%c12'],
    ]));
    expect(dxf.textos).toEqual([
      { camada: 'ETIQ', linhas: ['(1)AM035T26', 'Segunda linha'], ponto: [7, 8], cor: 1 },
      { camada: 'ETIQ', linhas: ['PØ12'], ponto: [1, 2], cor: null },
    ]);
  });

  it('lê DIMENSION com o modelo do DIMSTYLE', () => {
    const dxf = lerDxfGeometria(montar('AC1027', [['EST1', '(1)P3AN004<>']], [
      [0, 'DIMENSION'], [8, 'COTAS'], [3, 'EST1'], [13, 10], [23, 20], [14, 40], [24, 60], [42, 36.06],
    ]));
    expect(dxf.cotas).toEqual([
      { camada: 'COTAS', estilo: 'EST1', modelo: '(1)P3AN004<>', p1: [10, 20], p2: [40, 60], medida: 36.06 },
    ]);
  });

  it('deixa de fora entidades da folha de impressão (67=1)', () => {
    const dxf = lerDxfGeometria(montar('AC1027', [], [
      [0, 'LINE'], [8, 'FOLHA'], [67, 1], [10, 0], [20, 0], [11, 1], [21, 1],
      [0, 'LINE'], [8, 'MODELO'], [10, 0], [20, 0], [11, 2], [21, 2],
    ]));
    expect(dxf.linhas.map((l) => l.camada)).toEqual(['MODELO']);
  });

  it('só lê a seção ENTITIES (blocos ficam fora)', () => {
    const pares: Par[] = [
      ...cabecalho('AC1027'),
      [0, 'SECTION'], [2, 'BLOCKS'], [0, 'LINE'], [8, 'NOBLOCO'], [10, 0], [20, 0], [11, 1], [21, 1], [0, 'ENDSEC'],
      ...entidades([[0, 'LINE'], [8, 'OK'], [10, 0], [20, 0], [11, 1], [21, 1]]),
    ];
    const dxf = lerDxfGeometria(new TextEncoder().encode(texto(pares)));
    expect(dxf.linhas.map((l) => l.camada)).toEqual(['OK']);
  });

  it('decodifica AC1015 em windows-1252 (Ç)', () => {
    const t = texto([...cabecalho('AC1015'), ...entidades([[0, 'TEXT'], [8, 'T'], [10, 0], [20, 0], [1, 'CONSTRUÇÃO']])]);
    const mapa: Record<string, number> = { 'Ç': 0xc7, 'Ã': 0xc3 };
    const bytes = Uint8Array.from(Array.from(t, (c) => mapa[c] ?? c.charCodeAt(0)));
    expect(lerDxfGeometria(bytes).textos[0].linhas).toEqual(['CONSTRUÇÃO']);
  });

  it('erro para DWG', () => {
    const dwg = new TextEncoder().encode('AC1032\0\0\0\0\0\0\u0001\u0002binario');
    expect(() => lerDxfGeometria(dwg)).toThrow('Este arquivo é DWG. No CAD, salve como DXF e abra de novo.');
  });

  it('erro para arquivo sem SECTION', () => {
    expect(() => lerDxfGeometria(new TextEncoder().encode('qualquer coisa\nque nao e dxf\n'))).toThrow('Este arquivo não é um DXF');
  });
});
