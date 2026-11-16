import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVADOS } from './caminhos.ts';
import { avisosFaixa, lerMalha, type Malha } from '../../src/nucleo/faixa.ts';
import { abrirZip } from '../../src/nucleo/zip.ts';
import { lerKml } from '../../src/nucleo/kml.ts';
import { proporRedeKml } from '../../src/nucleo/rede.ts';
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

// os kits aprovados (mesma fonte do kits.test.ts): só confere que a conta não lança e que é rápida
const GABARITO = join(PRIVADOS, 'gabarito.json');
describe.skipIf(!existsSync(DNIT) || !existsSync(SOP) || !existsSync(GABARITO))('faixa de domínio nos kits aprovados', () => {
  const kits: { zip: string; rede: string[] }[] = existsSync(GABARITO) ? JSON.parse(readFileSync(GABARITO, 'utf-8')).kits : [];
  let malhas: Malha[] = [];
  beforeAll(() => {
    malhas = [lerMalha(new Uint8Array(readFileSync(DNIT)), 'DNIT.kml'), lerMalha(new Uint8Array(readFileSync(SOP)), 'SOP.kmz')];
  }, 180_000);

  kits.forEach((kit, i) => {
    it(`kit ${i + 1}: avisosFaixa não lança e leva menos de 3 s`, () => {
      const arquivos = abrirZip(new Uint8Array(readFileSync(join(PRIVADOS, kit.zip))));
      const rede = proporRedeKml(kit.rede.flatMap((c) => lerKml(arquivos.find((x) => x.caminho === c)!.bytes)));
      const t0 = performance.now();
      const avisos = avisosFaixa(rede, malhas);
      const ms = performance.now() - t0;
      console.log(`faixa kit ${i + 1}: ${avisos.filter((a) => a.codigo === 'FAIXA_DOMINIO').length} avisos de faixa, ${ms.toFixed(0)} ms`);
      expect(ms).toBeLessThan(3000);
    }, 60_000);
  });
});
