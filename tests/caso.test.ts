import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Poste, Pt, Rede, Situacao, TipoRede, Vao } from '../src/nucleo/tipos.ts';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas.ts';
import { calcularCaso, type AreaConfirmada } from '../src/nucleo/caso.ts';
import { TEXTOS } from '../src/regras/textos.ts';
import { G } from '../src/nucleo/geom.ts';

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

  describe('assentamento do INCRA (Nota Informativa 9491)', () => {
    const PASTA_PA = ['ÁREAS PROTEGIDAS', 'Assentamentos Rurais_CE'];
    const daNota = (c: ReturnType<typeof calcularCaso>) => c.avisos.filter((a) => a.codigo.startsWith('ASSENTAMENTO'));

    it('só BT: um amarelo com o nome, as condições e a confirmação com o validador', () => {
      const pa = area('PA INVENTADO', PASTA_PA, 0, 0, 100, 100);
      const avisos = daNota(calcularCaso(rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])]), base([pa]), []));
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toMatchObject({ nivel: 'amarelo', codigo: 'ASSENTAMENTO_BT', texto: 'A rede nova cruza o assentamento "PA INVENTADO".' });
      expect(avisos[0].comoCorrigir).toContain('confirme com o validador antes de decidir sobre o kit');
    });

    it('MT ou conjugada dentro: diz os metros e manda seguir com o processo', () => {
      const pa = area('PA INVENTADO', PASTA_PA, 0, 0, 300, 100);
      const r = rede([vao('a', 'MT', [pt(10, 50), pt(26, 50)]), vao('b', 'BT', [pt(26, 50), pt(49, 50)]), vao('c', 'CONJ', [pt(49, 50), pt(128, 50)])]);
      const avisos = daNota(calcularCaso(r, base([pa]), []));
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toMatchObject({ nivel: 'amarelo', codigo: 'ASSENTAMENTO_MT', comoCorrigir: 'Siga com o processo e confirme com o validador.' });
      expect(avisos[0].texto).toContain('95 m de MT ou conjugada');
    });

    it('poste novo sem vão dentro do assentamento também avisa', () => {
      const pa = area('PA INVENTADO', PASTA_PA, 0, 0, 100, 100);
      const r = rede([vao('a', 'BT', [pt(200, 50), pt(240, 50)])], [poste('p1', pt(50, 50), '1')]);
      expect(daNota(calcularCaso(r, base([pa]), [])).map((a) => a.codigo)).toEqual(['ASSENTAMENTO_BT']);
    });

    it('um aviso por assentamento; perto sem cruzar, quilombola, UC e nome com a palavra não avisam', () => {
      const r = rede([vao('a', 'BT', [pt(10, 50), pt(155, 50)])]);
      const dois = base([area('PA UM', PASTA_PA, 0, 0, 50, 100), area('PA DOIS', PASTA_PA, 100, 0, 200, 100)]);
      expect(daNota(calcularCaso(r, dois, []))).toHaveLength(2);
      const outras = base([
        area('PA PERTO', PASTA_PA, 0, 80, 200, 120),
        area('QUILOMBO', ['Territórios Quilombolas_CE'], 0, 0, 200, 100),
        area('PERÍMETRO SEM ASSENTAMENTO', ['Perímetros Irrigados DNOCS'], 0, 0, 200, 100),
        area('UC Inventada', UC_ESTADUAL, 0, 0, 200, 100),
      ]);
      expect(daNota(calcularCaso(r, outras, []))).toEqual([]);
    });
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
    const app: AreaConfirmada = { nome: 'APP de teste', tipo: 'APP', poligonos: [[retangulo(0, 0, 100, 100)]], largura: 100 };
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
    const app: AreaConfirmada = { nome: 'APP do açude', tipo: 'APP', poligonos: [[retangulo(-100, 0, 200, 300)]], largura: 100, aguaId: acude.id };
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

  it('poste novo sem nenhum vão novo: semRedeNova (amarelo), nunca semArea, mesmo com vão existente cruzando UC', () => {
    const uc = area('UC Inventada', UC_ESTADUAL, 0, 0, 100, 100);
    const r = rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)], 'existente')], [poste('p1', pt(900, 900), '1')]);
    const caso = calcularCaso(r, base([uc]), []);
    const codigos = caso.avisos.map((a) => a.codigo);
    expect(codigos).toContain('SEM_REDE_NOVA');
    expect(codigos).not.toContain('SEM_AREA');
    expect(caso.avisos.find((a) => a.codigo === 'SEM_REDE_NOVA')?.nivel).toBe('amarelo');
    expect(caso.avisos.find((a) => a.codigo === 'SEM_REDE_NOVA')?.texto).toBe(TEXTOS.semRedeNova);
    expect(JSON.stringify(caso)).not.toContain('sem área protegida');
  });

  it('poste a confirmar (ponto sem nome no KML) dentro da APP: amarelo POSTE_A_CONFIRMAR e 2,856 m²', () => {
    const app: AreaConfirmada = { nome: 'APP Inventada', tipo: 'APP', poligonos: [[retangulo(0, 0, 100, 100)]], largura: 100 };
    const p: Poste = { ...poste('p1', pt(50, 50)), aConfirmar: true };
    const caso = calcularCaso(rede([], [p]), base([]), [app]);
    const aviso = caso.avisos.find((a) => a.codigo === 'POSTE_A_CONFIRMAR');
    expect(aviso?.nivel).toBe('amarelo');
    expect(aviso?.texto).toBe(TEXTOS.posteAConfirmar);
    expect(caso.avisos.filter((a) => a.nivel === 'vermelho')).toEqual([]);
    expect(caso.intervencoes).toHaveLength(1);
    expect(caso.intervencoes[0].hectares).toBeCloseTo(0.0002856, 10);
  });

  it('vão novo sem tipo: vermelho VAO_SEM_TIPO dizendo quantos ficaram fora da conta', () => {
    const uc = area('UC Inventada', UC_ESTADUAL, 0, 0, 100, 100);
    const semTipo = (id: string, pts: Pt[]): Vao => ({ id, pts, camada: 'C', tipo: null, situacao: 'novo', motivo: '' });
    const r = rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)]), semTipo('b', [pt(55, 50), pt(90, 50)]), semTipo('c', [pt(90, 50), pt(95, 50)])]);
    const caso = calcularCaso(r, base([uc]), []);
    const aviso = caso.avisos.find((a) => a.codigo === 'VAO_SEM_TIPO');
    expect(aviso?.nivel).toBe('vermelho');
    expect(aviso?.texto).toBe(`2 vãos novos sem tipo ficaram ${TEXTOS.vaosSemTipo}`);
    expect(caso.intervencoes[0].metros.BT).toBeCloseTo(45, 6); // os sem tipo seguem fora da conta
    // vão existente sem tipo não conta: não é rede nova
    const existente = rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)]), { ...semTipo('b', [pt(55, 50), pt(90, 50)]), situacao: 'existente' }]);
    expect(calcularCaso(existente, base([uc]), []).avisos.map((a) => a.codigo)).not.toContain('VAO_SEM_TIPO');
  });

  it('só vãos sem tipo e ponto sem nome (KML sem MT/BT no nome): o vermelho não some', () => {
    const p: Poste = { ...poste('p1', pt(500, 500)), aConfirmar: true };
    const r = rede([{ id: 'b', pts: [pt(10, 50), pt(55, 50)], camada: 'C', tipo: null, situacao: 'novo', motivo: '' }], [p]);
    const caso = calcularCaso(r, base([]), []);
    expect(caso.avisos.filter((a) => a.nivel === 'vermelho').map((a) => a.codigo)).toEqual(['VAO_SEM_TIPO']);
    // sem poste também: SEM_REDE_NOVA e VAO_SEM_TIPO, os dois vermelhos
    const soVao = calcularCaso({ ...r, postes: [] }, base([]), []);
    expect(soVao.avisos.map((a) => [a.codigo, a.nivel])).toEqual([['SEM_REDE_NOVA', 'vermelho'], ['VAO_SEM_TIPO', 'vermelho']]);
  });

  // quadrado de 100 m com um laço que sai do meio do lado de cima e volta ao mesmo ponto: o JSTS lança ao cruzar
  const laco = (x0: number, y0: number): Pt[] => [
    pt(x0, y0), pt(x0 + 100, y0), pt(x0 + 100, y0 + 100), pt(x0 + 50, y0 + 100), pt(x0 + 70, y0 + 50), pt(x0 + 30, y0 + 50),
    pt(x0 + 50, y0 + 100), pt(x0, y0 + 100), pt(x0, y0),
  ];

  it('área cujo cruzamento lança no JSTS: vermelho AREA_NAO_CONFERIDA com o nome, e o resto do caso segue', () => {
    const ruim: AreaProtegida = { ...area('UC Quebrada', UC_ESTADUAL, 0, 0, 100, 100), poligonos: [[laco(0, 0)]] };
    const boa = area('UC Boa', UC_ESTADUAL, 200, 0, 300, 100);
    const r = rede([vao('a', 'BT', [pt(-20, 60), pt(320, 60)])]);
    const caso = calcularCaso(r, base([ruim, boa]), []);
    expect(caso.intervencoes.map((iv) => iv.area.nome)).toEqual(['UC Boa']);
    const aviso = caso.avisos.find((a) => a.codigo === 'AREA_NAO_CONFERIDA');
    expect(aviso?.nivel).toBe('vermelho');
    expect(aviso?.texto).toBe(`UC Quebrada: ${TEXTOS.areaNaoConferida}`);
    expect(aviso?.comoCorrigir).toContain('UC Quebrada');
    expect(JSON.stringify(caso.avisos)).not.toMatch(/non-noded|Exception/i);
  });

  it('área com defeito na leitura perto da rede: vermelho AREA_NAO_CONFERIDA, sem conta; longe, nada', () => {
    const ruim: AreaProtegida = { ...area('UC Com Defeito', UC_ESTADUAL, 0, 0, 100, 100), defeito: true };
    const perto = calcularCaso(rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])]), base([ruim]), []);
    expect(perto.intervencoes).toEqual([]);
    expect(perto.avisos.filter((a) => a.nivel === 'vermelho').map((a) => a.texto)).toEqual([`UC Com Defeito: ${TEXTOS.areaNaoConferida}`]);
    const longe = calcularCaso(rede([vao('a', 'BT', [pt(1000, 50), pt(1055, 50)])]), base([ruim]), []);
    expect(longe.avisos.map((a) => a.codigo)).not.toContain('AREA_NAO_CONFERIDA');
  });

  it('água com defeito perto da rede também avisa: a APP dela não pôde ser conferida', () => {
    const agua: AreaProtegida = { ...area('Açude Com Defeito', AGUA, 0, 0, 100, 100), poligonos: [[laco(0, 0)]], defeito: true };
    const caso = calcularCaso(rede([vao('a', 'BT', [pt(150, 50), pt(160, 50)])]), base([agua]), []);
    expect(caso.avisos.find((a) => a.codigo === 'AREA_NAO_CONFERIDA')?.texto).toBe(`Açude Com Defeito: ${TEXTOS.areaNaoConferida}`);
  });

  describe('área com o desenho consertado além de 0,5% (AREA_CONSERTADA)', () => {
    const torta = (): AreaProtegida => ({ ...area('UC Torta', UC_ESTADUAL, 0, 0, 100, 100), consertoGrande: 0.0196 });
    const consertada = (r: Rede, a: AreaProtegida) => calcularCaso(r, base([a]), []).avisos.filter((x) => x.codigo === 'AREA_CONSERTADA');

    it('rede nova cruza: amarelo com o nome e a mudança, e a conta da intervenção segue', () => {
      const caso = calcularCaso(rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])]), base([torta()]), []);
      const avisos = caso.avisos.filter((x) => x.codigo === 'AREA_CONSERTADA');
      expect(avisos).toHaveLength(1);
      expect(avisos[0].nivel).toBe('amarelo');
      expect(avisos[0].texto).toBe(`UC Torta: ${TEXTOS.areaConsertada}`);
      expect(avisos[0].comoCorrigir).toContain('"UC Torta"');
      expect(avisos[0].comoCorrigir).toContain('2%');
      expect(`${avisos[0].texto}${avisos[0].comoCorrigir}`).not.toMatch(/[—–]/);
      expect(caso.intervencoes.map((iv) => iv.area.nome)).toEqual(['UC Torta']);
      expect(caso.avisos.filter((x) => x.nivel === 'vermelho')).toEqual([]);
    });

    it('rede nova a menos de 100 m sem cruzar: amarelo também (o pedaço tirado fica colado na área)', () => {
      expect(consertada(rede([vao('a', 'BT', [pt(150, 50), pt(190, 50)])]), torta())).toHaveLength(1);
    });

    it('só poste novo dentro da área: amarelo', () => {
      expect(consertada(rede([], [poste('p1', pt(50, 50))]), torta())).toHaveLength(1);
    });

    it('rede nova a mais de 100 m: nada', () => {
      expect(consertada(rede([vao('a', 'BT', [pt(250, 50), pt(290, 50)])]), torta())).toEqual([]);
    });

    it('área sem a marca, ou com defeito (já sai o vermelho), não dá o amarelo', () => {
      const r = rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])]);
      expect(consertada(r, area('UC Boa', UC_ESTADUAL, 0, 0, 100, 100))).toEqual([]);
      const comDefeito = calcularCaso(r, base([{ ...torta(), defeito: true }]), []);
      expect(comDefeito.avisos.map((x) => x.codigo)).toContain('AREA_NAO_CONFERIDA');
      expect(comDefeito.avisos.map((x) => x.codigo)).not.toContain('AREA_CONSERTADA');
    });

    it('água consertada perto da rede: amarelo junto do APP_POSSIVEL (a APP sai desse desenho)', () => {
      const agua: AreaProtegida = { ...area('Açude Torto', AGUA, 0, 0, 100, 100), consertoGrande: 0.03 };
      const codigos = calcularCaso(rede([vao('a', 'BT', [pt(150, 50), pt(160, 50)])]), base([agua]), []).avisos.map((x) => x.codigo);
      expect(codigos).toContain('AREA_CONSERTADA');
      expect(codigos).toContain('APP_POSSIVEL');
    });

    it('sem rede nova marcada: só o vermelho SEM_REDE_NOVA, sem o amarelo', () => {
      expect(consertada(rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)], 'existente')]), torta())).toEqual([]);
    });

    it('rede nova a exatamente 100 m: amarelo (até 100 m, igual ao PROXIMA)', () => {
      expect(consertada(rede([vao('a', 'BT', [pt(200, 50), pt(240, 50)])]), torta())).toHaveLength(1);
    });

    // área de duas partes: perto (0 a 100) e longe (1000 a 1100); a lista diz qual parte foi consertada
    const duasPartes = (consertados: number[]): AreaProtegida => {
      const a = area('UC Partida', UC_ESTADUAL, 0, 0, 1100, 100);
      return { ...a, poligonos: [[retangulo(0, 0, 100, 100)], [retangulo(1000, 0, 1100, 100)]], consertoGrande: 0.02, poligonosConsertados: consertados };
    };

    it('área de várias partes: mede só até a parte consertada', () => {
      const naParteBoa = rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])]);
      expect(consertada(naParteBoa, duasPartes([1]))).toEqual([]);
      expect(consertada(naParteBoa, duasPartes([0]))).toHaveLength(1);
      expect(consertada(rede([vao('a', 'BT', [pt(1150, 50), pt(1190, 50)])]), duasPartes([1]))).toHaveLength(1);
    });

    describe('com a conta lançando erro', () => {
      afterEach(() => { vi.restoreAllMocks(); });

      it('a distância até a parte consertada lança: avisa assim mesmo', () => {
        const original = G.distancia;
        const ehDaTorta = (g: unknown) => { const p = G.pontos(g)[0]; return p[0] === X && p[1] === Y; };
        vi.spyOn(G, 'distancia').mockImplementation((a, b) => {
          if (ehDaTorta(b)) throw new Error('distância falhou');
          return original(a, b);
        });
        expect(consertada(rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])]), torta())).toHaveLength(1);
      });

      it('o cruzamento da área consertada lança: só o vermelho AREA_NAO_CONFERIDA, sem o amarelo', () => {
        vi.spyOn(G, 'dentro').mockImplementation(() => { throw new Error('cruzamento falhou'); });
        const codigos = calcularCaso(rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])]), base([torta()]), []).avisos.map((x) => x.codigo);
        expect(codigos).toContain('AREA_NAO_CONFERIDA');
        expect(codigos).not.toContain('AREA_CONSERTADA');
      });
    });
  });

  it('poste com prova (do DXF ou com POSTE no nome): sem POSTE_A_CONFIRMAR', () => {
    const caso = calcularCaso(rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])], [poste('p1', pt(10, 50))]), base([]), []);
    expect(caso.avisos.map((a) => a.codigo)).not.toContain('POSTE_A_CONFIRMAR');
  });

  it('rio que passa por açude com APP confirmada só para o açude: o aviso do rio continua', () => {
    const acude = area('Açude Inventado', AGUA, 0, 100, 100, 200);
    const rio: AreaProtegida = {
      id: ++seq, nome: 'Rio Inventado', pasta: ['Recursos Hídricos - COGERH', 'Rede Hidrográfica'], atributos: {},
      poligonos: [], linhas: [[pt(50, 250), pt(50, 70)]], caixa: [X + 50, Y + 70, X + 50, Y + 250],
    };
    const app: AreaConfirmada = { nome: 'APP do açude', tipo: 'APP', poligonos: [[retangulo(-100, 80, 200, 300)]], largura: 100, aguaId: acude.id };
    const caso = calcularCaso(rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])]), base([acude, rio]), [app]);
    const av = caso.avisos.filter((a) => a.codigo === 'APP_POSSIVEL');
    expect(av).toHaveLength(1);
    expect(av[0].texto).toContain('Rio Inventado');
  });

  it('município incerto: o meio fora de todos usa o mais perto e avisa', () => {
    const b = base([]);
    b.municipios = [area('Longe', ['Municípios_CE'], 1000, 1000, 2000, 2000), area('Perto', ['Municípios_CE'], 200, 200, 300, 300)];
    const caso = calcularCaso(rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])]), b, []);
    expect(caso.municipio).toBe('Perto');
    const av = caso.avisos.find((a) => a.codigo === 'MUNICIPIO_INCERTO');
    expect(av?.nivel).toBe('amarelo');
    expect(av?.texto).toBe('O meio da rede não cai dentro de nenhum município do KMZ; confira o município da obra.');
    expect(av?.comoCorrigir).toContain('Perto');
  });

  it('litoral vale se qualquer município a até 100 m da rede é litorâneo, mesmo com o meio em outro', () => {
    const b = base([]);
    b.municipios = [area('Cidade A', ['Municípios_CE'], -5000, -5000, 100, 5000), area('Caucaia', ['Municípios_CE'], 100, -5000, 5000, 5000)];
    const caso = calcularCaso(rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])]), b, []);
    expect(caso.municipio).toBe('Cidade A');
    expect(caso.litoral).toBe(true);
    expect(caso.avisos.map((a) => a.codigo)).toContain('LITORAL');
  });

  it('área só de linha cruzada pela rede nova: CRUZA_LINHA, e não "não intervém"', () => {
    const linha: AreaProtegida = {
      id: ++seq, nome: 'Eixo Inventado', pasta: UC_ESTADUAL, atributos: {},
      poligonos: [], linhas: [[pt(30, 0), pt(30, 100)]], caixa: [X + 30, Y, X + 30, Y + 100],
    };
    const caso = calcularCaso(rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])]), base([linha]), []);
    expect(caso.proximas).toHaveLength(0);
    expect(caso.intervencoes).toHaveLength(0);
    expect(caso.avisos.map((a) => a.codigo)).toEqual(['CRUZA_LINHA']);
    expect(caso.avisos[0].texto).toBe(`Eixo Inventado: ${TEXTOS.cruzaLinha}`);
  });

  it('polígonos sobrepostos da mesma área não contam o metro duas vezes', () => {
    const uc = area('UC Inventada', UC_ESTADUAL, 0, 0, 60, 100);
    uc.poligonos.push([retangulo(40, 0, 100, 100)]);
    uc.caixa = [X, Y, X + 100, Y + 100];
    const iv = calcularCaso(rede([vao('a', 'BT', [pt(10, 50), pt(55, 50)])]), base([uc]), []).intervencoes[0];
    expect(iv.trechos).toHaveLength(1);
    expect(iv.metros.BT).toBeCloseTo(45, 6);
  });

  it('vão com muitos pontos não estoura a pilha', () => {
    const uc = area('UC Inventada', UC_ESTADUAL, 0, -10, 200000, 10);
    const pts: Pt[] = Array.from({ length: 150000 }, (_, i) => pt(i + 1, 0));
    const caso = calcularCaso(rede([vao('a', 'BT', pts)]), base([uc]), []);
    expect(caso.intervencoes).toHaveLength(1);
  });
});
