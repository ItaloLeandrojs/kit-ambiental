import { describe, expect, it } from 'vitest';
import { associarImagens, enquadrar, gravarKmzFiguras, planoDeFiguras, type EntradaKmz, type Figura, type ImagemSolta } from '../src/nucleo/figuras.ts';
import { calcularCaso, type AreaConfirmada } from '../src/nucleo/caso.ts';
import { lerKml } from '../src/nucleo/kml.ts';
import { abrirZip } from '../src/nucleo/zip.ts';
import { deUtm } from '../src/nucleo/utm.ts';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas.ts';
import type { Arvore } from '../src/nucleo/arvores.ts';
import type { Poste, Pt, Rede, TipoRede, Vao } from '../src/nucleo/tipos.ts';
import type { SituacaoUc } from '../src/nucleo/uc.ts';

// tudo inventado, em metros, perto de (500000, 9500000)
const X = 500000;
const Y = 9500000;
const pt = (x: number, y: number): Pt => [X + x, Y + y];
const retangulo = (x0: number, y0: number, x1: number, y1: number): Pt[] => [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1), pt(x0, y0)];
const area = (nome: string, pasta: string[], x0: number, y0: number, x1: number, y1: number): AreaProtegida =>
  ({ id: 1, nome, pasta, atributos: {}, poligonos: [[retangulo(x0, y0, x1, y1)]], linhas: [], caixa: [X + x0, Y + y0, X + x1, Y + y1] });
const base: BaseAreas = { revisao: 'teste', data: '', areas: [], municipios: [area('Eusébio', ['Municípios_CE'], -5000, -5000, 5000, 5000)] };
const vao = (id: string, tipo: TipoRede, pts: Pt[]): Vao => ({ id, pts, camada: 'C', tipo, situacao: 'novo', motivo: '' });
const poste = (id: string, ponto: Pt, numero: string | null): Poste => ({ id, ponto, numero, novo: true, coordEscrita: null, etiqueta: null });
const APP: AreaConfirmada = { nome: 'APP DO AÇUDE & CIA <EXEMPLO>', tipo: 'APP', poligonos: [[retangulo(10, 0, 110, 40)]], largura: 100 };

const rede: Rede = {
  origem: 'dxf',
  vaos: [vao('a', 'MT', [pt(0, 20), pt(300, 20)]), vao('b', 'BT', [pt(300, 20), pt(300, 120)])],
  postes: [poste('p5', pt(0, 20), '5'), poste('p6', pt(10, 20), '6'), poste('p8', pt(110, 20), '8'), poste('p9', pt(300, 20), '9')],
};
const caso = calcularCaso(rede, base, [APP]);
const uc: SituacaoUc = { ponto: pt(150, 60), dentro: [], emApp: false };
const arvores: Arvore[] = [
  { id: 'a1', foto: 'a1.jpg', ponto: pt(50, 25), especie: 'Mangueira', intervencao: 'poda' },
  { id: 'a2', foto: 'a2.jpg', ponto: pt(80, 15), especie: 'Cajueiro', intervencao: 'supressao' },
];
const entrada = { caso, rede, uc, arvores, limpeza: [] as Pt[][] };

function kmzDe(e: EntradaKmz = entrada) {
  const figuras = planoDeFiguras({ ...e, limpeza: e.limpeza ?? [] });
  const r = gravarKmzFiguras('0000000001', figuras, e);
  const arquivos = abrirZip(r.bytes);
  const kml = new TextDecoder().decode(arquivos.find((a) => a.caminho === 'doc.kml')!.bytes);
  const pastas = kml.split('<Folder>').slice(1).map((p) => p.split('</Folder>')[0]);
  return { figuras, r, arquivos, kml, pastas };
}
const range = (p: string): number => Number(/<range>([\d.]+)<\/range>/.exec(p)![1]);
const centro = (p: string): [number, number] => {
  const m = /<LookAt><longitude>(-?[\d.]+)<\/longitude><latitude>(-?[\d.]+)<\/latitude>/.exec(p)!;
  return [Number(m[1]), Number(m[2])];
};
const dentro = (c: [number, number], pts: Pt[]): boolean => {
  const ll = pts.map((p) => deUtm(p));
  const lons = ll.map((x) => x[0]);
  const lats = ll.map((x) => x[1]);
  return c[0] >= Math.min(...lons) - 1e-6 && c[0] <= Math.max(...lons) + 1e-6 && c[1] >= Math.min(...lats) - 1e-6 && c[1] <= Math.max(...lats) + 1e-6;
};

describe('enquadrar', () => {
  it('alcance é 1,6 vezes a diagonal, com o mínimo', () => {
    const e = enquadrar([pt(0, 0), pt(300, 400)], 200);
    expect(e.alcance).toBeCloseTo(800, 5);
    const [lon, lat] = deUtm(pt(150, 200));
    expect(e.lon).toBeCloseTo(lon, 7);
    expect(e.lat).toBeCloseTo(lat, 7);
  });
  it('ponto só: vale o mínimo', () => {
    expect(enquadrar([pt(5, 5)], 200).alcance).toBe(200);
  });
});

