import { describe, expect, it } from 'vitest';
import { criarEstado, proximaMarca, ERRO_OS, ERRO_SEM_KMZ, type Armazem } from '../src/tela/estado.ts';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas.ts';
import type { Pt, Vao } from '../src/nucleo/tipos.ts';
import { deUtm } from '../src/nucleo/utm.ts';

// tudo inventado, perto de (500000, 9500000)
const retangulo = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const area = (id: number, nome: string, pasta: string[], x0: number, y0: number, x1: number, y1: number): AreaProtegida => ({
  id, nome, pasta, atributos: {}, poligonos: [[retangulo(x0, y0, x1, y1)]], linhas: [], caixa: [x0, y0, x1, y1],
});
const UC = area(1, 'UC Inventada', ['Unidade de Conservação Estadual', 'Uso Sustentável'], 500000, 9500000, 500200, 9500100);
const BASE: BaseAreas = {
  revisao: '1', data: '01/01/2024', areas: [UC],
  municipios: [area(2, 'Cidade Teste', ['Municípios_CE'], 495000, 9495000, 505000, 9505000)],
};
const lerBase = async () => BASE;
const bytesDe = (t: string) => new TextEncoder().encode(t);

type Par = [number, string | number];
const texto = (pares: Par[]) => pares.map(([c, v]) => `${String(c).padStart(3)}\n${v}`).join('\n') + '\n';
const dxf = (e: Par[]) =>
  bytesDe(texto([[0, 'SECTION'], [2, 'HEADER'], [9, '$ACADVER'], [1, 'AC1027'], [0, 'ENDSEC'], [0, 'SECTION'], [2, 'ENTITIES'], ...e, [0, 'ENDSEC'], [0, 'EOF']]));
const lado = (a: Pt, b: Pt): Par[] => [[0, 'LINE'], [8, 'LINHAMT'], [10, a[0]], [20, a[1]], [11, b[0]], [21, b[1]]];
const etiqueta = (p: Pt): Par[] => [[0, 'TEXT'], [8, 'ETIQ'], [10, p[0]], [20, p[1] + 2], [1, '(1)2AN00438']];

// dois vãos MT novos, de 40 m e 60 m, dentro da UC
const DXF_OBRA = dxf([
  ...lado([500010, 9500050], [500050, 9500050]), ...etiqueta([500030, 9500050]),
  ...lado([500050, 9500050], [500110, 9500050]), ...etiqueta([500080, 9500050]),
]);

async function comProjeto(arquivo = DXF_OBRA) {
  const e = criarEstado({ lerAreas: lerBase });
  await e.carregarKmz(bytesDe('x'), 'Areas_Rev1.kmz');
  await e.carregarProjeto(arquivo, 'obra.dxf', '0000000001');
  return e;
}

