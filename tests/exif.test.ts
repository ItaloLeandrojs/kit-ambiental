import { describe, expect, it } from 'vitest';
import { lerGpsJpeg } from '../src/nucleo/exif.ts';
import { bytesHeic, jpegComGps, jpegSemExif } from './jpeg-gps.ts';

describe('lerGpsJpeg', () => {
  it('lê o GPS em Motorola (S 3°43\'12" W 38°30\'00")', () => {
    const r = lerGpsJpeg(jpegComGps({ ordem: 'MM' }))!;
    expect(r.lat).toBeCloseTo(-3.72, 6);
    expect(r.lon).toBeCloseTo(-38.5, 6);
  });

  it('lê o mesmo GPS em Intel', () => {
    const r = lerGpsJpeg(jpegComGps({ ordem: 'II' }))!;
    expect(r.lat).toBeCloseTo(-3.72, 6);
    expect(r.lon).toBeCloseTo(-38.5, 6);
  });

  it('N e E dão sinal positivo', () => {
    const r = lerGpsJpeg(jpegComGps({ latRef: 'N', lonRef: 'E' }))!;
    expect(r.lat).toBeCloseTo(3.72, 6);
    expect(r.lon).toBeCloseTo(38.5, 6);
  });

  it('JPEG sem Exif: null', () => {
    expect(lerGpsJpeg(jpegSemExif())).toBeNull();
  });

  it('HEIC e bytes que não são JPEG: null', () => {
    expect(lerGpsJpeg(bytesHeic())).toBeNull();
    expect(lerGpsJpeg(new Uint8Array())).toBeNull();
    expect(lerGpsJpeg(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
  });

  it('GPS 0,0 (celular sem satélite): null', () => {
    expect(lerGpsJpeg(jpegComGps({ lat: [0, 0, 0], lon: [0, 0, 0], latRef: 'N', lonRef: 'E' }))).toBeNull();
  });

  it('referência torta ou denominador zero: null', () => {
    expect(lerGpsJpeg(jpegComGps({ latRef: 'X' }))).toBeNull();
    expect(lerGpsJpeg(jpegComGps({ denominadorZero: true }))).toBeNull();
  });

  it('arquivo cortado no meio do Exif: null, sem erro', () => {
    const inteiro = jpegComGps();
    for (const corte of [4, 12, 30, 60, 90, 120]) {
      expect(() => lerGpsJpeg(inteiro.subarray(0, corte))).not.toThrow();
      expect(lerGpsJpeg(inteiro.subarray(0, corte))).toBeNull();
    }
  });
});
