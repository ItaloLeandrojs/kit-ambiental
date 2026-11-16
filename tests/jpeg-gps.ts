import { deUtm } from '../src/nucleo/utm.ts';

// Monta, byte a byte, um JPEG mínimo com Exif e GPS (só para os testes; nenhuma foto real).
export type Dms = [number, number, number]; // graus, minutos, segundos

export interface OpcoesJpeg {
  ordem?: 'MM' | 'II';
  latRef?: string;
  lat?: Dms;
  lonRef?: string;
  lon?: Dms;
  denominadorZero?: boolean;
}

export function jpegComGps(o: OpcoesJpeg = {}): Uint8Array {
  const intel = o.ordem === 'II';
  const { latRef = 'S', lat = [3, 43, 12], lonRef = 'W', lon = [38, 30, 0] } = o;
  const tiff: number[] = [];
  const u16 = (n: number) => (intel ? [n & 255, n >> 8] : [n >> 8, n & 255]);
  const u32 = (n: number) => (intel ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255] : [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
  const ascii = (c: string) => [c.charCodeAt(0), 0, 0, 0];
  const entrada = (tag: number, tipo: number, n: number, valor: number[]) => [...u16(tag), ...u16(tipo), ...u32(n), ...valor];
  // graus e minutos inteiros; segundos em milésimos (denominador 1000)
  const racionais = (d: Dms) => [[d[0], 1], [d[1], 1], [Math.round(d[2] * 1000), 1000]].flatMap(([v, den]) => [...u32(v), ...u32(o.denominadorZero ? 0 : den)]);

  tiff.push(...(intel ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  // IFD0 em 8: uma entrada, o ponteiro do GPS (4 = LONG); termina em 8 + 2 + 12 + 4 = 26
  tiff.push(...u16(1), ...entrada(0x8825, 4, 1, u32(26)), ...u32(0));
  // IFD do GPS em 26: 4 entradas; termina em 26 + 2 + 48 + 4 = 80
  tiff.push(...u16(4),
    ...entrada(1, 2, 2, ascii(latRef)),
    ...entrada(2, 5, 3, u32(80)),
    ...entrada(3, 2, 2, ascii(lonRef)),
    ...entrada(4, 5, 3, u32(104)),
    ...u32(0));
  tiff.push(...racionais(lat), ...racionais(lon));

  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const tamanho = exif.length + 2;
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe1, tamanho >> 8, tamanho & 255, ...exif,
    0xff, 0xda, 0x00, 0x02, // começo da imagem
    0xff, 0xd9,
  ]);
}

/** JPEG sem Exif nenhum. */
export const jpegSemExif = (): Uint8Array => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);

/** Começo de um arquivo HEIC: 4 bytes de tamanho, "ftypheic", e enchimento. */
export const bytesHeic = (): Uint8Array => new Uint8Array([0, 0, 0, 24, ...'ftypheic'.split('').map((c) => c.charCodeAt(0)), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

const dms = (g: number): Dms => {
  const a = Math.abs(g);
  const grau = Math.floor(a);
  const minuto = Math.floor((a - grau) * 60);
  return [grau, minuto, (a - grau - minuto / 60) * 3600];
};

/** JPEG com o GPS no ponto UTM 24S dado (o inverso do que o site faz ao ler). */
export function jpegNoUtm(p: [number, number], ordem: 'MM' | 'II' = 'MM'): Uint8Array {
  const [lon, lat] = deUtm(p);
  return jpegComGps({ ordem, latRef: lat < 0 ? 'S' : 'N', lat: dms(lat), lonRef: lon < 0 ? 'W' : 'E', lon: dms(lon) });
}
