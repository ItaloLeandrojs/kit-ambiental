import { describe, expect, it } from 'vitest';
import { coordTexto, haTexto, metrosTexto } from '../src/nucleo/formato.ts';

describe('formato', () => {
  it('metrosTexto: inteiro', () => {
    expect(metrosTexto(45)).toBe('45');
    expect(metrosTexto(44.6)).toBe('45');
    expect(metrosTexto(307.5)).toBe('308');
  });
  it('haTexto: vírgula, 4 a 7 casas, sem zeros depois da 4ª', () => {
    expect(haTexto(0.0135)).toBe('0,0135');
    expect(haTexto(0.6216)).toBe('0,6216');
    expect(haTexto(0.0002856)).toBe('0,0002856');
    expect(haTexto(0.096)).toBe('0,0960');
    expect(haTexto(0.0639)).toBe('0,0639');
    expect(haTexto(0.0005)).toBe('0,0005');
    expect(haTexto(1)).toBe('1,0000');
    expect(haTexto(0.00012345678)).toBe('0,0001235');
  });
  it('coordTexto: E com 7 dígitos', () => {
    expect(coordTexto([469418, 9161031])).toBe('(0469418, 9161031)');
    expect(coordTexto([69418.4, 9161031.6])).toBe('(0069418, 9161032)');
    expect(coordTexto([540648, 9347809])).toBe('(0540648, 9347809)');
  });
});
