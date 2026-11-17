// Polígonos inválidos do KMZ real: a leitura conserta, e nenhuma área nem água lança no cruzamento ou na APP.
// Só contagens e porcentagens no log: nenhum nome de área sai daqui.
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVADOS } from './caminhos.ts';
import { ehAgua, lerAreasProtegidas, TOL_AVISO_CONSERTO, TOL_CONSERTO, type AreaProtegida, type BaseAreas } from '../../src/nucleo/areas.ts';
import { calcularCaso } from '../../src/nucleo/caso.ts';
import { refazerApp, type AppProposta } from '../../src/nucleo/app.ts';
import { G } from '../../src/nucleo/geom.ts';
import { LARGURA_APP } from '../../src/regras/faixas.ts';
import type { Pt, Rede, Vao } from '../../src/nucleo/tipos.ts';

const KMZ = join(PRIVADOS, 'areas-protegidas.kmz');

const areaDe = (a: AreaProtegida): number => a.poligonos.reduce((s, an) => s + G.area(G.poligono(an)), 0);
const invalida = (a: AreaProtegida): boolean => a.poligonos.some((an) => !G.valido(G.poligono(an)));

// seis vãos MT novos atravessando a caixa da área: três na horizontal e três na vertical
function redeQueAtravessa(a: AreaProtegida): Rede {
  const [x0, y0, x1, y1] = a.caixa;
  const vaos: Vao[] = [];
  for (const f of [0.25, 0.5, 0.75]) {
    const y = y0 + f * (y1 - y0);
    const x = x0 + f * (x1 - x0);
    vaos.push({ id: `h${f}`, pts: [[x0 - 20, y], [x1 + 20, y]] as Pt[], camada: 'MT', tipo: 'MT', situacao: 'novo', motivo: '' });
    vaos.push({ id: `v${f}`, pts: [[x, y0 - 20], [x, y1 + 20]] as Pt[], camada: 'MT', tipo: 'MT', situacao: 'novo', motivo: '' });
  }
  return { origem: 'dxf', vaos, postes: [] };
}
const so = (base: BaseAreas, a: AreaProtegida): BaseAreas => ({ ...base, areas: [a], municipios: [] });
const naoConferida = (base: BaseAreas, a: AreaProtegida): boolean =>
  calcularCaso(redeQueAtravessa(a), so(base, a), []).avisos.some((x) => x.codigo === 'AREA_NAO_CONFERIDA');
function appSemDesenho(a: AreaProtegida): boolean {
  const tipo = ehAgua(a);
  if (tipo === null) return false;
  // o recorte da APP é a caixa da rede + 500 m: aqui, a caixa da água + 500 m
  const caixa: [number, number, number, number] = [a.caixa[0] - 500, a.caixa[1] - 500, a.caixa[2] + 500, a.caixa[3] + 500];
  const p: AppProposta = { agua: a, largura: LARGURA_APP[tipo], poligonos: [], porque: '', caixa };
  return refazerApp(p, LARGURA_APP[tipo]).semDesenho === true;
}

