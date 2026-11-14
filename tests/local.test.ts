import { describe, expect, it } from 'vitest';
import { conferirEtiquetas, conferirLocal } from '../src/nucleo/local.ts';
import type { AreaProtegida } from '../src/nucleo/areas.ts';
import type { Poste, Pt, Rede, Vao } from '../src/nucleo/tipos.ts';

const vao = (pts: Pt[], situacao: Vao['situacao'] = 'novo'): Vao => ({ id: 'v', pts, camada: 'C', tipo: 'BT', situacao, motivo: '' });
const rede = (vaos: Vao[], postes: Poste[] = []): Rede => ({ origem: 'dxf', vaos, postes });
const municipio = (x0: number, y0: number, x1: number, y1: number): AreaProtegida => ({
  id: 1, nome: 'Município inventado', pasta: ['Municípios_CE'], atributos: {},
  poligonos: [[[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]], linhas: [], caixa: [x0, y0, x1, y1],
});
const CIDADES = [municipio(500000, 9500000, 510000, 9510000)];

describe('conferirLocal', () => {
  it('rede em coordenada de folha (0 a 500 m) dá FORA_UTM', () => {
    const a = conferirLocal(rede([vao([[0, 0], [500, 300]])]), CIDADES);
    expect(a?.codigo).toBe('FORA_UTM');
    expect(a?.nivel).toBe('vermelho');
    expect(a?.texto).toBe('seu desenho não está na coordenada real; o kit sairia deslocado');
    expect(a?.comoCorrigir).not.toMatch(/—/);
  });

  it('rede em Pernambuco (dentro da faixa UTM, fora dos municípios) dá FORA_CEARA', () => {
    const a = conferirLocal(rede([vao([[700000, 9100000], [700100, 9100000]])]), CIDADES);
    expect(a?.codigo).toBe('FORA_CEARA');
    expect(a?.texto).toBe('A rede está fora do Ceará pelo limite dos municípios do KMZ.');
  });

  it('rede dentro de um município não dá aviso', () => {
    expect(conferirLocal(rede([vao([[501000, 9501000], [501100, 9501000]])]), CIDADES)).toBeNull();
  });

  it('vão que não é rede nova não conta para FORA_CEARA', () => {
    const r = rede([vao([[501000, 9501000], [501100, 9501000]]), vao([[700000, 9100000], [700100, 9100000]], 'existente')]);
    expect(conferirLocal(r, CIDADES)).toBeNull();
  });
});

const poste = (d: number): Poste => ({ id: `p${d}`, ponto: [501000, 9501000], numero: null, novo: true, coordEscrita: [501000 + d, 9501000], etiqueta: [501000, 9501000] });

describe('conferirEtiquetas', () => {
  it('etiquetas a 12, 15 e 900 m: mediana 15, sem aviso', () => {
    const r = conferirEtiquetas(rede([], [poste(12), poste(15), poste(900)]));
    expect(r.aviso).toBeNull();
    expect(r.distancia).toBe(15);
  });

  it('etiquetas a 880, 886 e 890 m: ETIQUETA_LONGE com (886 m)', () => {
    const r = conferirEtiquetas(rede([], [poste(880), poste(886), poste(890)]));
    expect(r.aviso?.codigo).toBe('ETIQUETA_LONGE');
    expect(r.aviso?.nivel).toBe('vermelho');
    expect(r.aviso?.texto).toBe('o desenho e as coordenadas das etiquetas não batem (886 m); o kit sairia deslocado');
    expect(r.distancia).toBe(886);
  });

  it('mediana de quantidade par é a média dos dois do meio', () => {
    expect(conferirEtiquetas(rede([], [poste(10), poste(20)])).distancia).toBe(15);
  });

  it('sem nenhuma etiqueta com coordenada: sem aviso e sem distância', () => {
    const p: Poste = { id: 'x', ponto: [1, 1], numero: null, novo: true, coordEscrita: null, etiqueta: null };
    expect(conferirEtiquetas(rede([], [p]))).toEqual({ aviso: null, distancia: null });
  });
});
