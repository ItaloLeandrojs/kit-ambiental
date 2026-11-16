// GPS de dentro de um JPEG (APP1/Exif). Escrito à mão: nada de biblioteca, nada sai do navegador.
// Qualquer coisa fora do esperado (não é JPEG, sem Exif, sem GPS, valor fora da faixa, arquivo cortado) dá `null`.

const TAG_GPS_IFD = 0x8825;
const TAG_LAT_REF = 0x0001, TAG_LAT = 0x0002, TAG_LON_REF = 0x0003, TAG_LON = 0x0004;
const TIPO_ASCII = 2, TIPO_RACIONAL = 5;

const igual = (b: Uint8Array, i: number, texto: string): boolean => {
  for (let k = 0; k < texto.length; k++) if (b[i + k] !== texto.charCodeAt(k)) return false;
  return true;
};

interface Entrada { tipo: number; contagem: number; posicao: number } // posicao = onde estão os bytes do valor

function lerIfd(v: DataView, deslocamento: number, intel: boolean): Map<number, Entrada> | null {
  const mapa = new Map<number, Entrada>();
  if (deslocamento < 0 || deslocamento + 2 > v.byteLength) return null;
  const n = v.getUint16(deslocamento, intel);
  if (deslocamento + 2 + n * 12 > v.byteLength) return null;
  for (let i = 0; i < n; i++) {
    const e = deslocamento + 2 + i * 12;
    const tipo = v.getUint16(e + 2, intel);
    const contagem = v.getUint32(e + 4, intel);
    const tamanho = tipo === TIPO_RACIONAL ? 8 * contagem : tipo === TIPO_ASCII ? contagem : 0;
    // até 4 bytes o valor fica na própria entrada; senão a entrada guarda o deslocamento
    const posicao = tamanho <= 4 ? e + 8 : v.getUint32(e + 8, intel);
    mapa.set(v.getUint16(e, intel), { tipo, contagem, posicao });
  }
  return mapa;
}

function graus(v: DataView, e: Entrada | undefined, intel: boolean): number | null {
  if (!e || e.tipo !== TIPO_RACIONAL || e.contagem < 3 || e.posicao < 0 || e.posicao + 24 > v.byteLength) return null;
  const parte = (i: number): number | null => {
    const num = v.getUint32(e.posicao + i * 8, intel);
    const den = v.getUint32(e.posicao + i * 8 + 4, intel);
    return den === 0 ? null : num / den;
  };
  const g = parte(0), m = parte(1), s = parte(2);
  return g === null || m === null || s === null ? null : g + m / 60 + s / 3600;
}

function referencia(v: DataView, e: Entrada | undefined): string | null {
  if (!e || e.tipo !== TIPO_ASCII || e.contagem < 1 || e.posicao < 0 || e.posicao >= v.byteLength) return null;
  return String.fromCharCode(v.getUint8(e.posicao)).toUpperCase();
}

function gpsDoTiff(b: Uint8Array, ini: number, fim: number): { lon: number; lat: number } | null {
  if (fim - ini < 8) return null;
  const v = new DataView(b.buffer, b.byteOffset + ini, fim - ini);
  const intel = igual(b, ini, 'II') ? true : igual(b, ini, 'MM') ? false : null;
  if (intel === null || v.getUint16(2, intel) !== 42) return null;
  const ifd0 = lerIfd(v, v.getUint32(4, intel), intel);
  const ponteiro = ifd0?.get(TAG_GPS_IFD);
  if (!ponteiro) return null;
  const gps = lerIfd(v, v.getUint32(ponteiro.posicao, intel), intel);
  if (!gps) return null;
  const lat = graus(v, gps.get(TAG_LAT), intel);
  const lon = graus(v, gps.get(TAG_LON), intel);
  const refLat = referencia(v, gps.get(TAG_LAT_REF));
  const refLon = referencia(v, gps.get(TAG_LON_REF));
  if (lat === null || lon === null || (refLat !== 'N' && refLat !== 'S') || (refLon !== 'E' && refLon !== 'W')) return null;
  const r = { lat: refLat === 'S' ? -lat : lat, lon: refLon === 'W' ? -lon : lon };
  if (Math.abs(r.lat) > 90 || Math.abs(r.lon) > 180) return null;
  if (r.lat === 0 && r.lon === 0) return null; // 0,0 é o que o celular grava quando não achou o satélite
  return r;
}

/** Lê o GPS (graus decimais) do Exif de um JPEG. Não JPEG, sem GPS ou com GPS 0,0: `null`. */
export function lerGpsJpeg(bytes: Uint8Array): { lon: number; lat: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  try {
    let i = 2;
    while (i + 4 <= bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marca = bytes[i + 1];
      if (marca === 0xff) { i++; continue; } // enchimento
      if (marca === 0xda || marca === 0xd9) return null; // começou a imagem: não há mais cabeçalhos
      const tamanho = (bytes[i + 2] << 8) | bytes[i + 3];
      if (tamanho < 2) return null;
      const fim = Math.min(i + 2 + tamanho, bytes.length);
      if (marca === 0xe1 && igual(bytes, i + 4, 'Exif\0\0')) {
        const r = gpsDoTiff(bytes, i + 10, fim);
        if (r) return r;
      }
      i += 2 + tamanho;
    }
  } catch {
    return null; // arquivo cortado ou torto
  }
  return null;
}
