import type { Geometria, Pt } from './tipos.ts';

export type TipoCamada = 'ponto' | 'linha' | 'poligono';
export interface CamadaKit {
  nome: string;
  tipo: TipoCamada;
  feicoes: { name: string; geometria: Geometria[] }[];
}

/** Copiado do .prj de 418 bytes dos kits aprovados. */
export const PRJ_SIRGAS_24S =
  'PROJCS["SIRGAS_2000_UTM_Zone_24S",GEOGCS["GCS_SIRGAS_2000",DATUM["D_SIRGAS_2000",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",-39.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';

const TIPO_NUMERO: Record<TipoCamada, number> = { ponto: 1, linha: 3, poligono: 5 };
const TAM_NOME = 254;

/** Área com sinal (fórmula do cadarço): negativa = horário (E para a direita, N para cima). */
function areaComSinal(a: Pt[]): number {
  let s = 0;
  for (let i = 0; i < a.length - 1; i++) s += a[i][0] * a[i + 1][1] - a[i + 1][0] * a[i][1];
  return s / 2;
}

function fechar(a: Pt[]): Pt[] {
  if (a.length === 0) return a;
  const p = a[0];
  const u = a[a.length - 1];
  return p[0] === u[0] && p[1] === u[1] ? a : [...a, [p[0], p[1]]];
}

/** Anel fechado, horário se `horario`, anti-horário se não. */
function orientar(anel: Pt[], horario: boolean): Pt[] {
  const f = fechar(anel);
  const ehHorario = areaComSinal(f) < 0;
  return ehHorario === horario ? f : [...f].reverse();
}

interface Registro {
  conteudo: Uint8Array;
  bbox: [number, number, number, number] | null;
}

function bboxDe(pts: Pt[]): [number, number, number, number] | null {
  if (!pts.length) return null;
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of pts) {
    if (x < a) a = x;
    if (y < b) b = y;
    if (x > c) c = x;
    if (y > d) d = y;
  }
  return [a, b, c, d];
}

function registroNulo(): Registro {
  const c = new Uint8Array(4); // tipo 0
  return { conteudo: c, bbox: null };
}

function registroPonto(p: Pt): Registro {
  const c = new Uint8Array(20);
  const v = new DataView(c.buffer);
  v.setInt32(0, 1, true);
  v.setFloat64(4, p[0], true);
  v.setFloat64(12, p[1], true);
  return { conteudo: c, bbox: [p[0], p[1], p[0], p[1]] };
}

/** Polyline (3) ou Polygon (5): várias partes num registro só. */
function registroPartes(tipo: 3 | 5, partes: Pt[][]): Registro {
  const todos = partes.flat();
  const bb = bboxDe(todos);
  if (!bb) return registroNulo();
  const c = new Uint8Array(44 + 4 * partes.length + 16 * todos.length);
  const v = new DataView(c.buffer);
  v.setInt32(0, tipo, true);
  for (let i = 0; i < 4; i++) v.setFloat64(4 + 8 * i, bb[i], true);
  v.setInt32(36, partes.length, true);
  v.setInt32(40, todos.length, true);
  let ini = 0;
  partes.forEach((p, i) => {
    v.setInt32(44 + 4 * i, ini, true);
    ini += p.length;
  });
  let o = 44 + 4 * partes.length;
  for (const [x, y] of todos) {
    v.setFloat64(o, x, true);
    v.setFloat64(o + 8, y, true);
    o += 16;
  }
  return { conteudo: c, bbox: bb };
}

function nomeBytes(nome: string): Uint8Array {
  const b = new TextEncoder().encode(nome);
  if (b.length <= TAM_NOME) return b;
  let n = TAM_NOME;
  while (n > 0 && (b[n] & 0xc0) === 0x80) n--; // não corta no meio de um caractere
  return b.slice(0, n);
}

