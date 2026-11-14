import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVADOS } from './caminhos.ts';
import { lerDxfGeometria } from '../../src/nucleo/dxf.ts';
import { G } from '../../src/nucleo/geom.ts';
import { proporRedeDxf, redeNova } from '../../src/nucleo/rede.ts';

const PASTA = join(PRIVADOS, 'dxf');
const ler = (nome: string) => lerDxfGeometria(new Uint8Array(readFileSync(join(PASTA, `${nome}.dxf`))));
const metros = (r: ReturnType<typeof redeNova>) => r.reduce((s, v) => s + G.comprimento(G.linha(v.pts)), 0);

describe.skipIf(!existsSync(PASTA))('proposta da rede nos DXFs reais', () => {
  it('mt-trafo: a soma dos vãos MT novos fica entre 2.178 e 2.185 m', () => {
    const r = proporRedeDxf(ler('mt-trafo'));
    const mt = metros(redeNova(r).filter((v) => v.tipo === 'MT'));
    expect(mt).toBeGreaterThanOrEqual(2178);
    expect(mt).toBeLessThanOrEqual(2185);
  });

  it('bt-8-postes: vãos BT novos = textos que começam com (1)AM035', () => {
    const d = ler('bt-8-postes');
    const textos = d.textos.filter((t) => (t.linhas[0] ?? '').startsWith('(1)AM035')).length;
    const bt = redeNova(proporRedeDxf(d)).filter((v) => v.tipo === 'BT').length;
    expect(bt).toBe(textos);
  });

  it('bt-1-poste: um só poste novo', () => {
    const r = proporRedeDxf(ler('bt-1-poste'));
    expect(r.postes.filter((p) => p.novo)).toHaveLength(1);
  });
});