describe('estado: KMZ e projeto', () => {
  it('sem KMZ, o projeto não abre', async () => {
    const e = criarEstado({ lerAreas: lerBase });
    await e.carregarProjeto(DXF_OBRA, 'obra.dxf', '0000000001');
    expect(e.ler().rede).toBeNull();
    expect(e.ler().erro).toBe(ERRO_SEM_KMZ);
  });

  it('OS sem 10 dígitos não abre o projeto', async () => {
    const e = criarEstado({ lerAreas: lerBase });
    await e.carregarKmz(bytesDe('x'), 'a.kmz');
    await e.carregarProjeto(DXF_OBRA, 'obra.dxf', '123');
    expect(e.ler().erro).toBe(ERRO_OS);
    expect(e.ler().rede).toBeNull();
  });

  it('erro de leitura do KMZ vira erro com o texto do núcleo e a tela sai do ocupado', async () => {
    const e = criarEstado();
    await e.carregarKmz(bytesDe('isto não é KML'), 'lixo.kmz');
    expect(e.ler().erro).toBe('Este arquivo não é um KML nem um KMZ');
    expect(e.ler().base).toBeNull();
    expect(e.ler().ocupado).toBe(false);
  });

  it('KML de rede no lugar do KMZ de áreas: não vira base vazia', async () => {
    const e = criarEstado();
    const kml = '<kml><Document><Placemark><name>x</name><LineString><coordinates>-39,-5 -39.1,-5</coordinates></LineString></Placemark></Document></kml>';
    await e.carregarKmz(bytesDe(kml), 'rede.kml');
    expect(e.ler().erro).toBe('Este arquivo não é o KMZ de Áreas Protegidas do Ceará.');
    expect(e.ler().base).toBeNull();
  });

  it('o ocupado fica ligado enquanto o KMZ é lido', async () => {
    let solta: (b: BaseAreas) => void = () => {};
    const e = criarEstado({ lerAreas: () => new Promise((r) => { solta = r; }) });
    const p = e.carregarKmz(bytesDe('x'), 'a.kmz');
    expect(e.ler().ocupado).toBe(true);
    solta(BASE);
    await p;
    expect(e.ler().ocupado).toBe(false);
    expect(e.ler().base).toBe(BASE);
  });

  it('DXF válido dentro da UC: rede proposta, caso calculado, sem bloqueio', async () => {
    const e = await comProjeto();
    const r = e.ler();
    expect(r.erro).toBeNull();
    expect(r.bloqueio).toBeNull();
    expect(r.projeto?.os).toBe('0000000001');
    expect(r.rede?.vaos.map((v) => v.situacao)).toEqual(['novo', 'novo']);
    expect(r.caso?.intervencoes[0].metros.MT).toBeCloseTo(100, 6);
  });

  it('KML de rede: o nome do arquivo é a pasta de cima e dá o tipo MT', async () => {
    const [lon, lat] = deUtm([500010, 9500050]);
    const [lon2, lat2] = deUtm([500050, 9500050]);
    const kml = `<kml><Document><Placemark><name>trecho</name><LineString><coordinates>${lon},${lat} ${lon2},${lat2}</coordinates></LineString></Placemark></Document></kml>`;
    const e = criarEstado({ lerAreas: lerBase });
    await e.carregarKmz(bytesDe('x'), 'a.kmz');
    await e.carregarProjeto(bytesDe(kml), '0000000001_rede_mt.kml', '0000000001');
    expect(e.ler().erro).toBeNull();
    expect(e.ler().rede?.origem).toBe('kml');
    expect(e.ler().rede?.vaos[0].tipo).toBe('MT');
  });
});

describe('estado: bloqueios', () => {
  it('DXF em coordenada de folha bloqueia com FORA_UTM e a caixa não libera', async () => {
    const e = await comProjeto(dxf([...lado([0, 0], [500, 300]), ...etiqueta([250, 150])]));
    expect(e.ler().bloqueio?.codigo).toBe('FORA_UTM');
    expect(e.ler().caso).toBeNull();
    e.liberarEtiqueta(true);
    expect(e.ler().bloqueio?.codigo).toBe('FORA_UTM');
    expect(e.ler().caso).toBeNull();
  });

  it('etiqueta longe bloqueia com ETIQUETA_LONGE e a caixa libera', async () => {
    const e = await comProjeto(dxf([
      ...lado([500010, 9500050], [500050, 9500050]), ...etiqueta([500030, 9500050]),
      [0, 'MTEXT'], [8, 'ETIQ'], [10, 500010], [20, 9500050], [1, '(1)1234/12\\P(0503000, 9500050)'],
    ]));
    expect(e.ler().bloqueio?.codigo).toBe('ETIQUETA_LONGE');
    expect(e.ler().caso).toBeNull();
    e.liberarEtiqueta(true);
    expect(e.ler().bloqueio).toBeNull();
    expect(e.ler().caso).not.toBeNull();
    e.liberarEtiqueta(false);
    expect(e.ler().bloqueio?.codigo).toBe('ETIQUETA_LONGE');
  });
});

