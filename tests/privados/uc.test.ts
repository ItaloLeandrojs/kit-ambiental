import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVADOS } from './caminhos.ts';
import { lerDxfGeometria } from '../../src/nucleo/dxf.ts';
import { proporRedeDxf } from '../../src/nucleo/rede.ts';
import { semAcento } from '../../src/nucleo/areas.ts';
import { acharUcs } from '../../src/nucleo/uc.ts';
import { PADROES_UC } from '../../src/regras/uc.ts';

const PASTA = join(PRIVADOS, 'dxf');
const ler = (nome: string) => lerDxfGeometria(new Uint8Array(readFileSync(join(PASTA, `${nome}.dxf`))));
const DXFS = ['bt-1-poste', 'bt-8-postes', 'limoeiro', 'mt-trafo'];

// Nos 4 DXFs os blocos de UC existem só na biblioteca de blocos (não aparecem no desenho) e o único
// bloco colocado com nome de UC é um `uc` a cerca de 100 km da obra: o site não pode aceitar nenhum.
describe.skipIf(!existsSync(PASTA))('UC nos DXFs reais', () => {
  for (const nome of DXFS) {
    it(`${nome}: nenhum bloco de UC perto da rede nova (o site pede o clique)`, () => {
      const d = ler(nome);
      expect(acharUcs(d, proporRedeDxf(d))).toEqual([]);
    });
  }

  it('o bloco uc distante existe em algum DXF e foi recusado por estar longe', () => {
    const comUc = DXFS.flatMap((n) => ler(n).blocos.filter((b) => PADROES_UC.some((p) => p.test(semAcento(b.nome).trim()))));
    expect(comUc.length).toBeGreaterThan(0);
  });
});
