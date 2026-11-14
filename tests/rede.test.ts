import { describe, expect, it } from 'vitest';
import type { DxfGeo } from '../src/nucleo/dxf.ts';
import type { Feicao, Pt } from '../src/nucleo/tipos.ts';
import { camadasCandidatas, incluirCamada, marcarVao, proporRedeDxf, proporRedeKml, redeNova } from '../src/nucleo/rede.ts';

const vazio = (): DxfGeo => ({ versao: 'AC1027', linhas: [], blocos: [], textos: [], cotas: [] });
const linha = (camada: string, pts: Pt[], cor: number | null = null) => ({ camada, cor, pts });
const cota = (p1: Pt, p2: Pt, modelo: string, estilo = 'ISO-25') => ({
  camada: 'COTAS', estilo, modelo, p1, p2, medida: Math.hypot(p2[0] - p1[0], p2[1] - p1[1]),
});
const texto = (linhas: string[], ponto: Pt) => ({ camada: 'TEXTO', linhas, ponto, cor: null });

describe('proporRedeDxf: vãos e situação', () => {
  // 3 vãos MT com cota (1), 1 vão BT com texto (3), 1 vão sem etiqueta
  const d = (): DxfGeo => ({
    ...vazio(),
    linhas: [
      linha('LINHAMT', [[0, 0], [30, 0], [60, 0], [90, 0]]), // polilinha: 3 lados
      linha('LINHABT', [[0, 100], [40, 100]]),
      linha('LINHABT', [[0, 200], [40, 200]]),
      linha('RUAS', [[0, 300], [40, 300]]),
    ],
    cotas: [
      cota([0, 0], [30, 0], '(1)<>'),
      cota([60, 0], [30, 0], '(1)<>'), // pontas em ordem trocada
      cota([60, 0], [90, 0], '/1/<>'),
    ],
    textos: [texto(['(3)2AN00438'], [20, 103])],
  });

  it('cada lado vira um vão v<n>, na camada de rede, com o tipo pelo MT/BT', () => {
    const r = proporRedeDxf(d());
    expect(r.origem).toBe('dxf');
    expect(r.vaos.map((v) => [v.id, v.tipo])).toEqual([
      ['v1', 'MT'], ['v2', 'MT'], ['v3', 'MT'], ['v4', 'BT'], ['v5', 'BT'],
    ]);
    expect(r.vaos[0].pts).toEqual([[0, 0], [30, 0]]);
  });

  it('cota (1) e /1/ deixam o vão novo; texto (3) retira; sem etiqueta é existente', () => {
    const r = proporRedeDxf(d());
    expect(r.vaos.slice(0, 3).map((v) => v.situacao)).toEqual(['novo', 'novo', 'novo']);
    expect(r.vaos[3].situacao).toBe('retirado');
    expect(r.vaos[4].situacao).toBe('existente');
    expect(r.vaos[4].motivo).toBe('sem etiqueta');
  });

  it('cota de estilo "1." também marca como novo', () => {
    const g = { ...vazio(), linhas: [linha('MT', [[0, 0], [10, 0]])], cotas: [cota([0, 0], [10, 0], '<>', '1.Novo')] };
    expect(proporRedeDxf(g).vaos[0].situacao).toBe('novo');
  });

  it('cota com pontas a mais de 2 m não vale', () => {
    const g = { ...vazio(), linhas: [linha('MT', [[0, 0], [10, 0]])], cotas: [cota([0, 3], [10, 3], '(1)<>')] };
    expect(proporRedeDxf(g).vaos[0].situacao).toBe('existente');
  });

  it('texto de cabo a mais de 8 m ou com projeção fora do vão não vale', () => {
    const g = (t: Pt) => ({ ...vazio(), linhas: [linha('MT', [[0, 0], [10, 0]])], textos: [texto(['(1)AM035T26'], t)] });
    expect(proporRedeDxf(g([5, 7])).vaos[0].situacao).toBe('novo');
    expect(proporRedeDxf(g([5, 9])).vaos[0].situacao).toBe('existente');
    expect(proporRedeDxf(g([15, 1])).vaos[0].situacao).toBe('existente');
  });

  it('texto vai só para o vão mais perto', () => {
    const g = {
      ...vazio(),
      linhas: [linha('MT', [[0, 0], [10, 0]]), linha('BT', [[0, 4], [10, 4]])],
      textos: [texto(['(1)AM035T26'], [5, 3])],
    };
    expect(proporRedeDxf(g).vaos.map((v) => v.situacao)).toEqual(['existente', 'novo']);
  });

  it('realocado pelo prefixo (2) e /2/', () => {
    const g = {
      ...vazio(),
      linhas: [linha('MT', [[0, 0], [10, 0]]), linha('MT', [[0, 100], [10, 100]])],
      textos: [texto(['(2)3CA004'], [5, 1]), texto(['/2/AM035'], [5, 101])],
    };
    expect(proporRedeDxf(g).vaos.map((v) => v.situacao)).toEqual(['realocado', 'realocado']);
  });

  it('vão sem etiqueta e azul (cor 5) é novo, com motivo', () => {
    const g = { ...vazio(), linhas: [linha('LINHABT', [[0, 0], [10, 0]], 5), linha('LINHABT', [[0, 50], [10, 50]], 1)] };
    const r = proporRedeDxf(g);
    expect(r.vaos[0]).toMatchObject({ situacao: 'novo', motivo: 'azul, sem etiqueta' });
    expect(r.vaos[1].situacao).toBe('existente');
  });

  it('camada casa depois de tirar acento e espaço', () => {
    const g = { ...vazio(), linhas: [linha('Rede-BT', [[0, 0], [1, 0]]), linha('linha mt', [[0, 5], [1, 5]]), linha('BTX', [[0, 9], [1, 9]])] };
    expect(proporRedeDxf(g).vaos.map((v) => v.tipo)).toEqual(['BT', 'MT']);
    expect(camadasCandidatas(g)).toEqual(['BTX']);
  });
});

