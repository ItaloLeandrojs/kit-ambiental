import { describe, expect, it } from 'vitest';
import type { Poste, Pt, Rede, Situacao, TipoRede, Vao } from '../src/nucleo/tipos.ts';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas.ts';
import { calcularCaso, type AreaConfirmada } from '../src/nucleo/caso.ts';
import { TEXTOS } from '../src/regras/textos.ts';

// tudo inventado, em metros, perto de (500000, 9500000)
const X = 500000;
const Y = 9500000;
const retangulo = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [X + x0, Y + y0], [X + x1, Y + y0], [X + x1, Y + y1], [X + x0, Y + y1], [X + x0, Y + y0],
];
const pt = (x: number, y: number): Pt => [X + x, Y + y];

let seq = 0;
function area(nome: string, pasta: string[], x0: number, y0: number, x1: number, y1: number): AreaProtegida {
  const anel = retangulo(x0, y0, x1, y1);
  return { id: ++seq, nome, pasta, atributos: {}, poligonos: [[anel]], linhas: [], caixa: [X + x0, Y + y0, X + x1, Y + y1] };
}
const UC_ESTADUAL = ['Unidade de Conservação Estadual', 'Uso Sustentável'];
const AGUA = ['Recursos Hídricos - COGERH', 'Açudes Monitorados'];

function base(areas: AreaProtegida[], municipio = 'Cidade Teste'): BaseAreas {
  return { revisao: 'teste', data: '', areas, municipios: [area(municipio, ['Municípios_CE'], -5000, -5000, 5000, 5000)] };
}

const vao = (id: string, tipo: TipoRede, pts: Pt[], situacao: Situacao = 'novo'): Vao => ({ id, pts, camada: 'C', tipo, situacao, motivo: '' });
const poste = (id: string, ponto: Pt, numero: string | null = null, novo = true): Poste => ({ id, ponto, numero, novo, coordEscrita: null, etiqueta: null });
const rede = (vaos: Vao[], postes: Poste[] = []): Rede => ({ origem: 'dxf', vaos, postes });