describe('gravarKmzFiguras', () => {
  it('nome do arquivo e uma pasta por figura', () => {
    const { r, figuras, pastas, arquivos } = kmzDe();
    expect(r.nome).toBe('0000000001 FIGURAS.kmz');
    expect(arquivos.map((a) => a.caminho)).toEqual(['doc.kml']);
    expect(figuras.length).toBe(4);
    expect(pastas.length).toBe(4);
    expect(pastas[0]).toContain('<name>Figura 1 - Localização da UC</name>');
    expect(pastas[1]).toContain('<name>Figura 2 - Rede projetada</name>');
    expect(pastas[2]).toContain('<name>Figura 3 - Interferência na APP DO AÇUDE &amp; CIA &lt;EXEMPLO&gt;</name>');
    expect(pastas[3]).toContain('<name>Figura 4 - Árvores com intervenção</name>');
  });

  it('LookAt: alcance mínimo, centro dentro da caixa, sem inclinação', () => {
    const { pastas, figuras } = kmzDe();
    pastas.forEach((p, i) => {
      expect(range(p)).toBeGreaterThanOrEqual(i === 0 ? 1500 : 200);
      expect(dentro(centro(p), figuras[i].enquadrar)).toBe(true);
      expect(p).toContain('<tilt>0</tilt>');
      expect(p).toContain('<heading>0</heading>');
    });
  });

  it('pastas fechadas e só a primeira visível', () => {
    const { pastas } = kmzDe();
    pastas.forEach((p, i) => {
      expect(p).toContain('<open>0</open>');
      expect(p.includes('<visibility>0</visibility>')).toBe(i > 0);
    });
  });

  it('cores do KML (aabbggrr)', () => {
    const { kml } = kmzDe();
    expect(kml).toContain('<color>ff0000ff</color>'); // MT
    expect(kml).toContain('<color>ff00ff00</color>'); // BT
    expect(kml).toContain('<color>ffff0000</color>'); // conjugada
    expect(kml).toMatch(/<LineStyle><color>ff00ffff<\/color><width>3<\/width><\/LineStyle>/);
    expect(kml).toContain('<PolyStyle><color>4d00ffff</color>');
    expect(kml).toContain('red-circle.png'); // UC
  });

  it('a pasta da intervenção só tem os trechos, os postes numerados e a área', () => {
    const { pastas } = kmzDe();
    const p = pastas[2];
    expect(p).toContain('<name>Poste Nº 6</name>');
    expect(p).toContain('<name>Poste Nº 8</name>');
    expect(p).not.toContain('<name>Poste Nº 5</name>');
    expect(p).not.toContain('<name>Poste Nº 9</name>');
    expect(p).toContain('<Polygon>');
    expect(p).toContain('<LineString>');
    expect(p).not.toContain('#uc');
    expect(p).not.toContain('Mangueira');
    expect(p).not.toContain('#BT'); // a BT não passa pela área
    expect(p).toContain('#MT');
  });

  it('árvores com ícone diferente para poda e supressão', () => {
    const { pastas, kml } = kmzDe();
    const p = pastas[3];
    expect(p).toContain('#poda');
    expect(p).toContain('#supressao');
    expect(kml).toContain('grn-circle.png');
    expect(kml).toContain('purple-square.png');
    expect(p).toContain('Mangueira');
    expect(p).toContain('Cajueiro');
  });

  it('a pasta da UC tem o ponto da UC e a rede', () => {
    const { pastas } = kmzDe();
    expect(pastas[0]).toContain('#uc');
    expect(pastas[0]).toContain('<LineString>');
  });

  it('o KML abre de novo com o leitor da Parte 1', () => {
    const { r } = kmzDe();
    const f = lerKml(r.bytes);
    expect(f.length).toBeGreaterThan(8);
    const doUc = f.find((x) => x.pasta.some((n) => n.startsWith('Figura 1')) && x.geometrias[0].t === 'ponto');
    expect(doUc).toBeTruthy();
    const g = doUc!.geometrias[0];
    if (g.t !== 'ponto') throw new Error('ponto');
    expect(Math.hypot(g.p[0] - uc.ponto[0], g.p[1] - uc.ponto[1])).toBeLessThan(0.05);
    expect(f.some((x) => x.pasta.some((n) => n.startsWith('Figura 3')) && x.geometrias[0].t === 'poligono')).toBe(true);
  });

  it('sem UC e sem árvores: só as figuras que existem', () => {
    const { pastas } = kmzDe({ ...entrada, uc: null as SituacaoUc | null, arvores: [] as Arvore[] });
    expect(pastas.length).toBe(3);
    expect(pastas[0]).not.toContain('#uc');
  });
});

// ---------- associarImagens (Tarefa 14) ----------

