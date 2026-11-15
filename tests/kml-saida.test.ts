import { describe, expect, it } from 'vitest';
import { gravarKml } from '../src/nucleo/kml-saida.ts';
import { lerKml } from '../src/nucleo/kml.ts';
import { paraUtm } from '../src/nucleo/utm.ts';
import type { Pt } from '../src/nucleo/tipos.ts';
import type { CamadaKit } from '../src/nucleo/shp.ts';

const base = paraUtm(-38.5, -3.8);
const d = (e: number, n: number): Pt => [base[0] + e, base[1] + n];
const perto = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01;
const bytes = (s: string) => new TextEncoder().encode(s);

describe('gravarKml', () => {
  it('ponto, linhas e polígono com buraco voltam iguais a 1 cm', () => {
    const ext: Pt[] = [d(0, 0), d(100, 0), d(100, 100), d(0, 100), d(0, 0)];
    const bur: Pt[] = [d(40, 40), d(40, 60), d(60, 60), d(60, 40), d(40, 40)];
    const c: CamadaKit = {
      nome: 'Camada',
      tipo: 'linha',
      feicoes: [
        { name: 'APP AÇUDE', geometria: [{ t: 'ponto', p: d(5, 5) }] },
        { name: 'REDE', geometria: [{ t: 'linha', pts: [d(0, 0), d(30, 40)] }, { t: 'linha', pts: [d(50, 50), d(80, 90), d(90, 95)] }] },
        { name: 'UMA', geometria: [{ t: 'linha', pts: [d(1, 1), d(2, 2)] }] },
        { name: 'AREA', geometria: [{ t: 'poligono', aneis: [ext, bur] }] },
      ],
    };
    const xml = gravarKml(c);
    expect(xml).toContain('<name>Camada</name>');
    expect(xml.match(/<MultiGeometry>/g)).toHaveLength(1);
    expect(xml).toMatch(/<coordinates>-38\.\d{8},-3\.\d{8},0<\/coordinates>/);
    const f = lerKml(bytes(xml));
    expect(f.map((x) => x.nome)).toEqual(['APP AÇUDE', 'REDE', 'UMA', 'AREA']);
    const p = f[0].geometrias[0];
    expect(p.t === 'ponto' && perto(p.p, d(5, 5))).toBe(true);
    const l = f[1].geometrias;
    expect(l).toHaveLength(2);
    expect(l[1].t === 'linha' && l[1].pts.length === 3 && perto(l[1].pts[2], d(90, 95))).toBe(true);
    const pol = f[3].geometrias[0];
    expect(pol.t).toBe('poligono');
    if (pol.t === 'poligono') {
      expect(pol.aneis).toHaveLength(2);
      pol.aneis[0].forEach((q, i) => expect(perto(q, ext[i])).toBe(true));
      pol.aneis[1].forEach((q, i) => expect(perto(q, bur[i])).toBe(true));
    }
  });

  it('escapa & < > " nos nomes', () => {
    const c: CamadaKit = { nome: 'A & B', tipo: 'ponto', feicoes: [{ name: 'a<b>&"c"', geometria: [{ t: 'ponto', p: d(0, 0) }] }] };
    const xml = gravarKml(c);
    expect(xml).toContain('<name>a&lt;b&gt;&amp;&quot;c&quot;</name>');
    expect(xml).toContain('<name>A &amp; B</name>');
    expect(lerKml(bytes(xml))[0].nome).toBe('a<b>&"c"');
  });
});