describe('calcularCaso', () => {
  it('45 m de BT dentro de UC estadual: 0,0135 ha, gestor SEMA, licencia SEMACE', () => {
    const uc = area('UC Inventada', UC_ESTADUAL, 0, 0, 100, 100);
    const caso = calcularCaso(rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])]), base([uc]), []);
    expect(caso.intervencoes).toHaveLength(1);
    const iv = caso.intervencoes[0];
    expect(iv.area).toBe(uc);
    expect(iv.metros.BT).toBeCloseTo(45, 6);
    expect(iv.hectares).toBeCloseTo(0.0135, 10);
    expect(iv.orgao?.gestor).toBe('SEMA');
    expect(iv.orgao?.licencia).toBe('SEMACE');
    expect(caso.avisos.map((a) => a.codigo)).not.toContain('SEM_AREA');
  });

  it('rede mista: 16 m MT + 23 m BT + 79 m CONJ dão 0,0639 ha', () => {
    const uc = area('UC Inventada', UC_ESTADUAL, 0, 0, 300, 100);
    const r = rede([
      vao('a', 'MT', [pt(10, 50), pt(26, 50)]),
      vao('b', 'BT', [pt(26, 50), pt(49, 50)]),
      vao('c', 'CONJ', [pt(49, 50), pt(128, 50)]),
    ]);
    const iv = calcularCaso(r, base([uc]), []).intervencoes[0];
    expect(iv.trechos).toHaveLength(3);
    expect(iv.hectares).toBeCloseTo(0.0639, 10);
    expect(Math.round(iv.metros.MT)).toBe(16);
    expect(Math.round(iv.metros.BT)).toBe(23);
    expect(Math.round(iv.metros.CONJ)).toBe(79);
  });

  it('vãos seguidos do mesmo tipo dentro da mesma entrada viram um trecho, com os postes das pontas', () => {
    const uc = area('UC Inventada', UC_ESTADUAL, 0, 0, 100, 100);
    const r = rede(
      [vao('a', 'BT', [pt(10, 50), pt(30, 50)]), vao('b', 'BT', [pt(30, 50), pt(55, 50)])],
      [poste('p1', pt(10, 50), '1'), poste('p2', pt(30, 50), '2'), poste('p3', pt(55, 52), '3')],
    );
    const iv = calcularCaso(r, base([uc]), []).intervencoes[0];
    expect(iv.trechos).toHaveLength(1);
    expect(iv.trechos[0].metros).toBeCloseTo(45, 6);
    expect(iv.trechos[0].de?.numero).toBe('1');
    expect(iv.trechos[0].ate?.numero).toBe('3');
  });

  it('poste da ponta a mais de 5 m fica null', () => {
    const uc = area('UC Inventada', UC_ESTADUAL, 0, 0, 100, 100);
    const r = rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])], [poste('p1', pt(10, 50), '1'), poste('p2', pt(55, 58), '2')]);
    const t = calcularCaso(r, base([uc]), []).intervencoes[0].trechos[0];
    expect(t.de?.numero).toBe('1');
    expect(t.ate).toBeNull();
  });

  it('rede que entra duas vezes na mesma área dá 2 trechos', () => {
    const uc = area('UC Inventada', UC_ESTADUAL, 0, 0, 100, 100);
    const r = rede([vao('a', 'BT', [pt(-20, 30), pt(40, 30), pt(40, 150), pt(60, 150), pt(60, 70), pt(120, 70)])]);
    const iv = calcularCaso(r, base([uc]), []).intervencoes[0];
    expect(iv.trechos).toHaveLength(2);
    expect(iv.trechos[0].metros).toBeCloseTo(40 + 70, 6);
    expect(iv.trechos[1].metros).toBeCloseTo(30 + 40, 6);
  });

  it('rede que só encosta (0,3 m dentro) não é intervenção: vai para as áreas próximas', () => {
    const uc = area('UC Inventada', UC_ESTADUAL, 0, 0, 100, 100);
    const caso = calcularCaso(rede([vao('a', 'BT', [pt(-50, 50), pt(0.3, 50)])]), base([uc]), []);
    expect(caso.intervencoes).toHaveLength(0);
    expect(caso.proximas).toHaveLength(1);
    expect(caso.proximas[0].area).toBe(uc);
    expect(caso.avisos.map((a) => a.codigo)).toEqual(['PROXIMA']);
    expect(caso.avisos[0].texto).toContain(TEXTOS.proxima);
  });

  it('área a 60 m sem cruzar vai para as próximas; a 300 m não', () => {
    const perto = area('Perto', UC_ESTADUAL, 100, 0, 200, 100);
    const longe = area('Longe', UC_ESTADUAL, 400, 0, 500, 100);
    const caso = calcularCaso(rede([vao('a', 'BT', [pt(0, 50), pt(40, 50)])]), base([perto, longe]), []);
    expect(caso.proximas.map((p) => p.area)).toEqual([perto]);
    expect(caso.proximas[0].distancia).toBeCloseTo(60, 6);
  });

  it('área da pasta Corredor: orgao null e aviso com semOrgao', () => {
    const corredor = area('Corredor Inventado', ['Corredor do Pacoti'], 0, 0, 100, 100);
    const caso = calcularCaso(rede([vao('a', 'MT', [pt(10, 50), pt(40, 50)])]), base([corredor]), []);
    expect(caso.intervencoes[0].orgao).toBeNull();
    const av = caso.avisos.find((a) => a.codigo === 'SEM_ORGAO');
    expect(av?.nivel).toBe('amarelo');
    expect(av?.texto).toContain(TEXTOS.semOrgao);
    expect(av?.texto).toContain('Corredor Inventado');
  });

  it('só poste novo dentro da APP confirmada: 2,856 m² por poste, ou o valor editado', () => {
    const app: AreaConfirmada = { nome: 'APP de teste', tipo: 'APP', poligono: [retangulo(0, 0, 100, 100)], largura: 100 };
    const r = rede([], [poste('p1', pt(50, 50), '1')]);
    const iv = calcularCaso(r, base([]), [app]).intervencoes[0];
    expect(iv.area).toBe(app);
    expect(iv.trechos).toHaveLength(0);
    expect(iv.postesSemRede).toEqual([{ poste: r.postes[0], m2: 2.856 }]);
    expect(iv.hectares).toBeCloseTo(0.0002856, 10);
    const iv2 = calcularCaso(r, base([]), [app], { p1: 5 }).intervencoes[0];
    expect(iv2.postesSemRede[0].m2).toBe(5);
    expect(iv2.hectares).toBeCloseTo(0.0005, 10);
  });

  it('área com trecho não tem postesSemRede, mesmo com poste novo dentro', () => {
    const uc = area('UC Inventada', UC_ESTADUAL, 0, 0, 100, 100);
    const r = rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])], [poste('p1', pt(30, 50), '1')]);
    expect(calcularCaso(r, base([uc]), []).intervencoes[0].postesSemRede).toEqual([]);
  });

  it('rede toda existente: só semRedeNova, nunca "sem área protegida"', () => {
    const uc = area('UC Inventada', UC_ESTADUAL, 0, 0, 100, 100);
    const r = rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)], 'existente')], [poste('p1', pt(10, 50), '1', false)]);
    const caso = calcularCaso(r, base([uc]), []);
    expect(caso.intervencoes).toHaveLength(0);
    expect(caso.avisos).toHaveLength(1);
    expect(caso.avisos[0].codigo).toBe('SEM_REDE_NOVA');
    expect(caso.avisos[0].texto).toBe(TEXTOS.semRedeNova);
    expect(JSON.stringify(caso)).not.toContain('sem área protegida');
  });

  it('desenho sem nenhum vão: só semRedeNova', () => {
    const caso = calcularCaso(rede([], [poste('p1', pt(10, 10), '1', false)]), base([]), []);
    expect(caso.avisos.map((a) => a.codigo)).toEqual(['SEM_REDE_NOVA']);
  });

  it('rede fora de tudo: só semArea', () => {
    const uc = area('UC Inventada', UC_ESTADUAL, 1000, 1000, 1100, 1100);
    const caso = calcularCaso(rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])]), base([uc]), []);
    expect(caso.intervencoes).toHaveLength(0);
    expect(caso.proximas).toHaveLength(0);
    expect(caso.avisos.map((a) => a.codigo)).toEqual(['SEM_AREA']);
    expect(caso.avisos[0].texto).toBe(TEXTOS.semArea);
    expect(caso.municipio).toBe('Cidade Teste');
    expect(caso.litoral).toBe(false);
  });

  it('município do litoral: aviso LITORAL, e não sai semArea junto', () => {
    const caso = calcularCaso(rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])]), base([], 'Icapuí'), []);
    expect(caso.litoral).toBe(true);
    expect(caso.avisos.map((a) => a.codigo)).toEqual(['LITORAL']);
    expect(caso.avisos[0].texto).toBe(TEXTOS.litoral);
  });

  it('o município é o que contém o meio da rede nova', () => {
    const b = base([]);
    b.municipios = [
      area('Oeste', ['Municípios_CE'], -5000, -5000, 100, 5000),
      area('Leste', ['Municípios_CE'], 100, -5000, 5000, 5000),
    ];
    const r = rede([vao('a', 'BT', [pt(0, 0), pt(30, 0)]), vao('b', 'BT', [pt(30, 0), pt(300, 0)])]);
    expect(calcularCaso(r, b, []).municipio).toBe('Leste');
  });

  it('água da COGERH perto: aviso APP_POSSIVEL com o nome, e a água não vira intervenção', () => {
    const acude = area('Açude Inventado', AGUA, 0, 100, 100, 200);
    const r = rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])]);
    const caso = calcularCaso(r, base([acude]), []);
    expect(caso.intervencoes).toHaveLength(0);
    expect(caso.proximas).toHaveLength(0);
    const av = caso.avisos.filter((a) => a.codigo === 'APP_POSSIVEL');
    expect(av).toHaveLength(1);
    expect(av[0].texto).toContain('Açude Inventado');
    expect(av[0].texto).toContain(TEXTOS.appCampo);
  });

  it('com APP confirmada em volta da água, o aviso some e a APP é a intervenção', () => {
    const acude = area('Açude Inventado', AGUA, 0, 100, 100, 200);
    const app: AreaConfirmada = { nome: 'APP do açude', tipo: 'APP', poligono: [retangulo(-100, 0, 200, 300)], largura: 100 };
    const caso = calcularCaso(rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])]), base([acude]), [app]);
    expect(caso.avisos.map((a) => a.codigo)).not.toContain('APP_POSSIVEL');
    expect(caso.intervencoes).toHaveLength(1);
    expect(caso.intervencoes[0].area).toBe(app);
    expect(caso.intervencoes[0].hectares).toBeCloseTo(0.0135, 10);
  });

  it('áreas com o mesmo nome são separadas pelo id', () => {
    const a1 = area('Nome Repetido', UC_ESTADUAL, 0, 0, 100, 100);
    const a2 = area('Nome Repetido', UC_ESTADUAL, 200, 0, 300, 100);
    const r = rede([vao('a', 'BT', [pt(10, 50), pt(40, 50)]), vao('b', 'BT', [pt(210, 50), pt(250, 50)])]);
    const caso = calcularCaso(r, base([a1, a2]), []);
    expect(caso.intervencoes.map((i) => i.area)).toEqual([a1, a2]);
    const so2 = calcularCaso(rede([vao('b', 'BT', [pt(210, 50), pt(250, 50)])]), base([a1, a2]), []);
    expect(so2.intervencoes.map((i) => i.area)).toEqual([a2]);
    expect(so2.proximas.map((p) => p.area)).toEqual([]);
  });

  it('todo aviso tem como corrigir específico, sem travessão, e nenhum texto diz "não precisa de processo"', () => {
    const corredor = area('Corredor Inventado', ['Corredor do Pacoti'], 0, 0, 100, 100);
    const perto = area('Perto', UC_ESTADUAL, 100, 0, 200, 100);
    const acude = area('Açude Inventado', AGUA, 0, 100, 100, 200);
    const casos = [
      calcularCaso(rede([vao('a', 'MT', [pt(10, 50), pt(40, 50)])]), base([corredor, perto, acude], 'Caucaia'), []),
      calcularCaso(rede([]), base([]), []),
      calcularCaso(rede([vao('a', 'MT', [pt(900, 50), pt(940, 50)])]), base([]), []),
    ];
    for (const c of casos) {
      expect(c.avisos.length).toBeGreaterThan(0);
      for (const a of c.avisos) {
        expect(a.comoCorrigir.length).toBeGreaterThan(20);
        expect(a.comoCorrigir + a.texto).not.toMatch(/—|–/);
      }
      expect(JSON.stringify(c).toLowerCase()).not.toContain('não precisa de processo');
    }
  });
});
