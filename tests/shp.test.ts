import { describe, expect, it } from 'vitest';
import { gravarShp, lerShp, PRJ_SIRGAS_24S, type CamadaKit } from '../src/nucleo/shp.ts';
import type { Pt } from '../src/nucleo/tipos.ts';

const area2 = (a: Pt[]): number => {
  let s = 0;
  for (let i = 0; i < a.length - 1; i++) s += a[i][0] * a[i + 1][1] - a[i + 1][0] * a[i][1];
  return s;
};
const dv = (u: Uint8Array) => new DataView(u.buffer, u.byteOffset, u.byteLength);
const proximo = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

// antihorário (x,y)->(x+l,y)->(x+l,y+l); invertido = horário
const quadrado = (x: number, y: number, l: number, horario: boolean): Pt[] => {
  const a: Pt[] = [[x, y], [x + l, y], [x + l, y + l], [x, y + l], [x, y]];
  return horario ? a.reverse() : a;
};

describe('SHP', () => {
  it('PRJ e CPG fixos', () => {
    expect(PRJ_SIRGAS_24S).toBe(
      'PROJCS["SIRGAS_2000_UTM_Zone_24S",GEOGCS["GCS_SIRGAS_2000",DATUM["D_SIRGAS_2000",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",10000000.0],PARAMETER["Central_Meridian",-39.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]',
    );
    const r = gravarShp({ nome: 'X', tipo: 'ponto', feicoes: [] });
    expect(r.prj).toBe(PRJ_SIRGAS_24S);
    expect(r.cpg).toBe('UTF-8');
  });

  it('ponto: ida e volta, cabeçalho, shx e acento', () => {
    const c: CamadaKit = {
      nome: 'P',
      tipo: 'ponto',
      feicoes: [
        { name: 'APP AÇUDE', geometria: [{ t: 'ponto', p: [538123.456789, 9582345.123456] }] },
        { name: 'B', geometria: [{ t: 'ponto', p: [538200.5, 9582400.25] }] },
      ],
    };
    const r = gravarShp(c);
    const h = dv(r.shp);
    expect(h.getInt32(0, false)).toBe(9994);
    expect(h.getInt32(24, false) * 2).toBe(r.shp.length);
    expect(h.getInt32(28, true)).toBe(1000);
    expect(h.getInt32(32, true)).toBe(1);
    expect(r.shp.length).toBe(100 + 2 * (8 + 20));
    expect(dv(r.shx).getInt32(24, false) * 2).toBe(r.shx.length);
    expect(r.shx.length).toBe(100 + 2 * 8);
    expect(dv(r.shx).getInt32(100, false)).toBe(50); // offset do 1º registro, em palavras
    expect(dv(r.shx).getInt32(104, false)).toBe(10); // conteúdo de 20 bytes
    expect(dv(r.shx).getInt32(108, false)).toBe(50 + 14);
    const l = lerShp(r.shp, r.dbf, r.cpg);
    expect(l.tipo).toBe('ponto');
    expect(l.tipoNumero).toBe(1);
    expect(l.feicoes).toHaveLength(2);
    expect(l.feicoes[0].atributos.Name).toBe('APP AÇUDE');
    const g = l.feicoes[0].geometrias[0];
    expect(g.t === 'ponto' && proximo(g.p, [538123.456789, 9582345.123456])).toBe(true);
  });

  it('linha com 2 partes: ida e volta e shx', () => {
    const partes: Pt[][] = [[[1000, 2000], [1010, 2020], [1030, 2020]], [[1100, 2100], [1150, 2100]]];
    const r = gravarShp({ nome: 'L', tipo: 'linha', feicoes: [{ name: 'REDE', geometria: partes.map((pts) => ({ t: 'linha' as const, pts })) }] });
    expect(dv(r.shp).getInt32(32, true)).toBe(3);
    expect(dv(r.shp).getInt32(24, false) * 2).toBe(r.shp.length);
    expect(r.shx.length).toBe(100 + 8);
    const l = lerShp(r.shp, r.dbf, r.cpg);
    expect(l.tipo).toBe('linha');
    expect(l.feicoes).toHaveLength(1);
    const gs = l.feicoes[0].geometrias;
    expect(gs).toHaveLength(2);
    gs.forEach((g, i) => {
      expect(g.t).toBe('linha');
      if (g.t === 'linha') {
        expect(g.pts).toHaveLength(partes[i].length);
        g.pts.forEach((p, j) => expect(proximo(p, partes[i][j])).toBe(true));
      }
    });
  });

  it('polígono com buraco: ida e volta e orientação ESRI mesmo com entrada ao contrário', () => {
    const ext = quadrado(0, 0, 100, true); // horário
    const bur = quadrado(40, 40, 20, false); // antihorário
    const certo = gravarShp({ nome: 'A', tipo: 'poligono', feicoes: [{ name: 'AREA', geometria: [{ t: 'poligono', aneis: [ext, bur] }] }] });
    const l = lerShp(certo.shp, certo.dbf, certo.cpg);
    expect(l.tipo).toBe('poligono');
    const g = l.feicoes[0].geometrias[0];
    expect(g.t).toBe('poligono');
    if (g.t === 'poligono') {
      expect(g.aneis).toHaveLength(2);
      g.aneis[0].forEach((p, i) => expect(proximo(p, ext[i])).toBe(true));
      g.aneis[1].forEach((p, i) => expect(proximo(p, bur[i])).toBe(true));
    }
    // entrada "errada": externo antihorário, buraco horário
    const errado = gravarShp({
      nome: 'A',
      tipo: 'poligono',
      feicoes: [{ name: 'AREA', geometria: [{ t: 'poligono', aneis: [quadrado(0, 0, 100, false), quadrado(40, 40, 20, true)] }] }],
    });
    const g2 = lerShp(errado.shp, errado.dbf, errado.cpg).feicoes[0].geometrias[0];
    expect(g2.t).toBe('poligono');
    if (g2.t === 'poligono') {
      expect(g2.aneis).toHaveLength(2);
      expect(area2(g2.aneis[0])).toBeLessThan(0); // horário
      expect(area2(g2.aneis[1])).toBeGreaterThan(0); // antihorário
      expect(Math.abs(area2(g2.aneis[0]) / 2)).toBeCloseTo(10000, 6);
      expect(Math.abs(area2(g2.aneis[1]) / 2)).toBeCloseTo(400, 6);
    }
    expect(dv(errado.shp).getInt32(24, false) * 2).toBe(errado.shp.length);
  });

  it('anel não fechado é fechado; dois polígonos numa feição voltam separados', () => {
    const aberto: Pt[] = [[0, 0], [0, 10], [10, 10], [10, 0]];
    const r = gravarShp({
      nome: 'A',
      tipo: 'poligono',
      feicoes: [{ name: 'D', geometria: [{ t: 'poligono', aneis: [aberto] }, { t: 'poligono', aneis: [quadrado(50, 50, 5, true)] }] }],
    });
    const g = lerShp(r.shp, r.dbf, r.cpg).feicoes[0].geometrias;
    expect(g).toHaveLength(2);
    g.forEach((x) => {
      expect(x.t).toBe('poligono');
      if (x.t === 'poligono') expect(proximo(x.aneis[0][0], x.aneis[0][x.aneis[0].length - 1])).toBe(true);
    });
  });

  it('cabeçalho traz o bbox', () => {
    const r = gravarShp({ nome: 'L', tipo: 'linha', feicoes: [{ name: 'a', geometria: [{ t: 'linha', pts: [[10, 20], [30, 5]] }] }] });
    const h = dv(r.shp);
    expect([h.getFloat64(36, true), h.getFloat64(44, true), h.getFloat64(52, true), h.getFloat64(60, true)]).toEqual([10, 5, 30, 20]);
  });

  it('DBF: um campo Name C(254), UTF-8, terminador e truncamento em fronteira de caractere', () => {
    const longo = 'Ç'.repeat(200); // 400 bytes
    const r = gravarShp({
      nome: 'P',
      tipo: 'ponto',
      feicoes: [{ name: longo, geometria: [{ t: 'ponto', p: [1, 2] }] }, { name: 'ok', geometria: [{ t: 'ponto', p: [3, 4] }] }],
    });
    const d = dv(r.dbf);
    expect(r.dbf[0]).toBe(0x03);
    expect(d.getUint32(4, true)).toBe(2);
    expect(d.getUint16(8, true)).toBe(65);
    expect(d.getUint16(10, true)).toBe(255);
    expect(r.dbf.length).toBe(65 + 2 * 255 + 1);
    expect(r.dbf[r.dbf.length - 1]).toBe(0x1a);
    expect(new TextDecoder().decode(r.dbf.slice(32, 36))).toBe('Name');
    expect(r.dbf[43]).toBe(0x43); // 'C'
    expect(r.dbf[48]).toBe(254);
    expect(r.dbf[64]).toBe(0x0d);
    const l = lerShp(r.shp, r.dbf, 'UTF-8');
    expect(l.feicoes[0].atributos.Name).toBe('Ç'.repeat(127)); // 254 bytes, sem cortar no meio
    expect(l.feicoes[1].atributos.Name).toBe('ok');
  });

  it('lê tipo 15 (com Z) pelo tamanho do registro e DBF latin1 sem cpg', () => {
    const pts: Pt[] = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]];
    const n = pts.length;
    const conteudo = 4 + 32 + 4 + 4 + 4 + n * 16 + 16 + n * 8 + 16 + n * 8;
    const b = new Uint8Array(100 + 8 + conteudo);
    const v = new DataView(b.buffer);
    v.setInt32(0, 9994, false);
    v.setInt32(24, b.length / 2, false);
    v.setInt32(28, 1000, true);
    v.setInt32(32, 15, true);
    v.setInt32(100, 1, false);
    v.setInt32(104, conteudo / 2, false);
    let o = 108;
    v.setInt32(o, 15, true);
    o += 4 + 32;
    v.setInt32(o, 1, true);
    o += 4;
    v.setInt32(o, n, true);
    o += 4;
    v.setInt32(o, 0, true);
    o += 4;
    for (const p of pts) {
      v.setFloat64(o, p[0], true);
      v.setFloat64(o + 8, p[1], true);
      o += 16;
    }
    const l = lerShp(b, null, null);
    expect(l.tipoNumero).toBe(15);
    expect(l.tipo).toBe('poligono');
    expect(l.feicoes).toHaveLength(1);
    expect(l.feicoes[0].atributos).toEqual({});
    const g = l.feicoes[0].geometrias[0];
    expect(g.t === 'poligono' && g.aneis[0].length === 5).toBe(true);
    // DBF em latin1: "Ação"
    const r = gravarShp({ nome: 'P', tipo: 'ponto', feicoes: [{ name: 'x', geometria: [{ t: 'ponto', p: [1, 2] }] }] });
    const dbf = r.dbf.slice();
    dbf.fill(0x20, 65 + 1, 65 + 255);
    dbf.set([0x41, 0xe7, 0xe3, 0x6f], 65 + 1);
    expect(lerShp(r.shp, dbf, null).feicoes[0].atributos.Name).toBe('Ação');
  });
});
