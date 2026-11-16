import { describe, expect, it } from 'vitest';
import { avisosFaixa, ERRO_TIPO_MALHA, lerMalha, type Malha } from '../src/nucleo/faixa.ts';
import { montarZip } from '../src/nucleo/zip.ts';
import type { Pt, Rede, Vao } from '../src/nucleo/tipos.ts';
import { deUtm } from '../src/nucleo/utm.ts';

// tudo inventado, perto de (500000, 9500000)
const bytes = (t: string) => new TextEncoder().encode(t);
const coords = (pts: Pt[]) => pts.map((p) => { const [lon, lat] = deUtm(p); return `${lon},${lat},0`; }).join(' ');

const vao = (id: string, pts: Pt[], extra: Partial<Vao> = {}): Vao => ({ id, pts, camada: 'MT', tipo: 'MT', situacao: 'novo', motivo: '', ...extra });
const rede = (...vaos: Vao[]): Rede => ({ origem: 'dxf', vaos, postes: [] });

// rede nova de 100 m, de leste a oeste, em N = 9500000
const REDE = rede(vao('a', [[500000, 9500000], [500100, 9500000]]));
const eixo = (n: number): Pt[] => [[499900, n], [500200, n]];

const sop = (linhas: { rodovia: string; pts: Pt[] }[]) => bytes(`<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${linhas.map((l) =>
  `<Placemark><name>trecho</name><ExtendedData><SchemaData><SimpleData name="RODOVIA">${l.rodovia}</SimpleData></SchemaData></ExtendedData><MultiGeometry><LineString><coordinates>${coords(l.pts)}</coordinates></LineString></MultiGeometry></Placemark>`).join('')}</Document></kml>`);

describe('lerMalha', () => {
  it('SOP: nome da linha vem de RODOVIA e as coordenadas ficam em UTM', () => {
    const m = lerMalha(sop([{ rodovia: 'CE-999', pts: eixo(9500020) }]), 'SOP.kml');
    expect(m.tipo).toBe('SOP');
    expect(m.linhas).toHaveLength(1);
    expect(m.linhas[0].nome).toBe('CE-999');
    expect(m.linhas[0].pts[0][0]).toBeCloseTo(499900, 0);
    expect(m.linhas[0].pts[0][1]).toBeCloseTo(9500020, 0);
  });

  it('DNIT: só entra a feição com sg_uf = CE, e o nome é BR-<vl_br>', () => {
    const feicao = (uf: string, br: string, n: number) =>
      `<Placemark><ExtendedData><SchemaData><SimpleData name="vl_br">${br}</SimpleData><SimpleData name="sg_uf">${uf}</SimpleData></SchemaData></ExtendedData><MultiGeometry><LineString><coordinates>${coords(eixo(n))}</coordinates></LineString></MultiGeometry></Placemark>`;
    const m = lerMalha(bytes(`<kml><Document>${feicao('DF', '010', 9500020)}${feicao('CE', '222', 9500030)}</Document></kml>`), 'DNIT.kml');
    expect(m.tipo).toBe('DNIT');
    expect(m.linhas.map((l) => l.nome)).toEqual(['BR-222']);
  });

  it('abre KMZ e aceita o tipo pelo parâmetro', () => {
    const kmz = montarZip([{ caminho: 'doc.kml', bytes: sop([{ rodovia: 'X', pts: eixo(9500020) }]) }]);
    const m = lerMalha(kmz, 'malha-qualquer.kmz', 'FERROVIA');
    expect(m.tipo).toBe('FERROVIA');
    expect(m.linhas).toHaveLength(1);
  });

  it('tipo pelo nome do arquivo: ferrovia; sem pista nenhuma, erro', () => {
    expect(lerMalha(sop([]), 'Transnordestina.kml').tipo).toBe('FERROVIA');
    expect(() => lerMalha(sop([]), 'malha.kml')).toThrow(ERRO_TIPO_MALHA);
  });

  it('arquivo que não é KML dá erro', () => {
    expect(() => lerMalha(bytes('lixo'), 'SOP.kml')).toThrow();
  });
});

