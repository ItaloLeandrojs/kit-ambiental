// Prova contra os kits que os órgãos já aprovaram. Os números de OS, os nomes das áreas e os metros
// vêm do casos-privados/gabarito.json (fora do git), montado à mão a partir dos memoriais.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVADOS } from './caminhos.ts';
import { abrirZip, type ArquivoZip } from '../../src/nucleo/zip.ts';
import { lerKml } from '../../src/nucleo/kml.ts';
import { proporRedeKml } from '../../src/nucleo/rede.ts';
import { lerAreasProtegidas } from '../../src/nucleo/areas.ts';
import { calcularCaso, type AreaConfirmada } from '../../src/nucleo/caso.ts';
import { conferirZip } from '../../src/nucleo/conferir.ts';
import type { Pt, TipoRede } from '../../src/nucleo/tipos.ts';

const GABARITO = join(PRIVADOS, 'gabarito.json');
const KMZ = join(PRIVADOS, 'areas-protegidas.kmz');

interface IntervencaoGabarito {
  nomeNoMemorial: string;
  nomeNoKmz: string | null;
  gestor: string | null;
  metrosMemorial: Partial<Record<TipoRede, number>>;
  haMemorial: number;
  metrosKml?: Partial<Record<TipoRede, number>>;
  fonte: string;
}
interface KitGabarito {
  zip: string;
  rede: string[];
  appsDoKit: string[];
  intervencoes: IntervencaoGabarito[];
  divergencias: string[];
  amarelosConhecidos: string[];
}

// regra global do desenho, escrita aqui de novo para o teste não depender de src/regras
const FAIXA_GLOBAL: Record<TipoRede, number> = { MT: 6, BT: 3, CONJ: 6 };
const M2_POR_POSTE = 2.856;
const TIPOS: TipoRede[] = ['MT', 'BT', 'CONJ'];
const LARGURA_NAO_USADA = 0; // a APP já vem desenhada no kit; o caso não usa a largura

const nomeDoArquivo = (caminho: string): string => caminho.slice(caminho.lastIndexOf('/') + 1).replace(/\.km[lz]$/i, '');

describe.skipIf(!existsSync(GABARITO) || !existsSync(KMZ))('kits aprovados pelos órgãos', () => {
  const kits: KitGabarito[] = existsSync(GABARITO) ? JSON.parse(readFileSync(GABARITO, 'utf-8')).kits : [];
  const base = lerAreasProtegidas(new Uint8Array(readFileSync(KMZ)), 'areas-protegidas.kmz');

  it('o gabarito tem os 11 kits', () => {
    expect(kits).toHaveLength(11);
  });

  kits.forEach((kit, i) => {
    it(`kit ${i + 1}`, () => {
      const bytes = new Uint8Array(readFileSync(join(PRIVADOS, kit.zip)));
      const arquivos = abrirZip(bytes);
      const pega = (caminho: string): ArquivoZip => {
        const a = arquivos.find((x) => x.caminho === caminho);
        if (!a) throw new Error(`não achei no zip: ${caminho}`);
        return a;
      };

      // a rede: só o que está dentro dos KMLs, sem o nome do arquivo (a tela vai passar o nome como pasta de cima)
      const rede = proporRedeKml(kit.rede.flatMap((c) => lerKml(pega(c).bytes)));

      // as APPs aprovadas no kit, aceitas como estão desenhadas
      const confirmadas: AreaConfirmada[] = kit.appsDoKit.map((c) => {
        const poligonos: Pt[][][] = lerKml(pega(c).bytes).flatMap((f) =>
          f.geometrias.flatMap((g) => (g.t === 'poligono' ? [g.aneis] : [])),
        );
        expect(poligonos.length, `APP sem polígono: ${c}`).toBeGreaterThan(0);
        return { nome: nomeDoArquivo(c), tipo: 'APP', poligonos, largura: LARGURA_NAO_USADA };
      });

      const caso = calcularCaso(rede, base, confirmadas);
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
          const alvo = esperado.metrosKml ? (esperado.metrosKml[t] ?? 0) : (esperado.metrosMemorial[t] ?? 0);
          const tol = esperado.metrosKml ? 1 : Math.max(2, 0.03 * alvo);
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
