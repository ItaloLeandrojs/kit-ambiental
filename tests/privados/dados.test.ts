import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVADOS } from './caminhos.ts';
import { lerKml } from '../../src/nucleo/kml.ts';
import { abrirZip } from '../../src/nucleo/zip.ts';

const ler = (...p: string[]): Uint8Array => new Uint8Array(readFileSync(join(PRIVADOS, ...p)));

describe.skipIf(!existsSync(PRIVADOS))('dados privados: KMZ e kits', () => {
  it('Áreas Protegidas: 1.154 feições em menos de 30 s', () => {
    const t0 = performance.now();
    const f = lerKml(ler('areas-protegidas.kmz'));
    const s = (performance.now() - t0) / 1000;
    console.log(`areas-protegidas: ${f.length} feições em ${s.toFixed(1)} s`);
    expect(f.length).toBe(1154);
    expect(s).toBeLessThan(30);
  }, 120_000);

  it('os 11 kits abrem e têm KML/KMZ e SHP', () => {
    const kits = readdirSync(join(PRIVADOS, 'kits')).filter((n) => n.endsWith('.zip'));
    expect(kits).toHaveLength(11);
    for (const kit of kits) {
      const nomes = abrirZip(ler('kits', kit)).map((a) => a.caminho.toLowerCase());
      expect(nomes.some((n) => n.endsWith('.kml') || n.endsWith('.kmz')), kit + ' sem kml/kmz').toBe(true);
      expect(nomes.some((n) => n.endsWith('.shp')), kit + ' sem shp').toBe(true);
    }
  }, 120_000);
});
