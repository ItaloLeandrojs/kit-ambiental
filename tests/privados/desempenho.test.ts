// Tempo de um clique na tela com a base real: vão, árvore e espécie, com 30 árvores perto da rede.
// Só números no log: nenhum nome de área nem número de OS sai daqui (tudo vem do gabarito).
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVADOS } from './caminhos.ts';
import { lerAreasProtegidas, type BaseAreas } from '../../src/nucleo/areas.ts';
import { lerMalha, type Malha } from '../../src/nucleo/faixa.ts';
import { abrirZip } from '../../src/nucleo/zip.ts';
import { criarEstado, type Estado } from '../../src/tela/estado.ts';
import { jpegSemExif } from '../jpeg-gps.ts';
import type { Pt } from '../../src/nucleo/tipos.ts';

const KMZ = join(PRIVADOS, 'areas-protegidas.kmz');
const DNIT = join(PRIVADOS, 'malhas', 'DNIT.kml');
const SOP = join(PRIVADOS, 'malhas', 'SOP.kmz');
const GABARITO = join(PRIVADOS, 'gabarito.json');
const META_MS = 100;
const ARVORES = 30;

const mediana = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
function tempo(f: () => void, vezes = 4): number {
  const ts: number[] = [];
  for (let i = 0; i < vezes; i++) {
    const t0 = performance.now();
    f();
    ts.push(performance.now() - t0);
  }
  return mediana(ts);
}

describe.skipIf(!existsSync(KMZ) || !existsSync(DNIT) || !existsSync(SOP) || !existsSync(GABARITO))('tempo de um clique com a base real', () => {
  const kits: { zip: string; rede: string[] }[] = existsSync(GABARITO) ? JSON.parse(readFileSync(GABARITO, 'utf-8')).kits : [];
  let base: BaseAreas;
  let malhas: Malha[];
  beforeAll(() => {
    base = lerAreasProtegidas(new Uint8Array(readFileSync(KMZ)), 'areas.kmz');
    malhas = [lerMalha(new Uint8Array(readFileSync(DNIT)), 'DNIT.kml'), lerMalha(new Uint8Array(readFileSync(SOP)), 'SOP.kmz')];
  }, 300_000);

  async function comKit(i: number): Promise<Estado | null> {
    const kit = kits[i];
    const arquivos = abrirZip(new Uint8Array(readFileSync(join(PRIVADOS, kit.zip))));
    const a = arquivos.find((x) => x.caminho === kit.rede[0]);
    if (!a) return null;
    const malhaDe = new Map(malhas.map((m) => [m.tipo, m]));
    const e = criarEstado({ lerAreas: async () => base, lerMalha: async (_b, _n, t) => malhaDe.get(t)! });
    await e.carregarKmz(new Uint8Array([1]), 'areas.kmz');
    await e.carregarMalha(new Uint8Array([1]), 'DNIT.kml', 'DNIT');
    await e.carregarMalha(new Uint8Array([1]), 'SOP.kmz', 'SOP');
    await e.carregarProjeto(a.bytes, a.caminho.slice(a.caminho.lastIndexOf('/') + 1), '0000000001');
    const r = e.ler();
    if (!r.caso || !r.rede || r.rede.vaos.length === 0) return null;
    // 30 árvores ao longo da rede, a 5 m do vão
    const pts: Pt[] = r.rede.vaos.flatMap((v) => v.pts);
    const ids = e.adicionarFotos(Array.from({ length: ARVORES }, (_, k) => ({ nome: `f${k}.jpg`, bytes: jpegSemExif() })));
    ids.forEach((id, k) => {
      const p = pts[Math.floor((k * pts.length) / ARVORES)];
      e.colocarArvore(id);
      e.clicarNoMapa([p[0] + 5, p[1] + 5]);
    });
    expect(e.ler().arvores.filter((x) => x.ponto !== null)).toHaveLength(ARVORES);
    return e;
  }

  kits.forEach((_, i) => {
    it(`kit ${i + 1}: clique no vão, no mapa e na espécie com ${ARVORES} árvores`, async () => {
      const e = await comKit(i);
      if (!e) return; // kit sem vão de rede (só poste): nada a clicar
      const vao = e.ler().rede!.vaos[0].id;
      let k = 0;
      const tTipo = tempo(() => e.marcarVao(vao, { tipo: ++k % 2 ? 'BT' : 'MT', situacao: 'novo' })); // troca só o tipo
      const tVao = tempo(() => e.marcarVao(vao, { situacao: ++k % 2 ? 'existente' : 'novo' })); // tira e põe o vão na rede nova
      const arvore = e.ler().arvores[0];
      const tArvore = tempo(() => { e.colocarArvore(arvore.id); e.clicarNoMapa([arvore.ponto![0] + 1, arvore.ponto![1]]); });
      let n = 0;
      const tEspecie = tempo(() => e.mudarArvore(arvore.id, { especie: `Espécie ${++n}` }));
      console.log(`kit ${i + 1}: ${e.ler().rede!.vaos.length} vãos; tipo do vão ${tTipo.toFixed(0)} ms, tirar ou pôr o vão ${tVao.toFixed(0)} ms, árvore no mapa ${tArvore.toFixed(0)} ms, espécie ${tEspecie.toFixed(1)} ms`);
      expect(tEspecie).toBeLessThan(META_MS);
      expect(tArvore).toBeLessThan(META_MS * 5);
    }, 120_000);
  });
});
