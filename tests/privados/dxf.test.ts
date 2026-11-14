import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVADOS } from './caminhos.ts';
import { lerDxfGeometria } from '../../src/nucleo/dxf.ts';

const PASTA = join(PRIVADOS, 'dxf');
const ler = (nome: string) => lerDxfGeometria(new Uint8Array(readFileSync(join(PASTA, `${nome}.dxf`))));

describe.skipIf(!existsSync(PASTA))('geometria dos DXFs reais', () => {
  it('mt-trafo tem 33 cotas e linhas LINHAMT em E entre 300.000 e 400.000', () => {
    const dxf = ler('mt-trafo');
    expect(dxf.cotas).toHaveLength(33);
    const mt = dxf.linhas.filter((l) => l.camada === 'LINHAMT');
    expect(mt.length).toBeGreaterThan(0);
    for (const l of mt) for (const [e] of l.pts) {
      expect(e).toBeGreaterThan(300000);
      expect(e).toBeLessThan(400000);
    }
  });

  it('bt-8-postes tem MTEXT com (1)AM035T26', () => {
    const dxf = ler('bt-8-postes');
    expect(dxf.textos.some((t) => t.linhas.some((l) => l.includes('(1)AM035T26')))).toBe(true);
  });

  it('limoeiro (AC1015) lê sem erro', () => {
    const dxf = ler('limoeiro');
    expect(dxf.versao).toBe('AC1015');
    expect(dxf.linhas.length + dxf.textos.length + dxf.blocos.length).toBeGreaterThan(0);
  });

  it('bt-1-poste lê sem erro', () => {
    expect(() => ler('bt-1-poste')).not.toThrow();
  });
});
