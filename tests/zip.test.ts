import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { abrirZip, montarZip } from '../src/nucleo/zip.ts';

// Zip com o nome em cp850 e sem a marca de UTF-8: grava um nome ASCII e troca o byte pelo 0x80 (Ç em cp850).
function zipCp850(): Uint8Array {
  const z = zipSync({ 'A_UDE.kml': strToU8('<kml/>') });
  const nome = strToU8('A_UDE.kml');
  for (let i = 0; i < z.length - nome.length; i++) {
    if (nome.every((b, k) => z[i + k] === b)) z[i + 1] = 0x80;
  }
  return z;
}

describe('abrirZip', () => {
  it('abre zip dentro de zip e junta os caminhos com /', () => {
    const interno = zipSync({ 'KML/REDE.kml': strToU8('<kml/>'), 'LEIA.txt': strToU8('x') });
    const externo = zipSync({ 'MODELOS/kit.zip': interno, 'MODELOS/vazia/': new Uint8Array(0) });
    const a = abrirZip(externo);
    expect(a.map((x) => x.caminho).sort()).toEqual(['MODELOS/kit.zip/KML/REDE.kml', 'MODELOS/kit.zip/LEIA.txt']);
    expect(new TextDecoder().decode(a.find((x) => x.caminho.endsWith('REDE.kml'))!.bytes)).toBe('<kml/>');
  });

  it('lê em cp850 o nome sem a marca de UTF-8', () => {
    const externo = zipSync({ 'kit.zip': zipCp850(), 'dir/B.txt': strToU8('b') });
    expect(abrirZip(externo).map((x) => x.caminho).sort()).toEqual(['dir/B.txt', 'kit.zip/AÇUDE.kml']);
  });

  it('não é zip: erro exato', () => {
    expect(() => abrirZip(strToU8('texto qualquer'))).toThrow('Este arquivo não é um zip');
  });
});

describe('montarZip', () => {
  it('grava UTF-8 com o bit 11 ligado e volta igual', () => {
    const z = montarZip([{ caminho: 'KML/AÇUDE.kml', bytes: strToU8('oi') }]);
    const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
    expect(dv.getUint16(6, true) & 0x800).toBe(0x800);
    expect(abrirZip(z).map((x) => x.caminho)).toEqual(['KML/AÇUDE.kml']);
  });
});
