import { describe, expect, it } from 'vitest';
import { lerDxfGeometria } from '../src/nucleo/dxf.ts';
import { AVISO_SUBTERRANEA, temSubterraneaDxf, temSubterraneaKml } from '../src/nucleo/subterranea.ts';
import type { Feicao } from '../src/nucleo/tipos.ts';

// tudo inventado
type Par = [number, string | number];
const texto = (pares: Par[]) => pares.map(([c, v]) => `${String(c).padStart(3)}\n${v}`).join('\n') + '\n';
const dxfCom = (camadas: string[]) =>
  lerDxfGeometria(new TextEncoder().encode(texto([
    [0, 'SECTION'], [2, 'HEADER'], [9, '$ACADVER'], [1, 'AC1027'], [0, 'ENDSEC'], [0, 'SECTION'], [2, 'ENTITIES'],
    ...camadas.flatMap((c, i): Par[] => [[0, 'LINE'], [8, c], [10, i * 10], [20, 0], [11, i * 10 + 5], [21, 0]]),
    [0, 'ENDSEC'], [0, 'EOF'],
  ])));
const feicao = (pasta: string[], nome: string): Feicao => ({ pasta, nome, atributos: {}, geometrias: [] });

describe('rede subterrânea no DXF', () => {
  it('camada com SUBTERRÂNEA conta', () => {
    expect(temSubterraneaDxf(dxfCom(['REDE MT SUBTERRÂNEA', 'REDE MT']))).toEqual(['REDE MT SUBTERRÂNEA']);
  });
  it('camada com DUTO conta', () => {
    expect(temSubterraneaDxf(dxfCom(['DUTO BT']))).toEqual(['DUTO BT']);
  });
  it('sublinhado separa palavra e SUBT sozinho conta', () => {
    expect(temSubterraneaDxf(dxfCom(['MT_SUBT', 'BT_SUBTERRANEA_NOVA']))).toEqual(['MT_SUBT', 'BT_SUBTERRANEA_NOVA']);
  });
  it('camada numerada conta', () => {
    expect(temSubterraneaDxf(dxfCom(['DUTO2', 'SUBT1', 'SUBTERRANEA2']))).toEqual(['DUTO2', 'SUBT1', 'SUBTERRANEA2']);
  });
  it('SUBESTACAO e SUBTOTAL não contam', () => {
    expect(temSubterraneaDxf(dxfCom(['SUBESTACAO', 'Subestação MT', 'SUBTOTAL']))).toEqual([]);
  });
  it('camada repetida aparece uma vez', () => {
    expect(temSubterraneaDxf(dxfCom(['DUTO BT', 'DUTO BT']))).toEqual(['DUTO BT']);
  });
});

describe('rede subterrânea no KML', () => {
  it('pasta MT SUBTERRANEA conta', () => {
    expect(temSubterraneaKml([feicao(['Projeto', 'MT SUBTERRANEA'], 'trecho 1')])).toEqual(['MT SUBTERRANEA']);
  });
  it('nome de feição com DUTO conta', () => {
    expect(temSubterraneaKml([feicao(['Projeto'], 'Duto 3')])).toEqual(['Duto 3']);
  });
  it('rede aérea e subestação não contam', () => {
    expect(temSubterraneaKml([feicao(['MT'], 'vão 1'), feicao(['Subestação'], 'SE 1')])).toEqual([]);
  });
});

it('o aviso é vermelho com o texto do desenho', () => {
  expect(AVISO_SUBTERRANEA.nivel).toBe('vermelho');
  expect(AVISO_SUBTERRANEA.codigo).toBe('REDE_SUBTERRANEA');
  expect(AVISO_SUBTERRANEA.texto).toBe('este site ainda não calcula rede subterrânea; monte este kit à mão');
});
