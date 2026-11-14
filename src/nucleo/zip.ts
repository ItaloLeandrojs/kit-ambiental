import { unzipSync, zipSync } from 'fflate';

export interface ArquivoZip { caminho: string; bytes: Uint8Array }

const ERRO_ZIP = 'Este arquivo não é um zip';

// Metade alta (0x80 a 0xFF) da página de código cp850, usada pelo Windows antigo nos nomes sem a marca de UTF-8.
const CP850_ALTA =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀' +
  'ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ';

const doCp850 = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += b < 0x80 ? String.fromCharCode(b) : CP850_ALTA[b - 0x80];
  return s;
};
const emLatin1 = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
};

// O fflate entrega nomes sem a marca de UTF-8 lidos como latin1. Aqui acho esses nomes no diretório central
// e devolvo o mapa "nome em latin1" -> "nome em cp850".
function nomesCp850(bytes: Uint8Array): Map<string, string> {
  const mapa = new Map<string, string>();
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return mapa;
  let pos = dv.getUint32(eocd + 16, true);
  const total = dv.getUint16(eocd + 10, true);
  for (let n = 0; n < total && pos + 46 <= bytes.length && dv.getUint32(pos, true) === 0x02014b50; n++) {
    const flags = dv.getUint16(pos + 8, true);
    const tamNome = dv.getUint16(pos + 28, true);
    const tamExtra = dv.getUint16(pos + 30, true);
    const tamComent = dv.getUint16(pos + 32, true);
    const nome = bytes.subarray(pos + 46, pos + 46 + tamNome);
    if (!(flags & 0x800) && nome.some((b) => b >= 0x80)) mapa.set(emLatin1(nome), doCp850(nome));
    pos += 46 + tamNome + tamExtra + tamComent;
  }
  return mapa;
}

const ehZip = (nome: string): boolean => nome.toLowerCase().endsWith('.zip');

function abrir(bytes: Uint8Array, prefixo: string, saida: ArquivoZip[], nivel: number): void {
  let dentro: Record<string, Uint8Array>;
  try {
    dentro = unzipSync(bytes);
  } catch {
    throw new Error(ERRO_ZIP);
  }
  const remapa = nomesCp850(bytes);
  for (const [nomeBruto, conteudo] of Object.entries(dentro)) {
    if (nomeBruto.endsWith('/')) continue; // pasta (vazia ou não): só os arquivos contam
    const nome = remapa.get(nomeBruto) ?? nomeBruto;
    const caminho = prefixo + nome;
    if (ehZip(nome) && nivel < 8) {
      try {
        abrir(conteudo, caminho + '/', saida, nivel + 1);
        continue;
      } catch {
        // não era um zip de verdade: fica como arquivo comum
      }
    }
    saida.push({ caminho, bytes: conteudo });
  }
}

/** Abre o zip e os zips de dentro dele. Os caminhos se juntam com "/". */
export function abrirZip(bytes: Uint8Array): ArquivoZip[] {
  const saida: ArquivoZip[] = [];
  abrir(bytes, '', saida, 0);
  return saida;
}

/** Grava o zip com nomes em UTF-8 (o fflate liga o bit 11 quando o nome tem acento). */
export function montarZip(arquivos: ArquivoZip[]): Uint8Array {
  const entradas: Record<string, Uint8Array> = {};
  for (const a of arquivos) entradas[a.caminho] = a.bytes;
  return zipSync(entradas);
}
