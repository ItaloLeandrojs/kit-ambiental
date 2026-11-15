import { describe, expect, it } from 'vitest';
import type { Poste, Pt, Rede, Vao } from '../src/nucleo/tipos.ts';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas.ts';
import { calcularCaso } from '../src/nucleo/caso.ts';
import { confirmarApp, proporApps, refazerApp } from '../src/nucleo/app.ts';
import { G } from '../src/nucleo/geom.ts';
import { LARGURA_APP } from '../src/regras/faixas.ts';

// tudo inventado, em metros, perto de (500000, 9500000)
const X = 500000;
const Y = 9500000;
const pt = (x: number, y: number): Pt => [X + x, Y + y];
const AGUA = ['Recursos Hídricos - COGERH', 'Açudes Monitorados'];
const RIOS = ['Recursos Hídricos - COGERH', 'Rede Hidrográfica'];

let seq = 0;
function acude(nome: string, x0: number, y0: number, x1: number, y1: number): AreaProtegida {
  const anel = [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1), pt(x0, y0)];
  return { id: ++seq, nome, pasta: AGUA, atributos: {}, poligonos: [[anel]], linhas: [], caixa: [X + x0, Y + y0, X + x1, Y + y1] };
}
function rio(nome: string, pts: Pt[]): AreaProtegida {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { id: ++seq, nome, pasta: RIOS, atributos: {}, poligonos: [], linhas: [pts], caixa: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
}
const vao = (pts: Pt[]): Vao => ({ id: 'v', pts, camada: 'C', tipo: 'MT', situacao: 'novo', motivo: '' });
const rede = (vaos: Vao[], postes: Poste[] = []): Rede => ({ origem: 'dxf', vaos, postes });
const base = (areas: AreaProtegida[]): BaseAreas => ({ revisao: 'teste', data: '', areas, municipios: [] });
const ring = (aneis: Pt[][]): number => G.area(G.poligono(aneis));

// açude quadrado de 200 m (0 a 200) e rede vertical em x = 260, a 60 m da margem
const AC = acude('Açude Inventado', 0, 0, 200, 200);
const REDE = rede([vao([pt(260, 0), pt(260, 200)])]);

describe('proporApps', () => {
  it('açude de 200 m com a rede a 60 m: APP de 100 m, em anel, com a área esperada', () => {
    const apps = proporApps(REDE, base([AC]));
    expect(apps).toHaveLength(1);
    const app = apps[0];
    expect(app.agua).toBe(AC);
    expect(app.largura).toBe(LARGURA_APP.acude);
    expect(app.poligono).toHaveLength(2); // anel externo + furo do açude
    // buffer de 100 m de um quadrado de lado L, menos o quadrado = 4·L·d + π·d² (quinas arredondadas)
    const esperado = 4 * 200 * 100 + Math.PI * 100 * 100;
    expect(ring(app.poligono)).toBeGreaterThan(esperado * 0.98);
    expect(ring(app.poligono)).toBeLessThan(esperado * 1.02);
    expect(app.porque).toContain('a licença do açude pode dizer outra largura');
  });

  it('não propõe para água a mais de largura da rede nova', () => {
    expect(proporApps(rede([vao([pt(400, 0), pt(400, 200)])]), base([AC]))).toEqual([]);
  });

  it('sem rede nova não propõe nada', () => {
    expect(proporApps(rede([{ ...vao([pt(260, 0), pt(260, 200)]), situacao: 'existente' }]), base([AC]))).toEqual([]);
  });

  it('lagoa: 100 m e o porque cita zona urbana e até 20 ha', () => {
    const lagoa = acude('Lagoa Inventada', 0, 0, 200, 200);
    const [app] = proporApps(REDE, base([lagoa]));
    expect(app.largura).toBe(100);
    expect(app.porque).toContain('na zona urbana é 30 m; até 20 ha na zona rural, 50 m');
  });

  it('rio em linha: faixa de 30 m de cada lado', () => {
    const r = rio('Rio Inventado', [pt(0, 100), pt(200, 100)]);
    const [app] = proporApps(rede([vao([pt(100, 80), pt(100, 120)])]), base([r]));
    expect(app.largura).toBe(30);
    // linha de 200 m com 30 m de cada lado: 200·60 mais as duas pontas redondas (π·30²)
    const esperado = 200 * 60 + Math.PI * 30 * 30;
    expect(ring(app.poligono)).toBeGreaterThan(esperado * 0.98);
    expect(ring(app.poligono)).toBeLessThan(esperado * 1.02);
    const meio = G.poligono(app.poligono);
    expect(G.distancia(meio, G.ponto(pt(100, 129)))).toBe(0);
    expect(G.distancia(meio, G.ponto(pt(100, 71)))).toBe(0);
    expect(G.distancia(meio, G.ponto(pt(100, 135)))).toBeGreaterThan(0);
  });

  it('recorta à caixa da rede + 500 m: rio de 300 km não gera 300 km de margem', () => {
    const r = rio('Rio Longo', [pt(-150000, 100), pt(150000, 100)]);
    const apps = proporApps(rede([vao([pt(0, 80), pt(0, 120)])]), base([r]));
    const total = apps.reduce((s, a) => s + ring(a.poligono), 0);
    expect(total).toBeLessThan(1100 * 60 * 1.01); // caixa de ±500 m em volta da rede: no máximo 1100 m de rio
    for (const a of apps) for (const p of a.poligono[0]) expect(Math.abs(p[0] - X)).toBeLessThanOrEqual(500.0001);
  });
});

describe('refazerApp', () => {
  it('com 50 m: o polígono novo não toca a rede (a 60 m) e guarda a largura', () => {
    const [app] = proporApps(REDE, base([AC]));
    const nova = refazerApp(app, 50);
    expect(nova.largura).toBe(50);
    expect(nova.agua).toBe(AC);
    expect(ring(nova.poligono)).toBeLessThan(ring(app.poligono));
    expect(G.distancia(G.poligono(nova.poligono), G.linha(REDE.vaos[0].pts))).toBeGreaterThan(5);
  });
});

describe('confirmarApp', () => {
  it('dá o nome "APP <nome>", o tipo, a largura, o polígono e o aguaId', () => {
    const [app] = proporApps(REDE, base([AC]));
    const c = confirmarApp(app);
    expect(c.nome).toBe('APP Açude Inventado');
    expect(c.tipo).toBe('APP');
    expect(c.largura).toBe(100);
    expect(c.poligono).toEqual(app.poligono);
    expect(c.aguaId).toBe(AC.id);
  });

  it('integração: proposta confirmada tira o APP_POSSIVEL só dessa água', () => {
    const outra = acude('Outro Açude', 0, 300, 200, 500);
    const b = base([AC, outra]);
    const r = rede([vao([pt(260, 0), pt(260, 200)]), vao([pt(260, 300), pt(260, 500)])]);
    const antes = calcularCaso(r, b, []).avisos.filter((a) => a.codigo === 'APP_POSSIVEL');
    expect(antes).toHaveLength(2);
    const apps = proporApps(r, b);
    expect(apps).toHaveLength(2);
    const so = apps.find((a) => a.agua === AC)!;
    const depois = calcularCaso(r, b, [confirmarApp(so)]).avisos.filter((a) => a.codigo === 'APP_POSSIVEL');
    expect(depois).toHaveLength(1);
    expect(depois[0].texto).toContain('Outro Açude');
  });
});