describe('avisosFaixa', () => {
  const malha = (tipo: Malha['tipo'], rodovia: string, n: number): Malha => ({ tipo, nome: `${tipo}.kml`, linhas: [{ nome: rodovia, pts: eixo(n).map((p) => [p[0], p[1]] as Pt) }] });

  it('SOP a 20 m da rede: aviso com a faixa de 35 m e os metros dentro', () => {
    const r = avisosFaixa(REDE, [malha('SOP', 'CE-999', 9500020)]);
    expect(r).toHaveLength(1);
    expect(r[0].nivel).toBe('amarelo');
    expect(r[0].codigo).toBe('FAIXA_DOMINIO');
    expect(r[0].texto).toBe('precisa de processo DNIT/SOP: CE-999, 100 m de rede dentro da faixa de 35 m');
    for (const doc of ['requerimento', 'projeto', 'ART', 'memorial']) expect(r[0].comoCorrigir).toContain(doc);
    expect(r[0].comoCorrigir).not.toContain('cronograma');
  });

  it('SOP a 50 m da rede: nenhum aviso', () => {
    expect(avisosFaixa(REDE, [malha('SOP', 'CE-999', 9500050)])).toEqual([]);
  });

  it('DNIT: faixa de 30 m e cronograma na lista', () => {
    const r = avisosFaixa(REDE, [malha('DNIT', 'BR-222', 9500029)]);
    expect(r).toHaveLength(1);
    expect(r[0].texto).toContain('BR-222');
    expect(r[0].texto).toContain('faixa de 30 m');
    expect(r[0].comoCorrigir).toContain('cronograma');
    expect(avisosFaixa(REDE, [malha('DNIT', 'BR-222', 9500031)])).toEqual([]);
  });

  it('ferrovia: faixa de 22,5 m', () => {
    expect(avisosFaixa(REDE, [malha('FERROVIA', 'Linha Sul', 9500022)])[0].texto).toContain('faixa de 22,5 m');
    expect(avisosFaixa(REDE, [malha('FERROVIA', 'Linha Sul', 9500023)])).toEqual([]);
  });

  it('um aviso por rodovia, mesmo com vários segmentos; segmentos fora não contam', () => {
    const m: Malha = { tipo: 'SOP', nome: 'SOP.kml', linhas: [
      { nome: 'CE-999', pts: [[499900, 9500020], [500050, 9500020]] },
      { nome: 'CE-999', pts: [[500050, 9500020], [500200, 9500020]] },
      { nome: 'CE-001', pts: eixo(9501000) },
    ] };
    const r = avisosFaixa(REDE, [m]);
    expect(r).toHaveLength(1);
    expect(r[0].texto).toContain('CE-999');
    expect(r[0].texto).toContain('100 m de rede');
  });

  it('só conta rede nova: vão existente dentro da faixa não gera aviso', () => {
    const existente = rede(vao('a', [[500000, 9500000], [500100, 9500000]], { situacao: 'existente' }));
    expect(avisosFaixa(existente, [malha('SOP', 'CE-999', 9500020)])).toEqual([]);
  });

  it('rede que só entra em parte da faixa: conta só os metros de dentro', () => {
    // rodovia vertical em E = 500150: a faixa (35 m) pega de 500115 em diante; a rede acaba em 500100, então fora
    const vertical: Malha = { tipo: 'SOP', nome: 'SOP.kml', linhas: [{ nome: 'CE-777', pts: [[500150, 9499900], [500150, 9500100]] }] };
    expect(avisosFaixa(REDE, [vertical])).toEqual([]);
    const maior = rede(vao('a', [[500000, 9500000], [500200, 9500000]]));
    expect(avisosFaixa(maior, [vertical])[0].texto).toContain('70 m de rede');
  });

  it('sem malha carregada: amarelo pedindo as malhas, nunca verde', () => {
    const r = avisosFaixa(REDE, []);
    expect(r).toHaveLength(1);
    expect(r[0].nivel).toBe('amarelo');
    expect(r[0].codigo).toBe('FAIXA_SEM_MALHA');
    expect(r[0].texto).toBe('Carregue as malhas DNIT e SOP para conferir a faixa de domínio');
  });
});
