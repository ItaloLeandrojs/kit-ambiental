import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVADOS } from './caminhos.ts';
import { lerDxfGeometria } from '../../src/nucleo/dxf.ts';
import { lerAreasProtegidas, type BaseAreas } from '../../src/nucleo/areas.ts';
import { proporRedeDxf } from '../../src/nucleo/rede.ts';
import { conferirEtiquetas, conferirLocal } from '../../src/nucleo/local.ts';

const KMZ = join(PRIVADOS, 'areas-protegidas.kmz');
const rede = (nome: string) => proporRedeDxf(lerDxfGeometria(new Uint8Array(readFileSync(join(PRIVADOS, 'dxf', `${nome}.dxf`)))));

describe.skipIf(!existsSync(KMZ))('desenho no lugar certo nos casos reais', () => {
  let base: BaseAreas;
  beforeAll(() => {
    base = lerAreasProtegidas(new Uint8Array(readFileSync(KMZ)), 'ÁREAS PROTEGIDAS ESTADO DO CEARÁ - Rev. 37 - 12.11.2024.kmz');
  }, 120000);

  it('bt-8-postes: ETIQUETA_LONGE entre 850 e 920 m', () => {
    const { aviso, distancia } = conferirEtiquetas(rede('bt-8-postes'));
    expect(aviso?.codigo).toBe('ETIQUETA_LONGE');
    expect(distancia).toBeGreaterThanOrEqual(850);
    expect(distancia).toBeLessThanOrEqual(920);
  });

  it.each(['bt-1-poste', 'mt-trafo'])('%s: nenhum aviso', (nome) => {
    const r = rede(nome);
    expect(conferirEtiquetas(r).aviso).toBeNull();
    expect(conferirLocal(r, base.municipios)).toBeNull();
  });
});