describe('estado: marcar vãos', () => {
  it('marcar um vão como fora tira os metros dele do caso', async () => {
    const e = await comProjeto();
    expect(e.ler().caso?.intervencoes[0].metros.MT).toBeCloseTo(100, 6);
    e.marcarVao('v2', { situacao: 'existente' });
    expect(e.ler().caso?.intervencoes[0].metros.MT).toBeCloseTo(40, 6);
  });

  it('vão sem tipo fica fora da conta até o projetista definir', async () => {
    const e = await comProjeto();
    e.marcarVao('v2', { tipo: null });
    expect(e.ler().caso?.intervencoes[0].metros.MT).toBeCloseTo(40, 6);
    e.marcarVao('v2', { tipo: 'MT' });
    expect(e.ler().caso?.intervencoes[0].metros.MT).toBeCloseTo(100, 6);
  });

  it('sem argumento, a marca anda no ciclo MT, BT, conjugada, fora', async () => {
    const e = await comProjeto();
    const marca = () => { const v = e.ler().rede!.vaos[0]; return [v.tipo, v.situacao]; };
    expect(marca()).toEqual(['MT', 'novo']);
    e.marcarVao('v1'); expect(marca()).toEqual(['BT', 'novo']);
    e.marcarVao('v1'); expect(marca()).toEqual(['CONJ', 'novo']);
    e.marcarVao('v1'); expect(marca()[1]).toBe('existente');
    e.marcarVao('v1'); expect(marca()).toEqual(['MT', 'novo']);
  });

  it('proximaMarca de vão sem tipo começa em MT novo', () => {
    const v: Vao = { id: 'v', pts: [[0, 0], [1, 1]], camada: 'C', tipo: null, situacao: 'novo', motivo: '' };
    expect(proximaMarca(v)).toEqual({ tipo: 'MT', situacao: 'novo' });
  });

  it('quem escuta é avisado a cada mudança e para de ser avisado ao sair', async () => {
    const e = await comProjeto();
    let n = 0;
    const sai = e.aoMudar(() => { n++; });
    e.marcarVao('v1');
    expect(n).toBe(1);
    sai();
    e.marcarVao('v1');
    expect(n).toBe(1);
  });
});

describe('estado: armazém', () => {
  const memoria = (): Armazem & { dados: Map<string, unknown> } => {
    const dados = new Map<string, unknown>();
    return { dados, guardar: async (k, v) => { dados.set(k, v); }, ler: async (k) => dados.get(k) };
  };

  it('guarda o KMZ já lido e volta com ele sem pedir de novo', async () => {
    const m = memoria();
    const e1 = criarEstado({ lerAreas: lerBase, armazem: m });
    await e1.carregarKmz(bytesDe('x'), 'Areas_Rev1.kmz');
    const e2 = criarEstado({ lerAreas: lerBase, armazem: m });
    await e2.iniciar();
    expect(e2.ler().base).toBe(BASE);
    expect(e2.ler().kmzNome).toBe('Areas_Rev1.kmz');
  });

  it('armazém que falha não derruba nada', async () => {
    const ruim: Armazem = { guardar: async () => { throw new Error('cheio'); }, ler: async () => { throw new Error('sem banco'); } };
    const e = criarEstado({ lerAreas: lerBase, armazem: ruim });
    await e.iniciar();
    await e.carregarKmz(bytesDe('x'), 'a.kmz');
    expect(e.ler().base).toBe(BASE);
    expect(e.ler().erro).toBeNull();
  });

  it('o que está guardado e não parece uma base é ignorado', async () => {
    const m = memoria();
    m.dados.set('base', { nome: 'x', base: { areas: 'lixo' } });
    const e = criarEstado({ lerAreas: lerBase, armazem: m });
    await e.iniciar();
    expect(e.ler().base).toBeNull();
  });
});
