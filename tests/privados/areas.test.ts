import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVADOS } from './caminhos.ts';
import { lerKml } from '../../src/nucleo/kml.ts';
import { lerAreasProtegidas, orgaoDaArea, semAcento } from '../../src/nucleo/areas.ts';

const KMZ = join(PRIVADOS, 'areas-protegidas.kmz');
const NOME_ORIGINAL = 'ÁREAS PROTEGIDAS ESTADO DO CEARÁ - Rev. 37 - 12.11.2024.kmz';

describe.skipIf(!existsSync(KMZ))('KMZ de Áreas Protegidas (Rev. 37)', () => {
  const bytes = new Uint8Array(readFileSync(KMZ));
  const base = lerAreasProtegidas(bytes, NOME_ORIGINAL);

  it('conta municípios e áreas e lê a revisão', () => {
    const feicoes = lerKml(bytes);
    const comGeo = feicoes.filter((f) => f.geometrias.some((g) => g.t !== 'ponto'));
    const deMunicipio = comGeo.filter((f) => f.pasta.some((p) => semAcento(p).startsWith('MUNICIPIOS')));
    expect(base.municipios).toHaveLength(184);
    expect(base.areas).toHaveLength(comGeo.length - deMunicipio.length);
    expect(base.revisao).toBe('37');
    expect(base.data).toBe('12/11/2024');
  });

  it('nenhuma área nem município com nome vazio', () => {
    expect([...base.areas, ...base.municipios].filter((a) => !a.nome.trim())).toEqual([]);
  });

  it('toda área das pastas da tabela tem órgão', () => {
    const trechos = ['UNIDADE DE CONSERVACAO', 'QUILOMBOLA', 'ASSENTAMENTO', 'TERRAS INDIGENAS', 'IPHAN', 'DNOCS', 'MACROZONEAMENTO'];
    const alvo = base.areas.filter((a) => a.pasta.some((p) => trechos.some((t) => semAcento(p).includes(t))));
    expect(alvo.length).toBeGreaterThan(0);
    expect(alvo.filter((a) => !orgaoDaArea(a))).toEqual([]);
  });

  it('Corredor e Serra do Visgueiro ficam sem órgão', () => {
    const alvo = base.areas.filter((a) => a.pasta.some((p) => /CORREDOR|VISGUEIRO/.test(semAcento(p))));
    expect(alvo.length).toBeGreaterThan(0);
    expect(alvo.filter((a) => orgaoDaArea(a) !== null)).toEqual([]);
  });
});