describe('conjugada', () => {
  it('MT e BT novos lado a lado viram um vão CONJ com a geometria do MT', () => {
    const g: DxfGeo = {
      ...vazio(),
      linhas: [linha('LINHAMT', [[0, 0], [50, 0]]), linha('LINHABT', [[0, 1], [50, 1]])],
      cotas: [cota([0, 0], [50, 0], '(1)<>'), cota([0, 1], [50, 1], '(1)<>')],
    };
    const r = proporRedeDxf(g);
    expect(r.vaos).toHaveLength(1);
    expect(r.vaos[0]).toMatchObject({ id: 'v1', tipo: 'CONJ', situacao: 'novo', pts: [[0, 0], [50, 0]] });
  });

  it('MT novo com BT existente ao lado não vira conjugada', () => {
    const g: DxfGeo = {
      ...vazio(),
      linhas: [linha('LINHAMT', [[0, 0], [50, 0]]), linha('LINHABT', [[0, 1], [50, 1]])],
      cotas: [cota([0, 0], [50, 0], '(1)<>')],
    };
    expect(proporRedeDxf(g).vaos.map((v) => v.tipo)).toEqual(['MT', 'BT']);
  });

  it('MT e BT novos afastados mais de 1,5 m ficam separados', () => {
    const g: DxfGeo = {
      ...vazio(),
      linhas: [linha('LINHAMT', [[0, 0], [50, 0]]), linha('LINHABT', [[0, 3], [50, 3]])],
      cotas: [cota([0, 0], [50, 0], '(1)<>'), cota([0, 3], [50, 3], '(1)<>')],
    };
    expect(proporRedeDxf(g).vaos.map((v) => v.tipo)).toEqual(['MT', 'BT']);
  });
});

describe('postes', () => {
  it('MTEXT (1)300/9 dá poste novo com número e coordenada escrita', () => {
    const g: DxfGeo = {
      ...vazio(),
      blocos: [
        { camada: 'POSTE', nome: 'P1', ponto: [100, 100] },
        { camada: 'POSTE-EXIST', nome: 'P1', ponto: [200, 100] },
        { camada: 'OUTRA', nome: 'X', ponto: [100, 105] },
      ],
      textos: [texto(['(1)300/9 S2N S2C', '(0469418, 9161031)', '7'], [105, 110])],
    };
    const r = proporRedeDxf(g);
    expect(r.postes).toHaveLength(2);
    expect(r.postes[0]).toEqual({
      id: 'p1', ponto: [100, 100], numero: '7', novo: true, coordEscrita: [469418, 9161031], etiqueta: [105, 110],
    });
    expect(r.postes[1]).toMatchObject({ id: 'p2', novo: false, numero: null, coordEscrita: null, etiqueta: null });
  });

  it('texto a mais de 30 m do poste não o torna novo; número aceita P', () => {
    const g: DxfGeo = {
      ...vazio(),
      blocos: [{ camada: 'POSTES', nome: 'P', ponto: [0, 0] }],
      textos: [texto(['(1)600/12', 'P12'], [31, 0])],
    };
    expect(proporRedeDxf(g).postes[0].novo).toBe(false);
    g.textos[0].ponto = [29, 0];
    expect(proporRedeDxf(g).postes[0]).toMatchObject({ novo: true, numero: '12' });
  });
});

