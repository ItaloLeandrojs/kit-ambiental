import { describe, expect, it } from 'vitest';
import type { Rede, Vao } from '../src/nucleo/tipos.ts';
import { dadosVazios, finalidadePadrao, metrosDaRede, postesNovos, validarDados } from '../src/nucleo/obra.ts';
import { regionalSugerida } from '../src/regras/regionais.ts';

const vao = (id: string, comp: number, tipo: Vao['tipo'], situacao: Vao['situacao']): Vao => ({
  id, pts: [[0, 0], [comp, 0]], camada: 'X', tipo, situacao, motivo: '',
});
const redeTeste = (vaos: Vao[]): Rede => ({ origem: 'dxf', vaos, postes: [] });

describe('metrosDaRede', () => {
  it('soma só vãos novos com tipo, sem arredondar', () => {
    const r = redeTeste([vao('a', 100.4, 'MT', 'novo'), vao('b', 20, 'BT', 'existente'), vao('c', 50, null, 'novo')]);
    const m = metrosDaRede(r);
    expect(m.MT).toBeCloseTo(100.4, 9);
    expect(m.BT).toBe(0);
    expect(m.CONJ).toBe(0);
  });
});

describe('postesNovos', () => {
  it('conta só os postes novos', () => {
    const r = redeTeste([]);
    r.postes = [
      { id: '1', ponto: [0, 0], numero: null, novo: true, coordEscrita: null, etiqueta: null },
      { id: '2', ponto: [1, 0], numero: null, novo: false, coordEscrita: null, etiqueta: null },
    ];
    expect(postesNovos(r)).toBe(1);
  });
});

describe('validarDados', () => {
  it('CEP vazio dá amarelo que cita o CEP da sede do município', () => {
    const d = dadosVazios();
    d.rede.postes = [{ altura: 12, daN: 600, quantidade: 4 }];
    const a = validarDados(d, { postesNovos: 4, municipioKmz: null });
    const av = a.find((x) => x.codigo === 'CEP_VAZIO');
    expect(av?.nivel).toBe('amarelo');
    expect(av?.comoCorrigir).toContain('CEP da sede do município');
  });

  it('postes por tipo que não somam o total dão vermelho', () => {
    const d = dadosVazios();
    d.interessado.cep = '60000-000';
    d.rede.postes = [{ altura: 12, daN: 600, quantidade: 2 }, { altura: 11, daN: 300, quantidade: 1 }];
    const a = validarDados(d, { postesNovos: 4, municipioKmz: null });
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      nivel: 'vermelho',
      codigo: 'POSTES_NAO_BATEM',
      texto: 'Os postes por tipo somam 3, mas a rede nova tem 4 postes novos.',
    });
  });

  it('ligação B sem fases dá amarelo FASES_VAZIAS; com fases, não', () => {
    const d = dadosVazios();
    d.interessado.cep = '1';
    d.finalidade = { tipo: 'ligacao-b', fases: null, texto: '' };
    expect(validarDados(d, { postesNovos: 0, municipioKmz: null })).toContainEqual(expect.objectContaining({ nivel: 'amarelo', codigo: 'FASES_VAZIAS' }));
    d.finalidade.fases = 'mono';
    expect(validarDados(d, { postesNovos: 0, municipioKmz: null })).toEqual([]);
    d.finalidade = { tipo: 'extensao', fases: null, texto: '' };
    expect(validarDados(d, { postesNovos: 0, municipioKmz: null })).toEqual([]);
  });

  it('município diferente do KMZ dá amarelo; igual sem acento e minúsculo não', () => {
    const d = dadosVazios();
    d.interessado.cep = '1';
    d.obra.municipio = 'Aquiraz';
    const a = validarDados(d, { postesNovos: 0, municipioKmz: 'Eusébio' });
    expect(a).toContainEqual(expect.objectContaining({ nivel: 'amarelo', codigo: 'MUNICIPIO_EDITADO' }));
    d.obra.municipio = 'eusebio';
    expect(validarDados(d, { postesNovos: 0, municipioKmz: 'Eusébio' })).toEqual([]);
  });
});

describe('finalidadePadrao', () => {
  it('ligação B monofásica fala em 220 V; trifásica em 380 V', () => {
    const d = dadosVazios();
    d.finalidade = { tipo: 'ligacao-b', fases: 'mono', texto: '' };
    d.obra.endereco = 'Sítio Exemplo';
    d.obra.municipio = 'Eusébio';
    const mono = finalidadePadrao(d);
    expect(mono).toContain('monofásica');
    expect(mono).toContain('220 V');
    expect(mono).toContain('Sítio Exemplo');
    d.finalidade.fases = 'tri';
    const tri = finalidadePadrao(d);
    expect(tri).toContain('trifásica');
    expect(tri).toContain('380 V');
  });

  it('ligação B sem fases não chuta: leva o PREENCHER e não diz 220 V nem 380 V', () => {
    const d = dadosVazios();
    d.finalidade = { tipo: 'ligacao-b', fases: null, texto: '' };
    const t = finalidadePadrao(d);
    expect(t).toContain('[PREENCHER: monofásico ou trifásico]');
    expect(t).not.toContain('220 V');
    expect(t).not.toContain('380 V');
  });

  it('texto digitado vale como está', () => {
    const d = dadosVazios();
    d.finalidade = { tipo: 'ligacao-b', fases: 'mono', texto: 'Meu texto.' };
    expect(finalidadePadrao(d)).toBe('Meu texto.');
  });
});

describe('regionalSugerida', () => {
  it('Fortaleza é FORTALEZA; desconhecido dá null', () => {
    expect(regionalSugerida('Fortaleza')).toBe('FORTALEZA');
    expect(regionalSugerida('Lugar Inventado')).toBeNull();
  });
});
