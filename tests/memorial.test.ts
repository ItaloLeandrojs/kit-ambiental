import { describe, expect, it } from 'vitest';
import { haDoTrecho, montarMemorial, type EntradaMemorial } from '../src/nucleo/memorial.ts';
import { planoDeFiguras } from '../src/nucleo/figuras.ts';
import { textoDoDocumento, type Bloco } from '../src/nucleo/docx.ts';
import { calcularCaso, type AreaConfirmada } from '../src/nucleo/caso.ts';
import { dadosVazios, type DadosObra, type Empresa, type Imagem, type Responsavel } from '../src/nucleo/obra.ts';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas.ts';
import type { Arvore } from '../src/nucleo/arvores.ts';
import type { Poste, Pt, Rede, TipoRede, Vao } from '../src/nucleo/tipos.ts';

// tudo inventado, em metros, perto de (500000, 9500000)
const X = 500000;
const Y = 9500000;
const pt = (x: number, y: number): Pt => [X + x, Y + y];
const retangulo = (x0: number, y0: number, x1: number, y1: number): Pt[] => [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1), pt(x0, y0)];
let seq = 0;
const area = (nome: string, pasta: string[], x0: number, y0: number, x1: number, y1: number): AreaProtegida =>
  ({ id: ++seq, nome, pasta, atributos: {}, poligonos: [[retangulo(x0, y0, x1, y1)]], linhas: [], caixa: [X + x0, Y + y0, X + x1, Y + y1] });
const base = (areas: AreaProtegida[] = [], municipio = 'Eusébio'): BaseAreas =>
  ({ revisao: 'teste', data: '', areas, municipios: [area(municipio, ['Municípios_CE'], -5000, -5000, 5000, 5000)] });
const vao = (id: string, tipo: TipoRede, pts: Pt[]): Vao => ({ id, pts, camada: 'C', tipo, situacao: 'novo', motivo: '' });
const poste = (id: string, ponto: Pt, numero: string | null): Poste => ({ id, ponto, numero, novo: true, coordEscrita: null, etiqueta: null });
const APP: AreaConfirmada = { nome: 'APP DO AÇUDE EXEMPLO', tipo: 'APP', poligonos: [[retangulo(10, 0, 110, 40)]], largura: 100 };

// 300 m de MT em linha reta; postes 5, 6, 8 e 9; a APP cobre do poste 6 ao 8 (100 m)
const POSTES = [poste('p5', pt(0, 20), '5'), poste('p6', pt(10, 20), '6'), poste('p8', pt(110, 20), '8'), poste('p9', pt(300, 20), '9')];
const redeMT = (tipo: TipoRede = 'MT'): Rede => ({ origem: 'dxf', vaos: [vao('a', tipo, [pt(0, 20), pt(300, 20)])], postes: POSTES });

const empresa: Empresa = { nome: 'Empresa Exemplo Ltda', cnpj: '00.000.000/0001-00', endereco: 'Rua Exemplo, 1', municipio: 'Cidade Exemplo', telefone: '(00) 0000-0000', email: 'contato@exemplo.com', logo: null };
const png: Imagem = { bytes: new Uint8Array([1, 2, 3]), tipo: 'png', largura: 40, altura: 20 };
const rt = (assinatura: Imagem | null = null): Responsavel => ({ nome: 'Beltrano Exemplo', registro: '000000', rnp: '0000000000', email: 'rt@exemplo.com', assinatura });

function dados(mudar: (d: DadosObra) => void = () => {}): DadosObra {
  const d = dadosVazios();
  d.interessado = { nome: 'Fulano de Tal', endereco: 'Sítio Exemplo, s/n', bairro: 'Zona rural', cep: '00000-000' };
  d.obra = { endereco: 'Estrada Exemplo', municipio: 'Eusébio', sed: 'SED Exemplo', alimentador: 'EXE01', csi: 'X0001', dataSob: '2026-11-03', zona: 'RURAL' };
  d.finalidade = { tipo: 'extensao', fases: null, texto: '' };
  d.rede = { caboMT: 'CAA 1/0 AWG', caboBT: 'multiplexado 35 mm²', postes: [{ altura: 11, daN: 300, quantidade: 4 }] };
  d.retirada = { nenhuma: true, metros: {}, postes: 0 };
  mudar(d);
  return d;
}

