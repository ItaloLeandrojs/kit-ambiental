import type { Pt } from './tipos.ts';

// UTM fuso 24 Sul, SIRGAS 2000 (GRS80), série de Krüger. Meridiano central -39.
const A_EQ = 6378137.0;
const ACHAT = 1 / 298.257222101;
const K0 = 0.9996;
const N = ACHAT / (2 - ACHAT);
const A_RETIFICADO = (A_EQ / (1 + N)) * (1 + N ** 2 / 4 + N ** 4 / 64);
const ALFA = [
  N / 2 - (2 * N ** 2) / 3 + (5 * N ** 3) / 16,
  (13 * N ** 2) / 48 - (3 * N ** 3) / 5,
  (61 * N ** 3) / 240,
];
const C = (2 * Math.sqrt(N)) / (1 + N);

export function paraUtm(lon: number, lat: number): Pt {
  const fi = (lat * Math.PI) / 180;
  const dl = ((lon + 39.0) * Math.PI) / 180;
  const t = Math.sinh(Math.atanh(Math.sin(fi)) - C * Math.atanh(C * Math.sin(fi)));
  const xi = Math.atan2(t, Math.cos(dl));
  const eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let e = eta;
  let n = xi;
  ALFA.forEach((aj, i) => {
    const j = i + 1;
    e += aj * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    n += aj * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
  });
  return [500000.0 + K0 * A_RETIFICADO * e, 10000000.0 + K0 * A_RETIFICADO * n];
}

const BETA = [
  N / 2 - (2 * N ** 2) / 3 + (37 * N ** 3) / 96,
  N ** 2 / 48 + N ** 3 / 15,
  (17 * N ** 3) / 480,
];
const DELTA = [2 * N - (2 * N ** 2) / 3 - 2 * N ** 3, (7 * N ** 2) / 3 - (8 * N ** 3) / 5, (56 * N ** 3) / 15];

// série de Krüger inversa: UTM 24S (E, N) em metros para [lon, lat] em graus
export function deUtm(p: Pt): [lon: number, lat: number] {
  const xi0 = (p[1] - 10000000.0) / (K0 * A_RETIFICADO);
  const eta0 = (p[0] - 500000.0) / (K0 * A_RETIFICADO);
  let xi = xi0;
  let eta = eta0;
  BETA.forEach((bj, i) => {
    const j = i + 1;
    xi -= bj * Math.sin(2 * j * xi0) * Math.cosh(2 * j * eta0);
    eta -= bj * Math.cos(2 * j * xi0) * Math.sinh(2 * j * eta0);
  });
  const chi = Math.asin(Math.sin(xi) / Math.cosh(eta));
  let fi = chi;
  DELTA.forEach((dj, i) => {
    fi += dj * Math.sin(2 * (i + 1) * chi);
  });
  const dl = Math.atan2(Math.sinh(eta), Math.cos(xi));
  return [(dl * 180) / Math.PI - 39.0, (fi * 180) / Math.PI];
}