describe.skipIf(!existsSync(KMZ))('KMZ real: conserto dos polígonos', () => {
  let cru: BaseAreas;
  let consertada: BaseAreas;
  beforeAll(() => {
    const bytes = new Uint8Array(readFileSync(KMZ));
    let t0 = performance.now();
    cru = lerAreasProtegidas(bytes, 'areas.kmz', { consertar: false });
    const tCru = performance.now() - t0;
    t0 = performance.now();
    consertada = lerAreasProtegidas(bytes, 'areas.kmz');
    console.log(`leitura do KMZ: ${(tCru / 1000).toFixed(1)} s sem conserto, ${((performance.now() - t0) / 1000).toFixed(1)} s com conserto`);
  }, 180_000);

  it('o conserto deixa todo polígono válido, sem defeito, e muda a área pouco', () => {
    const todasCru = [...cru.areas, ...cru.municipios];
    const todas = [...consertada.areas, ...consertada.municipios];
    expect(todas).toHaveLength(todasCru.length);
    const poligonosCru = todasCru.reduce((s, a) => s + a.poligonos.length, 0);
    const invalidosCru = todasCru.flatMap((a) => a.poligonos).filter((an) => !G.valido(G.poligono(an))).length;
    const consertadas = todasCru.map((a, i) => ({ a, b: todas[i] })).filter(({ a }) => invalida(a));
    const difs = consertadas.map(({ a, b }) => (areaDe(b) - areaDe(a)) / areaDe(a));
    const pct = (x: number) => `${(100 * x).toFixed(2)}%`;
    console.log(`polígonos: ${poligonosCru}; inválidos antes: ${invalidosCru} em ${consertadas.length} áreas (${consertadas.filter(({ a }) => ehAgua(a) !== null).length} águas); `
      + `inválidos depois: ${todas.filter(invalida).length}; com defeito: ${todas.filter((a) => a.defeito).length}`);
    console.log(`diferença de área nas áreas consertadas: maior ${pct(Math.max(...difs.map(Math.abs)))}, média ${pct(difs.reduce((s, d) => s + Math.abs(d), 0) / difs.length)}, `
      + `${difs.filter((d) => Math.abs(d) < 0.0001).length} de ${difs.length} abaixo de 0,01%; soma das áreas consertadas: ${pct(consertadas.reduce((s, { b }) => s + areaDe(b), 0) / consertadas.reduce((s, { a }) => s + areaDe(a), 0) - 1)}`);
    // amarelo AREA_CONSERTADA: áreas cujo conserto mudou a área além de 0,5%
    const marcadas = todas.filter((a) => a.consertoGrande !== undefined);
    console.log(`marcadas com consertoGrande (> ${pct(TOL_AVISO_CONSERTO)}): ${marcadas.length} áreas (${consertada.areas.filter((a) => a.consertoGrande !== undefined && ehAgua(a) !== null).length} águas, `
      + `${consertada.municipios.filter((a) => a.consertoGrande !== undefined).length} municípios); maior ${marcadas.length ? pct(Math.max(...marcadas.map((a) => a.consertoGrande!))) : '-'}`);
    for (const a of marcadas) {
      expect(a.consertoGrande!).toBeGreaterThan(TOL_AVISO_CONSERTO);
      expect(a.consertoGrande!).toBeLessThanOrEqual(TOL_CONSERTO);
      expect(invalida(todasCru[todas.indexOf(a)])).toBe(true); // só polígono que veio inválido ganha a marca
      // o caso mede só até os pedaços consertados: a lista existe e aponta para polígonos da área
      expect(a.poligonosConsertados!.length).toBeGreaterThan(0);
      for (const i of a.poligonosConsertados!) expect(a.poligonos[i]).toBeDefined();
    }
    expect(todas.filter(invalida)).toHaveLength(0);
    expect(todas.filter((a) => a.defeito)).toHaveLength(0);
    for (const d of difs) expect(Math.abs(d)).toBeLessThanOrEqual(TOL_CONSERTO);
  }, 120_000);

  it('sem o conserto, a mesma prova acha áreas que não puderam ser conferidas (a prova pega o erro)', () => {
    const ruins = cru.areas.filter(invalida);
    const caso = ruins.filter((a) => ehAgua(a) === null && naoConferida(cru, a)).length;
    const app = ruins.filter((a) => appSemDesenho(a)).length;
    console.log(`sem conserto: ${caso} áreas não conferidas no caso e ${app} APPs sem desenho, das ${ruins.length} áreas inválidas`);
    expect(caso + app).toBeGreaterThan(0);
  }, 180_000);

  it('com o conserto, nenhuma área lança no cruzamento e nenhuma água lança na APP', () => {
    const t0 = performance.now();
    const naoConferidas = consertada.areas.filter((a) => a.poligonos.length > 0 && naoConferida(consertada, a));
    const t1 = performance.now();
    const semDesenho = consertada.areas.filter(appSemDesenho);
    console.log(`cruzamento de ${consertada.areas.filter((a) => a.poligonos.length > 0).length} áreas em ${((t1 - t0) / 1000).toFixed(1)} s; `
      + `APP de ${consertada.areas.filter((a) => ehAgua(a) !== null).length} águas em ${((performance.now() - t1) / 1000).toFixed(1)} s`);
    expect(naoConferidas.length).toBe(0);
    expect(semDesenho.length).toBe(0);
  }, 300_000);
});