function entrada(p: Partial<EntradaMemorial> & { rede?: Rede; confirmadas?: AreaConfirmada[]; areas?: AreaProtegida[]; municipio?: string } = {}): EntradaMemorial {
  const r = p.rede ?? redeMT();
  const caso = p.caso ?? calcularCaso(r, base(p.areas ?? [], p.municipio ?? 'Eusébio'), p.confirmadas ?? [APP]);
  return {
    os: '0000000001', caso, rede: r, dados: p.dados ?? dados(), empresa, rt: p.rt ?? rt(),
    uc: p.uc ?? null, arvores: p.arvores ?? [], limpeza: p.limpeza ?? [], data: new Date(2026, 10, 19),
    assinar: p.assinar ?? false, imagens: {},
  };
}
const texto = (e: EntradaMemorial): string => textoDoDocumento(montarMemorial(e));
const arvore = (id: string, especie: string, ponto: Pt | null, intervencao: Arvore['intervencao'] = 'poda'): Arvore => ({ id, foto: `${id}.jpg`, ponto, especie, intervencao });

describe('montarMemorial', () => {
  it('as seções saem na ordem do desenho', () => {
    const t = texto(entrada());
    const titulos = ['DADOS DO INTERESSADO', 'DADOS DA OBRA', 'RESPONSÁVEL PELO PROJETO', 'LOCALIZAÇÃO', 'FINALIDADE DA OBRA',
      'CARACTERÍSTICAS DA OBRA', 'A RETIRAR', 'EXTENSÃO TOTAL', 'RELAÇÃO DETALHADA DE MATERIAIS'];
    const pos = titulos.map((s) => t.split('\n').indexOf(s));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
  });

  it('título com o interessado e o município', () => {
    expect(texto(entrada())).toContain('PROJETO DE REDE DE DISTRIBUIÇÃO AÉREA PARA ATENDIMENTO A FULANO DE TAL EM EUSÉBIO-CE');
  });

  it('mês e ano por extenso', () => {
    expect(texto(entrada())).toContain('novembro de 2026');
  });

  it('frase do trecho, letra por letra', () => {
    expect(texto(entrada())).toContain('A intervenção na APP DO AÇUDE EXEMPLO ocorrerá entre o poste Nº 6 (0500010, 9500020) e o poste Nº 8 (0500110, 9500020), com cerca de 100 metros da rede de média tensão, com área de 0,0600 ha.');
  });

  it('haDoTrecho: metros inteiros vezes a faixa', () => {
    expect(haDoTrecho({ tipo: 'MT', metros: 99.6, pts: [], de: null, ate: null })).toBeCloseTo(0.06, 12);
    expect(haDoTrecho({ tipo: 'BT', metros: 45.4, pts: [], de: null, ate: null })).toBeCloseTo(0.0135, 12);
  });

  it('total: extensão do projeto e o que está na área', () => {
    expect(texto(entrada())).toContain('o projeto possui 300 metros de extensão; destes, 100 metros (0,0600 ha) estão inseridos em APP DO AÇUDE EXEMPLO');
  });

  it('início e fim da rede: o poste novo de menor e o de maior número', () => {
    const t = texto(entrada());
    expect(t).toContain('poste Nº 5 (0500000, 9500020)');
    expect(t).toContain('poste Nº 9 (0500300, 9500020)');
  });

  it('postes sem número: início e fim ficam para preencher', () => {
    const r: Rede = { ...redeMT(), postes: POSTES.map((p) => ({ ...p, numero: null })) };
    expect(texto(entrada({ rede: r }))).toContain('[PREENCHER: início e fim da rede]');
  });

  it('poste sem rede na área sai em m² e ha', () => {
    const r: Rede = { origem: 'dxf', vaos: [], postes: [poste('p1', pt(50, 20), '3')] };
    const t = texto(entrada({ rede: r, dados: dados((d) => { d.rede.postes = [{ altura: 11, daN: 300, quantidade: 1 }]; }) }));
    expect(t).toMatch(/2,856 m² \(0,0002856 ha\)/);
    expect(t).toContain('APP DO AÇUDE EXEMPLO');
  });

  it('sem árvore: diz que não há poda simples nem supressão', () => {
    const t = texto(entrada());
    expect(t).toContain('não haverá poda simples');
    expect(t).toContain('não haverá supressão');
  });

  it('com uma poda: espécie, coordenada e "poda simples"', () => {
    const t = texto(entrada({ arvores: [arvore('a1', 'Mangueira', pt(50, 25))] }));
    expect(t).toContain('Mangueira');
    expect(t).toContain('(0500050, 9500025)');
    expect(t).toContain('poda simples');
    expect(t).not.toContain('não haverá poda simples');
    expect(t).toContain('não haverá supressão');
  });

  it('carnaúba leva a frase de espécie protegida', () => {
    const t = texto(entrada({ arvores: [arvore('a1', 'Carnaúba', pt(50, 25), 'supressao')] }));
    expect(t).toContain('espécie protegida');
    expect(t).not.toContain('não haverá supressão');
  });

  it('sem limpeza: não será necessária', () => {
    expect(texto(entrada())).toContain('não será necessária limpeza de faixa');
  });

  it('com limpeza: predominância e área em m² e ha', () => {
    const t = texto(entrada({ limpeza: [[pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)]], dados: dados((d) => { d.predominancia = 'arbustiva'; }) }));
    expect(t).toContain('predominantemente arbustiva');
    expect(t).toContain('100 m² (0,0100 ha)');
    expect(t).not.toContain('não será necessária limpeza de faixa');
  });

  it('com limpeza sem predominância: fica para preencher', () => {
    const t = texto(entrada({ limpeza: [[pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)]] }));
    expect(t).toContain('[PREENCHER: predominância da vegetação]');
  });

  it('sem APP nem área: fora de tudo, sem intervenção em APP; abertura de vias sempre dita', () => {
    const t = texto(entrada({ confirmadas: [] }));
    expect(t).toContain('não está inserida em nenhuma área protegida');
    expect(t).toContain('não haverá intervenção em APP');
    expect(t).toContain('não haverá abertura de vias');
    expect(t).not.toContain('ocorrerá entre');
    expect(texto(entrada())).toContain('não haverá abertura de vias');
  });

  it('com APP: diz que haverá intervenção em APP', () => {
    const t = texto(entrada());
    expect(t).not.toContain('não haverá intervenção em APP');
    expect(t).toContain('haverá intervenção em APP');
  });

  it('obra só de poste: "não haverá extensão de rede" e nenhuma frase de trecho', () => {
    const r: Rede = { origem: 'dxf', vaos: [], postes: [poste('p1', pt(50, 20), '3')] };
    const t = texto(entrada({ rede: r }));
    expect(t).toContain('não haverá extensão de rede');
    expect(t).not.toContain('ocorrerá entre');
    expect(t).not.toContain('o projeto possui');
    expect(texto(entrada({ rede: r, confirmadas: [] }))).toContain('não está inserida em nenhuma área protegida');
  });

  it('total da área = soma dos trechos arredondados: dois trechos MT de 50,4 m dão 100 metros (0,0600 ha)', () => {
    // dois vãos MT de 50,4 m dentro da APP, separados por um vão fora dela
    const app: AreaConfirmada = { nome: 'APP DO AÇUDE EXEMPLO', tipo: 'APP', poligonos: [[retangulo(0, 0, 50.4, 40)], [retangulo(100, 0, 150.4, 40)]], largura: 100 };
    const r: Rede = {
      origem: 'dxf',
      vaos: [vao('a', 'MT', [pt(0, 20), pt(50.4, 20)]), vao('b', 'MT', [pt(50.4, 20), pt(100, 20)]), vao('c', 'MT', [pt(100, 20), pt(150.4, 20)])],
      postes: [poste('p1', pt(0, 20), '1'), poste('p2', pt(50.4, 20), '2'), poste('p3', pt(100, 20), '3'), poste('p4', pt(150.4, 20), '4')],
    };
    const t = texto(entrada({ rede: r, confirmadas: [app] }));
    expect((t.match(/com cerca de 50 metros da rede de média tensão, com área de 0,0300 ha\./g) ?? []).length).toBe(2);
    expect(t).toContain('destes, 100 metros (0,0600 ha) estão inseridos em APP DO AÇUDE EXEMPLO');
  });

  it('só poste: não afirma o que será implantado e não escreve início e fim', () => {
    const r: Rede = { origem: 'dxf', vaos: [], postes: [poste('p1', pt(50, 20), '3')] };
    const t = texto(entrada({ rede: r }));
    expect(t).not.toContain('apenas postes');
    expect(t).not.toContain('início no poste');
    expect(t).not.toContain('[PREENCHER: início e fim da rede]');
  });

  it('sem poste novo: nenhuma frase de 0 postes', () => {
    const r: Rede = { origem: 'dxf', vaos: [vao('a', 'MT', [pt(0, 20), pt(300, 20)])], postes: [] };
    const t = texto(entrada({ rede: r, dados: dados((d) => { d.rede.postes = []; }) }));
    expect(t).not.toMatch(/\b0 postes/);
    expect(t).not.toContain('Serão implantados');
  });

  it('área a menos de 100 m sem cruzar: não intervém', () => {
    const perto = area('UC Exemplo Perto', ['Unidade de Conservação Estadual', 'Uso Sustentável'], 0, 60, 300, 100);
    const t = texto(entrada({ areas: [perto], confirmadas: [] }));
    expect(t).toContain('não intervém em outra área protegida');
    expect(t).toContain('UC Exemplo Perto');
  });

  it('UC: coordenada e as áreas em que está', () => {
    const t = texto(entrada({ uc: { ponto: pt(50, 25), dentro: [APP], emApp: true } }));
    expect(t).toContain('(0500050, 9500025)');
    expect(t).toMatch(/UC.*está inserida em APP DO AÇUDE EXEMPLO/);
  });

  it('conjugada: dita como conjugada, num único traçado', () => {
    const t = texto(entrada({ rede: redeMT('CONJ'), confirmadas: [] }));
    expect(t).toContain('rede conjugada de média e baixa tensão');
    expect(t).toContain('em um único traçado');
  });

  it('Fortaleza: método construtivo, vida útil e cronograma (para preencher)', () => {
    const t = texto(entrada({ municipio: 'Fortaleza', dados: dados((d) => { d.obra.municipio = 'Fortaleza'; }) }));
    for (const s of ['MÉTODO CONSTRUTIVO', 'VIDA ÚTIL', 'CRONOGRAMA FÍSICO-FINANCEIRO']) expect(t.split('\n')).toContain(s);
    const depois = t.slice(t.indexOf('CRONOGRAMA FÍSICO-FINANCEIRO'));
    expect(depois).toContain('[PREENCHER');
  });

  it('outro município: sem as seções da SEUMA', () => {
    const t = texto(entrada());
    for (const s of ['MÉTODO CONSTRUTIVO', 'VIDA ÚTIL', 'CRONOGRAMA FÍSICO-FINANCEIRO']) expect(t).not.toContain(s);
  });

  it('as 4 tabelas de materiais levam [COLAR DO GOM] em amarelo', () => {
    const doc = montarMemorial(entrada());
    const i = doc.blocos.findIndex((b) => b.t === 'secao' && b.texto === 'RELAÇÃO DETALHADA DE MATERIAIS');
    const tabelas = doc.blocos.slice(i).filter((b): b is Extract<Bloco, { t: 'tabela' }> => b.t === 'tabela');
    expect(tabelas).toHaveLength(4);
    for (const tb of tabelas) {
      expect(tb.linhas.flat(2).some((x) => x.texto === '[COLAR DO GOM]' && x.amarelo)).toBe(true);
    }
  });

  it('campo vazio sai [PREENCHER: ...] em amarelo', () => {
    const doc = montarMemorial(entrada({ dados: dados((d) => { d.obra.alimentador = ''; }) }));
    const textos = doc.blocos.flatMap((b) => (b.t === 'paragrafo' ? b.textos : []));
    expect(textos.some((x) => x.texto === '[PREENCHER: alimentador]' && x.amarelo)).toBe(true);
  });

  it('PREENCHER da finalidade padrão também sai em amarelo', () => {
    const doc = montarMemorial(entrada({ dados: dados((d) => { d.finalidade = { tipo: 'ligacao-b', fases: null, texto: '' }; }) }));
    const textos = doc.blocos.flatMap((b) => (b.t === 'paragrafo' ? b.textos : []));
    expect(textos.some((x) => x.texto === '[PREENCHER: monofásico ou trifásico]' && x.amarelo)).toBe(true);
  });

  it('assinar: false põe a nota de não assinado e nenhuma imagem', () => {
    const doc = montarMemorial(entrada({ rt: rt(png), assinar: false }));
    const a = doc.blocos.find((b) => b.t === 'assinatura');
    expect(a && a.t === 'assinatura' && a.imagem).toBeNull();
    expect(textoDoDocumento(doc)).toContain('não assinado: corrija os vermelhos');
  });

  it('assinar: true com a assinatura do RT põe a imagem', () => {
    const doc = montarMemorial(entrada({ rt: rt(png), assinar: true }));
    const a = doc.blocos.find((b) => b.t === 'assinatura');
    expect(a && a.t === 'assinatura' && a.imagem).toBe(png);
    expect(textoDoDocumento(doc)).not.toContain('não assinado');
  });

  it('assinar: true sem assinatura guardada: sem imagem e com nota', () => {
    const doc = montarMemorial(entrada({ rt: rt(null), assinar: true }));
    const a = doc.blocos.find((b) => b.t === 'assinatura');
    expect(a && a.t === 'assinatura' && a.imagem).toBeNull();
    expect(a && a.t === 'assinatura' && a.nota).toBeTruthy();
  });

  it('cabeçalho com a empresa e a linha da Enel', () => {
    const doc = montarMemorial(entrada());
    expect(doc.cabecalho.linhas).toContain('Empresa Exemplo Ltda');
    expect(doc.cabecalho.linhas).toContain('Enel Distribuição Ceará · Memorial Descritivo');
  });

  it('extensão total: MT, conjugada, BT e o total', () => {
    const doc = montarMemorial(entrada());
    const i = doc.blocos.findIndex((b) => b.t === 'secao' && b.texto === 'EXTENSÃO TOTAL');
    const tb = doc.blocos.slice(i).find((b) => b.t === 'tabela');
    const linhas = tb && tb.t === 'tabela' ? tb.linhas.map((l) => l.map((c) => c.map((x) => x.texto).join(''))) : [];
    expect(linhas).toContainEqual(['Média tensão', '300']);
    expect(linhas).toContainEqual(['Total', '300']);
  });
});