describe('edição e camadas candidatas', () => {
  const base = () => proporRedeDxf({
    ...vazio(),
    linhas: [linha('MT', [[0, 0], [10, 0]]), linha('RUA', [[0, 9], [10, 9]]), linha('RUA', [[0, 20], [10, 20]])],
    cotas: [cota([0, 0], [10, 0], '(1)<>')],
  });

  it('marcarVao devolve outra rede e não muda a original', () => {
    const r = base();
    const copia = JSON.stringify(r);
    const r2 = marcarVao(r, 'v1', { situacao: 'existente' });
    expect(JSON.stringify(r)).toBe(copia);
    expect(r2.vaos[0].situacao).toBe('existente');
    expect(r2.vaos[0].tipo).toBe('MT');
    expect(marcarVao(r, 'v1', { tipo: null }).vaos[0].tipo).toBeNull();
  });

  it('redeNova só devolve novo com tipo', () => {
    const r = base();
    expect(redeNova(r).map((v) => v.id)).toEqual(['v1']);
    expect(redeNova(marcarVao(r, 'v1', { tipo: null }))).toEqual([]);
  });

  it('camadasCandidatas lista as outras camadas; incluirCamada as traz com o tipo', () => {
    const g: DxfGeo = {
      ...vazio(),
      linhas: [linha('MT', [[0, 0], [10, 0]]), linha('RUA', [[0, 9], [10, 9]], 5)],
    };
    expect(camadasCandidatas(g)).toEqual(['RUA']);
    const r = incluirCamada(proporRedeDxf(g), g, 'RUA', 'BT');
    expect(r.vaos.map((v) => [v.id, v.camada, v.tipo, v.situacao])).toEqual([
      ['v1', 'MT', 'MT', 'existente'],
      ['v2', 'RUA', 'BT', 'novo'],
    ]);
  });
});

describe('proporRedeKml', () => {
  const f = (pasta: string[], nome: string, geometrias: Feicao['geometrias']): Feicao => ({ pasta, nome, atributos: {}, geometrias });
  it('cada linha vira vão novo; tipo pelo nome ou pasta; POSTE vira poste novo', () => {
    const r = proporRedeKml([
      f(['REDE CONJUGADA'], 'Trecho 1', [{ t: 'linha', pts: [[0, 0], [10, 0], [20, 0]] }]),
      f(['PROJETO'], 'MT-BT 2', [{ t: 'linha', pts: [[0, 5], [10, 5]] }]),
      f([], 'Rede MT', [{ t: 'linha', pts: [[0, 9], [10, 9]] }]),
      f(['X'], 'ramal BT', [{ t: 'linha', pts: [[0, 12], [10, 12]] }]),
      f(['X'], 'qualquer', [{ t: 'linha', pts: [[0, 15], [10, 15]] }]),
      f(['X'], 'POSTE 1', [{ t: 'ponto', p: [3, 3] }]),
      f(['X'], 'sem nada', [{ t: 'ponto', p: [4, 4] }]),
    ]);
    expect(r.origem).toBe('kml');
    expect(r.vaos.map((v) => [v.tipo, v.situacao])).toEqual([
      ['CONJ', 'novo'], ['CONJ', 'novo'], ['MT', 'novo'], ['BT', 'novo'], [null, 'novo'],
    ]);
    expect(r.vaos[0].pts).toHaveLength(3);
    expect(r.postes).toEqual([{ id: 'p1', ponto: [3, 3], numero: null, novo: true, coordEscrita: null, etiqueta: null }]);
  });
});