function gravarDbf(nomes: string[]): Uint8Array {
  const tamReg = 1 + TAM_NOME;
  const cab = 32 + 32 + 1;
  const out = new Uint8Array(cab + nomes.length * tamReg + 1);
  const v = new DataView(out.buffer);
  const hoje = new Date();
  out[0] = 0x03;
  out[1] = hoje.getFullYear() - 1900;
  out[2] = hoje.getMonth() + 1;
  out[3] = hoje.getDate();
  v.setUint32(4, nomes.length, true);
  v.setUint16(8, cab, true);
  v.setUint16(10, tamReg, true);
  out.set(new TextEncoder().encode('Name'), 32);
  out[32 + 11] = 0x43; // 'C'
  out[32 + 16] = TAM_NOME;
  out[64] = 0x0d;
  let o = cab;
  for (const n of nomes) {
    out[o] = 0x20;
    out.fill(0x20, o + 1, o + tamReg);
    out.set(nomeBytes(n), o + 1);
    o += tamReg;
  }
  out[o] = 0x1a;
  return out;
}

export function gravarShp(c: CamadaKit): { shp: Uint8Array; shx: Uint8Array; dbf: Uint8Array; prj: string; cpg: 'UTF-8' } {
  const registros: Registro[] = [];
  const nomes: string[] = [];
  for (const f of c.feicoes) {
    if (c.tipo === 'ponto') {
      const pts = f.geometria.filter((g): g is Extract<Geometria, { t: 'ponto' }> => g.t === 'ponto');
      if (!pts.length) { registros.push(registroNulo()); nomes.push(f.name); }
      for (const g of pts) { registros.push(registroPonto(g.p)); nomes.push(f.name); } // um registro por ponto
    } else if (c.tipo === 'linha') {
      const partes = f.geometria.flatMap((g) => (g.t === 'linha' && g.pts.length >= 2 ? [g.pts] : []));
      registros.push(partes.length ? registroPartes(3, partes) : registroNulo());
      nomes.push(f.name);
    } else {
      const partes: Pt[][] = [];
      for (const g of f.geometria) {
        if (g.t !== 'poligono') continue;
        g.aneis.forEach((a, i) => {
          if (a.length >= 3) partes.push(orientar(a, i === 0));
        });
      }
      registros.push(partes.length ? registroPartes(5, partes) : registroNulo());
      nomes.push(f.name);
    }
  }

  const tamShp = 100 + registros.reduce((s, r) => s + 8 + r.conteudo.length, 0);
  const tamShx = 100 + 8 * registros.length;
  const shp = new Uint8Array(tamShp);
  const shx = new Uint8Array(tamShx);
  const vp = new DataView(shp.buffer);
  const vx = new DataView(shx.buffer);

  const todos = registros.map((r) => r.bbox).filter((b): b is [number, number, number, number] => b !== null);
  const bb: [number, number, number, number] = todos.length
    ? [Math.min(...todos.map((b) => b[0])), Math.min(...todos.map((b) => b[1])), Math.max(...todos.map((b) => b[2])), Math.max(...todos.map((b) => b[3]))]
    : [0, 0, 0, 0];
  for (const [dv, tam] of [[vp, tamShp], [vx, tamShx]] as const) {
    dv.setInt32(0, 9994, false);
    dv.setInt32(24, tam / 2, false);
    dv.setInt32(28, 1000, true);
    dv.setInt32(32, TIPO_NUMERO[c.tipo], true);
    for (let i = 0; i < 4; i++) dv.setFloat64(36 + 8 * i, bb[i], true);
  }

  let o = 100;
  registros.forEach((r, i) => {
    const palavras = r.conteudo.length / 2;
    vp.setInt32(o, i + 1, false);
    vp.setInt32(o + 4, palavras, false);
    shp.set(r.conteudo, o + 8);
    vx.setInt32(100 + 8 * i, o / 2, false);
    vx.setInt32(104 + 8 * i, palavras, false);
    o += 8 + r.conteudo.length;
  });

  return { shp, shx, dbf: gravarDbf(nomes), prj: PRJ_SIRGAS_24S, cpg: 'UTF-8' };
}

export interface ShpLido {
  tipo: TipoCamada | null;
  tipoNumero: number;
  feicoes: { atributos: Record<string, string>; geometrias: Geometria[] }[];
}

function familia(n: number): TipoCamada | null {
  if (n === 1 || n === 11) return 'ponto';
  if (n === 3 || n === 13) return 'linha';
  if (n === 5 || n === 15) return 'poligono';
  return null;
}

function decodificadorDbf(cpg: string | null): TextDecoder {
  const c = (cpg ?? '').trim().toLowerCase();
  if (c.includes('utf') || c.includes('65001')) return new TextDecoder('utf-8');
  return new TextDecoder('windows-1252'); // "latin1" no navegador e no Node; sem .cpg, latin1
}

