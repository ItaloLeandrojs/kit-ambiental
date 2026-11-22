// Grava casos-privados/tmp/exemplo.docx com dados inventados, para abrir no Word e conferir.
// Uso: npx rolldown scripts/docx-exemplo.ts --platform node --format esm --file casos-privados/tmp/docx-exemplo.mjs
//      node casos-privados/tmp/docx-exemplo.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { gravarDocx, type Documento } from '../src/nucleo/docx';
import type { Imagem } from '../src/nucleo/obra';

// PNG de verdade (cinza liso), para o Word conseguir desenhar.
function crc32(b: Uint8Array): number {
  let c, crc = 0xffffffff;
  for (let i = 0; i < b.length; i++) {
    c = (crc ^ b[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pedaco(tipo: string, dados: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + dados.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, dados.length);
  for (let i = 0; i < 4; i++) out[4 + i] = tipo.charCodeAt(i);
  out.set(dados, 8);
  dv.setUint32(8 + dados.length, crc32(out.subarray(4, 8 + dados.length)));
  return out;
}
function png(largura: number, altura: number, cinza: number): Imagem {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, largura);
  dv.setUint32(4, altura);
  ihdr.set([8, 0, 0, 0, 0], 8); // 8 bits, tons de cinza
  const linha = new Uint8Array(1 + largura).fill(cinza);
  linha[0] = 0;
  const cru = new Uint8Array(linha.length * altura);
  for (let y = 0; y < altura; y++) cru.set(linha, y * linha.length);
  const partes = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pedaco('IHDR', ihdr), pedaco('IDAT', deflateSync(cru)), pedaco('IEND', new Uint8Array(0))];
  const bytes = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of partes) { bytes.set(p, o); o += p.length; }
  return { bytes, tipo: 'png', largura, altura };
}

const nome = 'Fulano & Filhos <Ltda> "ME" d\'Água';
const doc: Documento = {
  cabecalho: { linhas: ['Empresa Exemplo Ltda', 'CNPJ 00.000.000/0001-00', 'Rua Exemplo, 100 - Cidade Exemplo'], logo: png(300, 100, 0x70) },
  blocos: [
    { t: 'titulo', textos: [{ texto: 'MEMORIAL DESCRITIVO DE EXEMPLO' }] },
    { t: 'secao', texto: '1. Identificação' },
    { t: 'paragrafo', textos: [{ texto: `Cliente: ${nome}. Obra com ` }, { texto: '1.036 metros', negrito: true }, { texto: ' de rede, ' }, { texto: '[PREENCHER: dado pendente]', amarelo: true }, { texto: '.' }] },
    { t: 'secao', texto: '2. Quadro' },
    { t: 'tabela', cabecalho: ['Trecho', 'Tipo', 'Metros'], linhas: [[[{ texto: 'T1' }], [{ texto: 'MT' }], [{ texto: '120' }]], [[{ texto: 'T2' }], [{ texto: 'BT' }], [{ texto: '916', negrito: true }]]] },
    { t: 'figura', numero: 1, legenda: 'Planta de exemplo', imagem: png(400, 200, 0xc0) },
    { t: 'figura', numero: 2, legenda: 'Figura pendente', imagem: null },
    { t: 'assinatura', nome: 'Fulano de Tal', registro: 'Registro 000000/D', rnp: 'RNP 0000000000', imagem: png(200, 80, 0x40), nota: null },
  ],
};

mkdirSync('casos-privados/tmp', { recursive: true });
writeFileSync('casos-privados/tmp/exemplo.docx', gravarDocx(doc));
console.log('gravado casos-privados/tmp/exemplo.docx');
