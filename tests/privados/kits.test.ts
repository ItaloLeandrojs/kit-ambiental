// Prova contra os kits que os órgãos já aprovaram. Os números de OS, os nomes das áreas e os metros
// vêm do casos-privados/gabarito.json (fora do git), montado à mão a partir dos memoriais.
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVADOS } from './caminhos.ts';
import { FAIXA_GLOBAL, alvoETolerancia, montarCasoDoKit, type KitGabarito } from './caso-do-kit.ts';
import { lerAreasProtegidas, type BaseAreas } from '../../src/nucleo/areas.ts';
import { conferirZip } from '../../src/nucleo/conferir.ts';
import type { TipoRede } from '../../src/nucleo/tipos.ts';

const GABARITO = join(PRIVADOS, 'gabarito.json');
const KMZ = join(PRIVADOS, 'areas-protegidas.kmz');

const M2_POR_POSTE = 2.856;
const TIPOS: TipoRede[] = ['MT', 'BT', 'CONJ'];

describe.skipIf(!existsSync(GABARITO) || !existsSync(KMZ))('kits aprovados pelos órgãos', () => {
  // o Vitest roda este corpo mesmo com a suíte pulada: aqui só se lê o gabarito, e só se ele existir
  const kits: KitGabarito[] = existsSync(GABARITO) ? JSON.parse(readFileSync(GABARITO, 'utf-8')).kits : [];
  let base: BaseAreas;
  beforeAll(() => {
    base = lerAreasProtegidas(new Uint8Array(readFileSync(KMZ)), 'areas-protegidas.kmz');
  }, 120_000);

  it('o gabarito tem os 11 kits', () => {
    expect(kits).toHaveLength(11);
  });

  kits.forEach((kit, i) => {
    it(`kit ${i + 1}`, () => {
      const { bytes, caso, problemas } = montarCasoDoKit(kit, base);
      expect(problemas, 'APP sem polígono').toEqual([]);
      expect.soft(caso.avisos.filter((a) => a.nivel === 'vermelho').map((a) => a.codigo), 'caso vermelho').toEqual([]);

      const doKmz = caso.intervencoes.filter((iv) => !('largura' in iv.area));
      for (const esperado of kit.intervencoes) {
        if (esperado.nomeNoKmz === null) continue;
        const achadas = doKmz.filter((iv) => iv.area.nome === esperado.nomeNoKmz);
        expect.soft(achadas.length, `intervenção em ${esperado.nomeNoKmz}`).toBe(1);
        const iv = achadas[0];
        if (!iv) continue;
        expect.soft(iv.orgao?.gestor.split(' (')[0] ?? null, `gestor de ${esperado.nomeNoKmz}`).toBe(esperado.gestor);
        for (const t of TIPOS) {
          const { alvo, tol } = alvoETolerancia(esperado, t);
          const dif = Math.abs(iv.metros[t] - alvo);
          expect.soft(dif, `${t} em ${esperado.nomeNoKmz}: caso ${iv.metros[t].toFixed(1)} m, esperado ${alvo} m ±${tol.toFixed(1)}`).toBeLessThanOrEqual(tol);
        }
        const m2 = TIPOS.reduce((s, t) => s + Math.round(iv.metros[t]) * FAIXA_GLOBAL[t], 0) + iv.postesSemRede.length * M2_POR_POSTE;
        expect.soft(iv.hectares, `hectares de ${esperado.nomeNoKmz}`).toBeCloseTo(m2 / 10000, 8);
      }

      // área que não está no KMZ não ganha órgão: toda intervenção do KMZ tem que estar no gabarito
      const nomesEsperados = new Set(kit.intervencoes.map((x) => x.nomeNoKmz).filter((n) => n !== null));
      expect.soft(doKmz.map((iv) => iv.area.nome).filter((n) => !nomesEsperados.has(n)), 'órgão inventado').toEqual([]);

      const itens = conferirZip(bytes);
      expect.soft(itens.filter((x) => x.nivel === 'vermelho').map((x) => `${x.codigo}: ${x.titulo}`), 'conferência vermelha').toEqual([]);
      expect.soft(itens.filter((x) => x.nivel === 'amarelo' && !kit.amarelosConhecidos.includes(x.codigo)).map((x) => `${x.codigo}: ${x.titulo}`), 'amarelo novo').toEqual([]);
    }, 120_000);
  });
});