function lerDbf(dbf: Uint8Array, cpg: string | null): Record<string, string>[] {
  if (dbf.length < 32) return [];
  const v = new DataView(dbf.buffer, dbf.byteOffset, dbf.byteLength);
  const n = v.getUint32(4, true);
  const tamCab = v.getUint16(8, true);
  const tamReg = v.getUint16(10, true);
  const dec = decodificadorDbf(cpg);
  const campos: { nome: string; tam: number }[] = [];
  for (let o = 32; o + 32 <= dbf.length && dbf[o] !== 0x0d && o < tamCab; o += 32) {
    const nome = new TextDecoder('latin1').decode(dbf.subarray(o, o + 11)).replace(/\0.*$/, '');
    campos.push({ nome, tam: dbf[o + 16] });
  }
  const out: Record<string, string>[] = [];
  for (let i = 0; i < n; i++) {
    let o = tamCab + i * tamReg;
    if (o + tamReg > dbf.length) break;
    o += 1; // marca de apagado
    const at: Record<string, string> = {};
    for (const c of campos) {
      at[c.nome] = dec.decode(dbf.subarray(o, o + c.tam)).replace(/[\0 ]+$/, '');
      o += c.tam;
    }
    out.push(at);
  }
  return out;
}

export function lerShp(shp: Uint8Array, dbf: Uint8Array | null, cpg: string | null): ShpLido {
  if (shp.length < 100) throw new Error('Este arquivo não é um SHP');
  const v = new DataView(shp.buffer, shp.byteOffset, shp.byteLength);
  if (v.getInt32(0, false) !== 9994) throw new Error('Este arquivo não é um SHP');
  const tipoNumero = v.getInt32(32, true);
  const fim = Math.min(shp.length, v.getInt32(24, false) * 2);
  const atrs = dbf ? lerDbf(dbf, cpg) : [];
  const feicoes: ShpLido['feicoes'] = [];
  let o = 100;
  while (o + 8 <= fim) {
    const tam = v.getInt32(o + 4, false) * 2;
    const ini = o + 8;
    if (tam < 0 || ini + tam > shp.length) break;
    const geometrias: Geometria[] = [];
    const t = tam >= 4 ? v.getInt32(ini, true) : 0;
    const fam = familia(t);
    if (fam === 'ponto' && tam >= 20) {
      geometrias.push({ t: 'ponto', p: [v.getFloat64(ini + 4, true), v.getFloat64(ini + 12, true)] });
    } else if ((fam === 'linha' || fam === 'poligono') && tam >= 44) {
      const nPartes = v.getInt32(ini + 36, true);
      const nPts = v.getInt32(ini + 40, true);
      const iniPartes = ini + 44;
      const iniPts = iniPartes + 4 * nPartes;
      if (nPartes >= 0 && nPts >= 0 && iniPts + 16 * nPts <= ini + tam) {
        const partes: Pt[][] = [];
        for (let k = 0; k < nPartes; k++) {
          const a = v.getInt32(iniPartes + 4 * k, true);
          const b = k + 1 < nPartes ? v.getInt32(iniPartes + 4 * (k + 1), true) : nPts;
          const pts: Pt[] = [];
          for (let j = a; j < b; j++) pts.push([v.getFloat64(iniPts + 16 * j, true), v.getFloat64(iniPts + 16 * j + 8, true)]);
          partes.push(pts);
        }
        if (fam === 'linha') {
          for (const pts of partes) if (pts.length >= 2) geometrias.push({ t: 'linha', pts });
        } else {
          // anel horário abre um polígono novo; anti-horário é buraco do polígono atual
          let atual: Pt[][] | null = null;
          for (const pts of partes) {
            if (pts.length < 4) continue;
            if (areaComSinal(pts) <= 0 || !atual) {
              atual = [pts];
              geometrias.push({ t: 'poligono', aneis: atual });
            } else atual.push(pts);
          }
        }
      }
    }
    feicoes.push({ atributos: atrs[feicoes.length] ?? {}, geometrias });
    o = ini + tam;
  }
  return { tipo: familia(tipoNumero), tipoNumero, feicoes };
}
