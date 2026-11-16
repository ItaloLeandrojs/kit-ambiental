import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVADOS } from './caminhos.ts';
import { lerMalha, type Malha } from '../../src/nucleo/faixa.ts';
import { deUtm } from '../../src/nucleo/utm.ts';

const DNIT = join(PRIVADOS, 'malhas', 'DNIT.kml');
const SOP = join(PRIVADOS, 'malhas', 'SOP.kmz');

// o Ceará fica entre -41,5 e -37,2 de longitude e -7,9 e -2,7 de latitude
const noCeara = ([e, n]: [number, number]): boolean => {
  const [lon, lat] = deUtm([e, n]);
  return lon > -41.6 && lon < -37.0 && lat > -8.0 && lat < -2.6;
};

describe.skipIf(!existsSync(DNIT))('malha do DNIT', () => {
  let malha: Malha;
  let segundos = 0;
  beforeAll(() => {
    const t0 = performance.now();
    malha = lerMalha(new Uint8Array(readFileSync(DNIT)), 'DNIT.kml');
    segundos = (performance.now() - t0) / 1000;
    console.log(`DNIT: ${malha.linhas.length} linhas em ${segundos.toFixed(1)} s`);
  }, 180_000);

  it('lida em menos de 60 s, com linhas, todas no Ceará', () => {
    expect(segundos).toBeLessThan(60);
    expect(malha.linhas.length).toBeGreaterThan(0);
    expect(malha.linhas.every((l) => l.nome.startsWith('BR-'))).toBe(true);
    expect(malha.linhas.filter((l) => l.pts.some((p) => !noCeara(p)))).toEqual([]);
  }, 180_000);
});

describe.skipIf(!existsSync(SOP))('malha da SOP', () => {
  let malha: Malha;
  let segundos = 0;
  beforeAll(() => {
    const t0 = performance.now();
    malha = lerMalha(new Uint8Array(readFileSync(SOP)), 'SOP.kmz');
    segundos = (performance.now() - t0) / 1000;
    console.log(`SOP: ${malha.linhas.length} linhas em ${segundos.toFixed(1)} s`);
  }, 180_000);

  it('tem mais de 1.000 linhas, com nome de rodovia, no Ceará', () => {
    expect(malha.linhas.length).toBeGreaterThan(1000);
    expect(malha.linhas.filter((l) => !l.nome.trim())).toEqual([]);
    expect(malha.linhas.filter((l) => l.pts.some((p) => !noCeara(p)))).toEqual([]);
  }, 60_000);
});