// PNG inventado: assinatura e IHDR bastam para lerImagem
function pngSolto(nome: string): ImagemSolta {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 10, 0, 0, 0, 5]);
  return { nome, bytes: b };
}
const figs = (n: number): Figura[] => Array.from({ length: n }, (_, i) => ({ numero: i + 1, titulo: 't', legenda: 'l', enquadrar: [], intervencao: null }));

describe('associarImagens', () => {
  it('o número do nome manda: "Figura 3.jpg", "fig1.png" e "2.jpg" vão para 3, 1 e 2', () => {
    const r = associarImagens([pngSolto('Figura 3.jpg'), pngSolto('fig1.png'), pngSolto('2.jpg')], figs(4));
    expect(r).toEqual([
      { figura: 3, arquivo: 'Figura 3.jpg', erro: null },
      { figura: 1, arquivo: 'fig1.png', erro: null },
      { figura: 2, arquivo: '2.jpg', erro: null },
    ]);
  });

  it('nomes sem número vão, pela ordem natural, para as figuras que sobraram', () => {
    const r = associarImagens([pngSolto('outra.jpg'), pngSolto('print.jpg'), pngSolto('2.png')], figs(4));
    expect(r.find((x) => x.arquivo === '2.png')?.figura).toBe(2);
    expect(r.find((x) => x.arquivo === 'outra.jpg')?.figura).toBe(1);
    expect(r.find((x) => x.arquivo === 'print.jpg')?.figura).toBe(3);
  });

  it('ordem natural entre os sem número: "foto 2 de 10" e "foto 10 de 20" têm dois números, então vão pela ordem natural do nome', () => {
    // dois números em cada nome: guarda (2); "foto 2 de 10" vem antes de "foto 10 de 20" só pela ordem natural
    const r = associarImagens([pngSolto('foto 10 de 20.png'), pngSolto('foto 2 de 10.png')], figs(3));
    expect(r.map((x) => x.figura)).toEqual([2, 1]);
  });

  it('nomes com data não pegam o número da data: vão pela ordem natural', () => {
    const nomes = ['Untitled 2026-05-03.jpg', 'Captura de tela 2026-11-19 103215.png', '19-11-2026.jpg', 'WhatsApp Image 2026-11-19 at 10.32.15.jpeg'];
    const r = associarImagens(nomes.map((n) => pngSolto(n)), figs(4));
    expect(r.every((x) => x.erro === null)).toBe(true);
    const ordem = [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
    ordem.forEach((n, i) => expect(r.find((x) => x.arquivo === n)?.figura).toBe(i + 1));
  });

  it('o número com prefixo fig/figura ganha: "Obra 12 figura 3.jpg" vai para a Figura 3', () => {
    expect(associarImagens([pngSolto('Obra 12 figura 3.jpg')], figs(4))[0].figura).toBe(3);
  });

  it('"Untitled (2).jpg" e "2.jpg" continuam indo para a Figura 2', () => {
    expect(associarImagens([pngSolto('Untitled (2).jpg')], figs(4))[0].figura).toBe(2);
    expect(associarImagens([pngSolto('2.jpg')], figs(4))[0].figura).toBe(2);
  });

  it('número sem figura: erro "não há Figura 12 neste memorial"', () => {
    const r = associarImagens([pngSolto('figura 12.jpg')], figs(4));
    expect(r).toEqual([{ figura: 0, arquivo: 'figura 12.jpg', erro: 'não há Figura 12 neste memorial' }]);
  });

  it('HEIC ou formato que lerImagem não lê: erro pedindo JPG ou PNG', () => {
    const r = associarImagens([{ nome: 'figura 1.heic', bytes: new Uint8Array([0, 1, 2, 3, 4, 5]) }], figs(4));
    expect(r[0].erro).toBe('use JPG ou PNG: salve a imagem de novo no Google Earth');
    expect(r[0].figura).toBe(0);
  });

  it('dois nomes com o mesmo número: o primeiro fica, o segundo volta com erro', () => {
    const r = associarImagens([pngSolto('fig2 b.png'), pngSolto('fig2 a.png')], figs(4));
    expect(r.find((x) => x.arquivo === 'fig2 a.png')).toEqual({ figura: 2, arquivo: 'fig2 a.png', erro: null });
    expect(r.find((x) => x.arquivo === 'fig2 b.png')?.erro).toBe('já há uma imagem para a Figura 2'); // provisório
  });

  it('imagem sem número e sem figura livre: erro', () => {
    const r = associarImagens([pngSolto('1.png'), pngSolto('2.png'), pngSolto('sobra.png')], figs(2));
    expect(r.find((x) => x.arquivo === 'sobra.png')?.erro).toBe('não sobrou figura para esta imagem'); // provisório
  });

  it('imagem sem número não pega a figura que outra imagem reclama pelo número', () => {
    const r = associarImagens([pngSolto('livre.png'), pngSolto('fig1.png')], figs(2));
    expect(r.find((x) => x.arquivo === 'livre.png')?.figura).toBe(2);
  });
});