describe('planoDeFiguras', () => {
  it('Figura 1 UC, Figura 2 rede, uma por intervenção e a das árvores', () => {
    const e = entrada({ arvores: [arvore('a1', 'Mangueira', pt(50, 25))] });
    const f = planoDeFiguras(e);
    expect(f.map((x) => x.numero)).toEqual([1, 2, 3, 4]);
    expect(f[0].titulo).toBe('Localização da UC');
    expect(f[1].titulo).toBe('Rede projetada');
    expect(f[2].intervencao).toBe(0);
    expect(f[2].legenda).toBe('Interferência na APP DO AÇUDE EXEMPLO, entre os postes Nº 6 e Nº 8; linha vermelha: rede de média tensão; polígono amarelo: APP');
    expect(f[3].intervencao).toBeNull();
    expect(f.every((x) => x.enquadrar.length > 0)).toBe(true);
  });

  it('sem intervenção nem árvore: só as Figuras 1 e 2', () => {
    expect(planoDeFiguras(entrada({ confirmadas: [] })).map((x) => x.titulo)).toEqual(['Localização da UC', 'Rede projetada']);
  });

  it('o memorial traz a legenda pronta, sem repetir o prefixo', () => {
    const t = texto(entrada());
    expect(t).toContain('Figura 3: Interferência na APP DO AÇUDE EXEMPLO, entre os postes Nº 6 e Nº 8; linha vermelha: rede de média tensão; polígono amarelo: APP');
    expect(t).not.toContain('Figura 3: Figura 3');
    expect(t).toContain('[PREENCHER: solte a imagem da Figura 1 no site]');
  });

  it('imagens: { 1: png } põe a imagem na Figura 1 e mantém [PREENCHER nas outras', () => {
    const doc = montarMemorial({ ...entrada(), imagens: { 1: png } });
    const figuras = doc.blocos.filter((b): b is Extract<Bloco, { t: 'figura' }> => b.t === 'figura');
    expect(figuras.find((f) => f.numero === 1)?.imagem).toBe(png);
    expect(figuras.filter((f) => f.numero !== 1).every((f) => f.imagem === null)).toBe(true);
    const t = textoDoDocumento(doc);
    expect(t).not.toContain('[PREENCHER: solte a imagem da Figura 1 no site]');
    expect(t).toContain('[PREENCHER: solte a imagem da Figura 2 no site]');
  });
});
