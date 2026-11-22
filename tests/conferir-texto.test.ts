import { describe, expect, it } from 'vitest';
import { conferirPlanilha, conferirTexto, lerTrechos, type ContextoTexto } from '../src/nucleo/conferir-texto.ts';
import { lerLinhaDaObra, lerPlanilha, preencherPlanilha } from '../src/nucleo/planilha.ts';
import { lerCelulas } from '../src/nucleo/xlsx.ts';
import { planilhaInventada } from './ajuda/planilha-inventada.ts';
import type { Campo } from '../src/regras/planilha.ts';
import type { SituacaoUc } from '../src/nucleo/uc.ts';
import { ERROS_COMUNS } from '../src/regras/erros-comuns.ts';
import { montarMemorial, type EntradaMemorial } from '../src/nucleo/memorial.ts';
import { textoDoDocumento } from '../src/nucleo/docx.ts';
import { calcularCaso, type AreaConfirmada, type Caso } from '../src/nucleo/caso.ts';
import { dadosVazios, type DadosObra, type Empresa, type Imagem, type Responsavel } from '../src/nucleo/obra.ts';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas.ts';
import type { Arvore } from '../src/nucleo/arvores.ts';
import type { ItemConferencia } from '../src/nucleo/conferir.ts';
import type { Poste, Pt, Rede, TipoRede, Vao } from '../src/nucleo/tipos.ts';

// tudo inventado, em metros, perto de (500000, 9500000)
const X = 500000;
const Y = 9500000;
const pt = (x: number, y: number): Pt => [X + x, Y + y];
const retangulo = (x0: number, y0: number, x1: number, y1: number): Pt[] => [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1), pt(x0, y0)];
let seq = 0;
const area = (nome: string, pasta: string[], x0: number, y0: number, x1: number, y1: number): AreaProtegida =>
  ({ id: ++seq, nome, pasta, atributos: {}, poligonos: [[retangulo(x0, y0, x1, y1)]], linhas: [], caixa: [X + x0, Y + y0, X + x1, Y + y1] });
const vao = (id: string, tipo: TipoRede, pts: Pt[]): Vao => ({ id, pts, camada: 'C', tipo, situacao: 'novo', motivo: '' });
const poste = (id: string, ponto: Pt, numero: string | null): Poste => ({ id, ponto, numero, novo: true, coordEscrita: null, etiqueta: null });

// 400 m de MT; postes 1 (x=0), 2 (x=308) e 3 (x=400); a APP cobre de 0 a 308 (308 m de MT: 0,1848 ha)
const APP: AreaConfirmada = { nome: 'APP DO AÇUDE EXEMPLO', tipo: 'APP', poligonos: [[retangulo(0, 0, 308, 40)]], largura: 100 };
const PERTO = area('APA DO MANGUE EXEMPLO', ['Unidade de Conservação Estadual', 'Uso Sustentável'], 0, 60, 300, 100); // 40 m da rede, sem cruzar
const LONGE = area('APA DA SERRA EXEMPLO', ['Unidade de Conservação Estadual', 'Uso Sustentável'], 2000, 2000, 2100, 2100);
const POSTES = [poste('p1', pt(0, 20), '1'), poste('p2', pt(308, 20), '2'), poste('p3', pt(400, 20), '3')];
const REDE: Rede = { origem: 'dxf', vaos: [vao('a', 'MT', [pt(0, 20), pt(400, 20)])], postes: POSTES };
const base = (areas: AreaProtegida[]): BaseAreas =>
  ({ revisao: 'teste', data: '', areas, municipios: [area('Eusébio', ['Municípios_CE'], -5000, -5000, 5000, 5000)] });

const empresa: Empresa = { nome: 'Empresa Exemplo Ltda', cnpj: '00.000.000/0001-00', endereco: 'Rua Exemplo, 1', municipio: 'Cidade Exemplo', telefone: '(00) 0000-0000', email: 'contato@exemplo.com', logo: null };
const png: Imagem = { bytes: new Uint8Array([1, 2, 3]), tipo: 'png', largura: 40, altura: 20 };
const RT: Responsavel = { nome: 'Beltrano Exemplo', registro: '000000', rnp: '0000000000', email: 'rt@exemplo.com', assinatura: png };
const MANGUEIRA: Arvore = { id: 'a1', foto: 'a1.jpg', ponto: pt(50, 25), especie: 'Mangueira', intervencao: 'poda' };

function dados(): DadosObra {
  const d = dadosVazios();
  d.interessado = { nome: 'Fulano de Tal', endereco: 'Sítio Exemplo, s/n', bairro: 'Zona rural', cep: '00000-000' };
  d.obra = { endereco: 'Estrada Exemplo', municipio: 'Eusébio', sed: 'SED Exemplo', alimentador: 'EXE01', csi: 'X0001', dataSob: '2026-11-03', zona: 'RURAL' };
  d.finalidade = { tipo: 'extensao', fases: null, texto: '' };
  d.rede = { caboMT: 'CAA 1/0 AWG', caboBT: 'multiplexado 35 mm²', postes: [{ altura: 11, daN: 300, quantidade: 3 }] };
  d.retirada = { nenhuma: true, metros: {}, postes: 0 };
  return d;
}

interface Montado { texto: string; ctx: ContextoTexto }
// O texto que o site escreve, com as marcas amarelas já preenchidas (como o projetista faz no Word antes do PDF).
function montar(p: { rede?: Rede; confirmadas?: AreaConfirmada[]; areas?: AreaProtegida[]; arvores?: Arvore[] } = {}): Montado {
  const rede = p.rede ?? REDE;
  const areas = p.areas ?? [PERTO, LONGE];
  const caso: Caso = calcularCaso(rede, base(areas), p.confirmadas ?? [APP]);
  const arvores = p.arvores ?? [MANGUEIRA];
  const e: EntradaMemorial = {
    os: '0000000001', caso, rede, dados: dados(), empresa, rt: RT, uc: null, arvores, limpeza: [],
    data: new Date(2026, 10, 19), assinar: true, imagens: {},
  };
  const texto = textoDoDocumento(montarMemorial(e)).replace(/\[(?:PREENCHER:[^\]]*|COLAR DO GOM)\]/g, 'preenchido');
  const ctx: ContextoTexto = {
    os: '0000000001', caso, rede, nomesDaBase: areas.map((a) => a.nome), arvores, limpeza: [],
    municipioKmz: 'Eusébio', rt: RT, metrosZip: null,
  };
  return { texto, ctx };
}

const de = (itens: ItemConferencia[], nivel: ItemConferencia['nivel']): ItemConferencia[] => itens.filter((i) => i.nivel === nivel);
const codigos = (itens: ItemConferencia[], nivel: ItemConferencia['nivel']): string[] => de(itens, nivel).map((i) => i.codigo);
const troca = (t: string, de1: string, para: string): string => {
  expect(t).toContain(de1);
  return t.split(de1).join(para);
};

describe('conferirTexto: o texto do próprio site', () => {
  it('sai sem nenhum vermelho e sem nenhum amarelo', () => {
    const { texto, ctx } = montar();
    const itens = conferirTexto(texto, ctx);
    expect(de(itens, 'vermelho')).toEqual([]);
    expect(de(itens, 'amarelo')).toEqual([]);
    expect(codigos(itens, 'verde')).toEqual(expect.arrayContaining(['HA_TRECHO', 'METROS', 'TOTAL', 'OS', 'MARCA']));
  });

  it('o texto tem o trecho de 308 m de MT com 0,1848 ha', () => {
    const { texto } = montar();
    expect(texto).toContain('com cerca de 308 metros da rede de média tensão, com área de 0,1848 ha.');
  });

  it('vermelhos primeiro, depois amarelos, depois verdes', () => {
    const { texto, ctx } = montar();
    const itens = conferirTexto(troca(texto, 'Beltrano Exemplo', 'Outro') + '\nXXXX', ctx);
    const ordem = { vermelho: 0, amarelo: 1, verde: 2 };
    const n = itens.map((i) => ordem[i.nivel]);
    expect([...n].sort((a, b) => a - b)).toEqual(n);
  });
});

describe('conferirTexto: vermelhos', () => {
  it('HA_TRECHO: 0,01848 num trecho de 308 m de MT', () => {
    const { texto, ctx } = montar();
    const itens = conferirTexto(troca(texto, 'com área de 0,1848 ha', 'com área de 0,01848 ha'), ctx);
    const v = de(itens, 'vermelho').find((i) => i.codigo === 'HA_TRECHO');
    expect(v).toBeDefined();
    expect(v!.porque).toContain('"');
    expect(v!.porque).toContain('0,01848');
    expect(v!.comoCorrigir).toContain('0,1848');
  });

  it('METROS: metros por tipo diferentes do caso', () => {
    const { texto, ctx } = montar();
    const itens = conferirTexto(troca(texto, 'Serão construídos 400 metros', 'Serão construídos 450 metros'), ctx);
    const v = de(itens, 'vermelho').find((i) => i.codigo === 'METROS');
    expect(v).toBeDefined();
    expect(v!.porque).toContain('450');
  });

  it('METROS: o quadro da extensão total diferente do caso', () => {
    const { texto, ctx } = montar();
    expect(codigos(conferirTexto(troca(texto, 'Média tensão\n400', 'Média tensão\n300'), ctx), 'vermelho')).toContain('METROS');
  });

  it('METROS: sem caso, diferentes dos metros do KML do zip', () => {
    const { texto, ctx } = montar();
    const semCaso: ContextoTexto = { ...ctx, caso: null, rede: null, nomesDaBase: [], metrosZip: { MT: 300 } };
    expect(codigos(conferirTexto(texto, semCaso), 'vermelho')).toContain('METROS');
    expect(codigos(conferirTexto(texto, { ...semCaso, metrosZip: { MT: 400 } }), 'vermelho')).toEqual([]);
  });

  it('TOTAL: o total da área não fecha com a soma dos trechos', () => {
    const { texto, ctx } = montar();
    const itens = conferirTexto(troca(texto, '308 metros (0,1848 ha) estão', '308 metros (0,2000 ha) estão'), ctx);
    expect(codigos(itens, 'vermelho')).toContain('TOTAL');
    expect(codigos(itens, 'vermelho')).not.toContain('HA_TRECHO');
  });

  it('TOTAL: metros do total da área diferentes da soma dos trechos', () => {
    const { texto, ctx } = montar();
    expect(codigos(conferirTexto(troca(texto, 'destes, 308 metros', 'destes, 300 metros'), ctx), 'vermelho')).toContain('TOTAL');
  });

  // decisão do Italo (20/11): a APP não é conferida pelo nome, só pela menção de "APP" e pelo tipo de água
  it('AREA_FALTA: APP do caso sem nenhuma menção de APP no texto dá vermelho', () => {
    const { texto, ctx } = montar();
    const t = texto.replace(/APP DO AÇUDE EXEMPLO/g, 'faixa do açude exemplo').replace(/\bAPP\b|Preservação Permanente/gi, 'faixa');
    const v = de(conferirTexto(t, ctx), 'vermelho').find((i) => i.codigo === 'AREA_FALTA');
    expect(v).toBeDefined();
    expect(v!.titulo + v!.porque).toContain('APP DO AÇUDE EXEMPLO');
  });

  it('AREA_FALTA: APP com outro nome e a mesma água não acusa nada', () => {
    const { texto, ctx } = montar();
    const itens = conferirTexto(troca(texto, 'APP DO AÇUDE EXEMPLO', 'APP DO RESERVATÓRIO OUTRO'), ctx);
    expect(itens.filter((i) => i.codigo === 'AREA_FALTA' && i.nivel !== 'verde')).toEqual([]);
  });

  it('AREA_FALTA: APP com outro tipo de água no texto dá amarelo, não vermelho', () => {
    const { texto, ctx } = montar();
    const itens = conferirTexto(troca(texto, 'APP DO AÇUDE EXEMPLO', 'APP DA LAGOA EXEMPLO'), ctx);
    expect(codigos(itens, 'vermelho')).not.toContain('AREA_FALTA');
    expect(codigos(itens, 'amarelo')).toContain('AREA_FALTA');
  });

  it('AREA_A_MAIS: área da base no texto que a rede não cruza', () => {
    const { texto, ctx } = montar();
    const t = `${texto}\nParte da rede a ser construída está inserida em APA DA SERRA EXEMPLO.`;
    const v = de(conferirTexto(t, ctx), 'vermelho').find((i) => i.codigo === 'AREA_A_MAIS');
    expect(v).toBeDefined();
    expect(v!.porque).toContain('APA DA SERRA EXEMPLO');
  });

  it('a área próxima, citada como "não intervém", não vira AREA_A_MAIS', () => {
    const { texto, ctx } = montar();
    expect(texto).toContain('APA DO MANGUE EXEMPLO');
    expect(codigos(conferirTexto(texto, ctx), 'vermelho')).not.toContain('AREA_A_MAIS');
  });

  // decisão do Italo (20/11): árvore do KML sem coordenada no texto é amarelo; coordenada que não bate é vermelho
  it('ARVORE: árvore do KML sem coordenada no texto dá amarelo', () => {
    const { texto, ctx } = montar();
    const itens = conferirTexto(troca(texto, 'Será feita poda simples em um indivíduo de Mangueira, localizado nas coordenadas (0500050, 9500025).', ''), ctx);
    expect(codigos(itens, 'vermelho')).not.toContain('ARVORE');
    expect(codigos(itens, 'amarelo')).toContain('ARVORE');
  });

  it('ARVORE: coordenada de árvore no texto que não bate com o KML dá vermelho', () => {
    const { texto, ctx } = montar();
    const itens = conferirTexto(troca(texto, '(0500050, 9500025)', '(0500950, 9500925)'), ctx);
    expect(codigos(itens, 'vermelho')).toContain('ARVORE');
  });

  it('ARVORE: "podada ou suprimida" para a mesma árvore', () => {
    const { texto, ctx } = montar();
    const t = troca(texto, 'Será feita poda simples em um indivíduo de Mangueira, localizado nas coordenadas (0500050, 9500025).',
      'Um indivíduo de Mangueira, localizado nas coordenadas (0500050, 9500025), será podada ou suprimida.');
    const v = de(conferirTexto(t, ctx), 'vermelho').find((i) => i.codigo === 'ARVORE');
    expect(v).toBeDefined();
    expect(v!.porque).toContain('podada ou suprimida');
  });

  it('ARVORE: árvore no texto que não está no KML', () => {
    const { texto, ctx } = montar();
    const t = `${texto}\nSerá feita supressão de um indivíduo de Cajueiro, localizado nas coordenadas (0500200, 9500030).`;
    expect(codigos(conferirTexto(t, ctx), 'vermelho')).toContain('ARVORE');
  });

  it('CONTRADICAO: "haverá limpeza de faixa" e "não será necessária limpeza"', () => {
    const { texto, ctx } = montar();
    const t = `${texto}\nHaverá limpeza de faixa de servidão em parte do trecho.`;
    expect(codigos(conferirTexto(t, ctx), 'vermelho')).toContain('CONTRADICAO');
  });

  it('CONTRADICAO: "não haverá poda" com árvore de poda', () => {
    const { texto, ctx } = montar();
    const t = troca(texto, 'haverá poda simples de 1 árvore', 'não haverá poda simples');
    const v = de(conferirTexto(t, ctx), 'vermelho').find((i) => i.codigo === 'CONTRADICAO');
    expect(v).toBeDefined();
    expect(v!.porque).toContain('não haverá poda');
  });

  // revisão final (I6), §6.7: "árvore no KML/SHP sem poda ou supressão no texto, ou o contrário" é vermelho
  it('ARVORE: "haverá poda" no texto sem árvore de poda no caso dá vermelho, e a CONTRADICAO não sai verde', () => {
    const { texto, ctx } = montar({ arvores: [] });
    const itens = conferirTexto(troca(texto, 'não haverá poda simples', 'haverá poda simples de 2 árvores'), ctx);
    const v = de(itens, 'vermelho').filter((i) => i.codigo === 'ARVORE');
    expect(v).toHaveLength(1);
    expect(v[0].titulo).toBe('O texto diz que haverá poda simples, mas o caso não tem');
    expect(v[0].porque).toContain('haverá poda');
    expect(codigos(itens, 'verde')).not.toContain('CONTRADICAO');
    expect(codigos(itens, 'verde')).not.toContain('NAO_TEM');
    expect(itens.some((i) => i.titulo.includes('sem dizer que não haverá'))).toBe(false);
  });

  it('ARVORE: "haverá supressão" no texto sem árvore de supressão no caso dá vermelho', () => {
    const { texto, ctx } = montar();
    const itens = conferirTexto(troca(texto, 'não haverá supressão vegetal de árvore', 'haverá supressão de 1 árvore'), ctx);
    const v = de(itens, 'vermelho').filter((i) => i.codigo === 'ARVORE');
    expect(v.map((i) => i.titulo)).toEqual(['O texto diz que haverá supressão, mas o caso não tem']);
    expect(codigos(itens, 'verde')).not.toContain('CONTRADICAO');
  });

  it('MARCA: [PREENCHER, [COLAR DO GOM] ou XXXX esquecidos', () => {
    const { texto, ctx } = montar();
    for (const marca of ['[PREENCHER: CEP]', '[COLAR DO GOM]', 'Código XXXX']) {
      expect(codigos(conferirTexto(`${texto}\n${marca}`, ctx), 'vermelho')).toContain('MARCA');
    }
  });

  it('OS: o texto cita outra OS de 10 dígitos e não cita a do kit', () => {
    const { texto, ctx } = montar();
    const v = de(conferirTexto(troca(texto, '0000000001', '1234567890'), ctx), 'vermelho').find((i) => i.codigo === 'OS');
    expect(v).toBeDefined();
    expect(v!.porque).toContain('1234567890');
  });

  it('OS: o RNP de 10 dígitos não conta como outra OS', () => {
    const { texto, ctx } = montar();
    expect(texto).toContain('RNP: 0000000000');
    expect(codigos(conferirTexto(texto, ctx), 'vermelho')).not.toContain('OS');
  });

  // o brief pedia vermelho; decisão do Italo de 19/11: texto que não fala nada da intervenção é AMARELO
  it('NAO_TEM: sem nenhuma frase sobre supressão sai amarelo (decisão do Italo, 19/11)', () => {
    const { texto, ctx } = montar();
    const t = troca(texto, ' e não haverá supressão vegetal de árvore', '');
    const itens = conferirTexto(t, ctx);
    expect(codigos(itens, 'vermelho')).not.toContain('NAO_TEM');
    const a = de(itens, 'amarelo').find((i) => i.codigo === 'NAO_TEM');
    expect(a).toBeDefined();
    expect(a!.titulo).toContain('supressão');
    expect(a!.porque).toContain('WorkShop pede escrever que não haverá supressão');
  });

  it('NAO_TEM: o "não" de outro assunto na mesma frase não vale (sem verde falso)', () => {
    const { texto, ctx } = montar({ arvores: [] });
    const t = troca(texto, 'Em toda a extensão da obra, não haverá poda simples e não haverá supressão vegetal de árvore.',
      'Para a passagem da rede, não haverá supressão vegetal e haverá poda simples de 2 árvores.');
    const itens = conferirTexto(t, ctx);
    // revisão final (I6): "haverá poda" sem árvore no caso é o vermelho ARVORE (§6.7), mais forte que o amarelo de antes
    const v = de(itens, 'vermelho').find((i) => i.codigo === 'ARVORE');
    expect(v).toBeDefined();
    expect(v!.titulo).toContain('poda');
    expect(codigos(itens, 'verde')).not.toContain('NAO_TEM');
  });

  it('NAO_TEM: lista de assuntos negados vale para cada um', () => {
    const { texto, ctx } = montar({ arvores: [] });
    const t = troca(texto, 'Em toda a extensão da obra, não haverá poda simples e não haverá supressão vegetal de árvore.',
      'Não será necessário poda, supressão vegetal e nem limpeza de faixa.');
    expect(codigos(conferirTexto(t, ctx), 'amarelo')).not.toContain('NAO_TEM');
  });

  it('NAO_TEM: formas comuns de negação valem ("necessidade de", "serão realizadas", "prevista")', () => {
    const { texto, ctx } = montar({ arvores: [] });
    const veg = 'Em toda a extensão da obra, não haverá poda simples e não haverá supressão vegetal de árvore.';
    const limp = 'Para a passagem da rede, não será necessária limpeza de faixa de servidão.';
    const t = troca(troca(texto, veg, 'Não haverá necessidade de supressão. Não serão realizadas podas.'), limp, 'Não está prevista limpeza de faixa.');
    const itens = conferirTexto(t, ctx);
    expect(codigos(itens, 'amarelo')).not.toContain('NAO_TEM');
    expect(codigos(itens, 'verde')).toContain('NAO_TEM');
    // e cada uma sozinha, sem as outras frases, é o que tira o amarelo
    for (const [frase, assunto] of [['Não haverá necessidade de supressão.', 'supressão'], ['Não serão realizadas podas.', 'poda'], ['Não está prevista limpeza de faixa.', 'limpeza']]) {
      const sem = troca(troca(texto, veg, `${frase} Não haverá qualquer poda simples nem supressão vegetal.`), limp, frase);
      const a = de(conferirTexto(sem, ctx), 'amarelo').filter((i) => i.codigo === 'NAO_TEM' && i.titulo.includes(assunto));
      expect(a, frase).toEqual([]);
    }
  });

  it('NAO_TEM: amarelo quando a frase é ambígua ("supressão, se necessário")', () => {
    const { texto, ctx } = montar();
    const t = troca(texto, 'não haverá supressão vegetal de árvore', 'haverá supressão, se necessário');
    const itens = conferirTexto(t, ctx);
    expect(codigos(itens, 'vermelho')).not.toContain('NAO_TEM');
    const a = de(itens, 'amarelo').find((i) => i.codigo === 'NAO_TEM');
    expect(a).toBeDefined();
    expect(a!.porque).toContain('se necessário');
  });

  // decisão do Italo de 19/11: amarelo, não vermelho
  it('NAO_TEM: sem frase sobre abertura de vias sai amarelo (decisão do Italo, 19/11)', () => {
    const { texto, ctx } = montar();
    const t = troca(texto, 'A obra aproveita os acessos existentes e não haverá abertura de vias e caminhos para a passagem da rede.', '');
    const itens = conferirTexto(t, ctx);
    expect(codigos(itens, 'vermelho')).not.toContain('NAO_TEM');
    expect(codigos(itens, 'amarelo')).toContain('NAO_TEM');
  });

  it('METROS: cada frase confere só os tipos que cita (sem vermelho falso)', () => {
    const { ctx } = montar();
    const semCaso: ContextoTexto = { ...ctx, caso: null, rede: null, nomesDaBase: [], metrosZip: { MT: 400, BT: 120 } };
    const t = 'Serão construídos 400 metros de rede de média tensão. A obra contempla 120 metros de rede de baixa tensão para atender a UC.';
    const itens = conferirTexto(t, semCaso).filter((i) => i.codigo === 'METROS');
    expect(itens.filter((i) => i.nivel === 'vermelho')).toEqual([]);
    expect(itens.map((i) => i.nivel)).toContain('verde');
    const t2 = 'Serão construídos 400 metros de rede de média tensão. A obra contempla 130 metros de rede de baixa tensão para atender a UC.';
    expect(codigos(conferirTexto(t2, semCaso), 'vermelho')).toContain('METROS');
  });

  // revisão final (I5): um memorial que se contradiz nos metros nunca sai verde
  it('METROS: duas frases do mesmo tipo com metros diferentes dão vermelho, com os dois valores', () => {
    const { texto, ctx } = montar();
    const itens = conferirTexto(`${texto}
Serão construídos 180 metros de rede aérea de média tensão 13,8 kV.`, ctx);
    const v = de(itens, 'vermelho').filter((i) => i.codigo === 'METROS');
    expect(v).toHaveLength(1);
    expect(v[0].porque).toContain('400');
    expect(v[0].porque).toContain('180');
    expect(codigos(itens, 'verde')).not.toContain('METROS');
  });

  it('METROS: frases de trechos do mesmo tipo que somam os metros seguem sem vermelho', () => {
    const { ctx } = montar();
    const semCaso: ContextoTexto = { ...ctx, caso: null, rede: null, nomesDaBase: [], metrosZip: { MT: 400 } };
    const t = 'Serão construídos 300 metros de rede de média tensão no primeiro trecho. Serão construídos 100 metros de rede de média tensão no segundo trecho.';
    const itens = conferirTexto(t, semCaso).filter((i) => i.codigo === 'METROS');
    expect(itens.map((i) => i.nivel)).toEqual(['verde']);
  });

  it('TOTAL: "m etros" depois de um trecho legível na mesma frase dá amarelo, não vermelho nem verde', () => {
    const { ctx } = montar();
    const semCaso: ContextoTexto = { ...ctx, caso: null, rede: null, nomesDaBase: [], arvores: [], metrosZip: null };
    const t = 'A intervenção na APP X ocorrerá com 100 metros da rede de média tensão (0,0600 ha) e 308 m etros da rede de baixa tensão (0,0924 ha). '
      + 'Ao todo, o projeto possui 408 metros de extensão; destes, 408 metros (0,1524 ha) estão inseridos em APP X.';
    const itens = conferirTexto(t, semCaso);
    expect(codigos(itens, 'vermelho')).toEqual([]);
    expect(codigos(itens, 'amarelo')).toEqual(expect.arrayContaining(['TRECHO_ILEGIVEL', 'TOTAL']));
    expect(codigos(itens, 'verde')).not.toContain('HA_TRECHO');
    expect(codigos(itens, 'verde')).not.toContain('TOTAL');
  });

  it('TOTAL: palavra partida dentro de um trecho ("m etros") dá amarelo, não vermelho', () => {
    const { ctx } = montar();
    const semCaso: ContextoTexto = { ...ctx, caso: null, rede: null, nomesDaBase: [], arvores: [], metrosZip: null };
    const t = 'A intervenção na APP X ocorrerá com cerca de 308 metros da rede de média tensão, com área de 0,1848 ha. '
      + 'A intervenção na APP X ocorrerá com cerca de 308 m etros da rede de média tensão, com área de 0,1848 ha. '
      + 'Ao todo, o projeto possui 616 metros de extensão; destes, 616 metros (0,3696 ha) estão inseridos em APP X.';
    const itens = conferirTexto(t, semCaso);
    expect(codigos(itens, 'vermelho')).toEqual([]);
    expect(codigos(itens, 'amarelo')).toEqual(expect.arrayContaining(['TRECHO_ILEGIVEL', 'TOTAL']));
    expect(codigos(itens, 'verde')).not.toContain('HA_TRECHO');
    expect(codigos(itens, 'verde')).not.toContain('TOTAL');
  });
});

describe('conferirTexto: amarelos', () => {
  it('CEP ausente', () => {
    const { texto, ctx } = montar();
    expect(codigos(conferirTexto(troca(texto, 'CEP: 00000-000', 'CEP: '), ctx), 'amarelo')).toContain('CEP');
    expect(codigos(conferirTexto(texto, { ...ctx, cepVazio: true }), 'amarelo')).toContain('CEP');
  });

  it('MUNICIPIO: município do texto diferente do KMZ', () => {
    const { texto, ctx } = montar();
    const a = de(conferirTexto(texto, { ...ctx, municipioKmz: 'Aquiraz' }), 'amarelo').find((i) => i.codigo === 'MUNICIPIO');
    expect(a).toBeDefined();
    expect(a!.porque).toContain('Aquiraz');
  });

  it('RT: nome diferente do guardado', () => {
    const { texto, ctx } = montar();
    expect(codigos(conferirTexto(texto, { ...ctx, rt: { ...RT, nome: 'Sicrano Exemplo' } }), 'amarelo')).toContain('RT');
  });

  it('PROXIMA: área a menos de 100 m sem a frase "não intervém"', () => {
    const { texto, ctx } = montar();
    const t = texto.split('\n').filter((l) => !l.includes('não intervém')).join('\n');
    const itens = conferirTexto(t, ctx);
    expect(codigos(itens, 'amarelo')).toContain('PROXIMA');
    expect(codigos(itens, 'vermelho')).toEqual([]);
  });

  it('POSTE: número de poste do trecho diferente do DXF', () => {
    const { texto, ctx } = montar();
    const a = de(conferirTexto(troca(texto, 'poste Nº 2 (0500308, 9500020)', 'poste Nº 7 (0500308, 9500020)'), ctx), 'amarelo').find((i) => i.codigo === 'POSTE');
    expect(a).toBeDefined();
    expect(a!.porque).toContain('7');
  });

  it('COORD: coordenada de poste diferente em mais de 5 m', () => {
    const { texto, ctx } = montar();
    const itens = conferirTexto(troca(texto, 'poste Nº 2 (0500308, 9500020)', 'poste Nº 2 (0500318, 9500020)'), ctx);
    expect(codigos(itens, 'amarelo')).toContain('COORD');
    expect(codigos(itens, 'vermelho')).toEqual([]);
  });

  it('COORD: até 5 m não avisa', () => {
    const { texto, ctx } = montar();
    expect(codigos(conferirTexto(troca(texto, 'poste Nº 2 (0500308, 9500020)', 'poste Nº 2 (0500311, 9500020)'), ctx), 'amarelo')).toEqual([]);
  });

  it('DIGITACAO: "rede área", "13.8KVA" e palavra partida "n o"', () => {
    const { texto, ctx } = montar();
    for (const erro of ['Será construída a rede área.', 'Tensão de 13.8KVA.', 'A intervenção n o poste.']) {
      const a = de(conferirTexto(`${texto}\n${erro}`, ctx), 'amarelo').find((i) => i.codigo === 'DIGITACAO');
      expect(a, erro).toBeDefined();
    }
  });

  it('DIGITACAO: a lista curta de erros comuns tem título e como corrigir', () => {
    expect(ERROS_COMUNS.length).toBeGreaterThanOrEqual(3);
    for (const e of ERROS_COMUNS) {
      expect(e.titulo).not.toBe('');
      expect(e.comoCorrigir).not.toBe('');
      expect(`${e.titulo}${e.comoCorrigir}`).not.toContain('—');
    }
  });

  it('caso null: amarelo dos passos 1 a 5 e nenhum vermelho de área', () => {
    const { texto, ctx } = montar();
    const semCaso: ContextoTexto = { ...ctx, caso: null, rede: null, nomesDaBase: [], metrosZip: null };
    const t = troca(texto, 'APP DO AÇUDE EXEMPLO', 'APP DA LAGOA EXEMPLO');
    const itens = conferirTexto(t, semCaso);
    expect(codigos(itens, 'vermelho')).toEqual([]);
    const a = de(itens, 'amarelo').find((i) => i.porque.includes('faça os passos 1 a 5 com o KML da rede deste zip') || i.titulo.includes('faça os passos 1 a 5 com o KML da rede deste zip'));
    expect(a).toBeDefined();
  });

  it('caso null: ainda confere hectares, total e marcas', () => {
    const { texto, ctx } = montar();
    const semCaso: ContextoTexto = { ...ctx, caso: null, rede: null, nomesDaBase: [], metrosZip: null };
    expect(codigos(conferirTexto(troca(texto, 'com área de 0,1848 ha', 'com área de 0,01848 ha'), semCaso), 'vermelho')).toContain('HA_TRECHO');
    expect(codigos(conferirTexto(troca(texto, '308 metros (0,1848 ha) estão', '308 metros (0,2000 ha) estão'), semCaso), 'vermelho')).toContain('TOTAL');
    expect(codigos(conferirTexto(`${texto}\nXXXX`, semCaso), 'vermelho')).toContain('MARCA');
  });
});

describe('lerTrechos: texto de memorial real (Review Focus 3)', () => {
  it('"1.036 metros" lê 1036', () => {
    const t = lerTrechos('A intervenção na APP ocorrerá entre o poste Nº 1 e o poste Nº 9, com cerca de 1.036 metros da rede de média tensão, com área de 0,6216 ha.');
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ metros: 1036, tipo: 'MT', ha: 0.6216 });
  });

  it('"0,1848ha", "0,1848 hectares" e "0,1848 ha" leem 0,1848', () => {
    for (const ha of ['0,1848ha', '0,1848 hectares', '0,1848 ha']) {
      const t = lerTrechos(`A intervenção na APP ocorrerá com cerca de 308 metros da rede de média tensão, com área de ${ha}.`);
      expect(t, ha).toHaveLength(1);
      expect(t[0].ha, ha).toBeCloseTo(0.1848, 10);
    }
  });

  it('frase quebrada no meio por "\\n" lê igual', () => {
    const inteira = lerTrechos('A intervenção na APP ocorrerá com cerca de 308 metros da rede de média tensão, com área de 0,1848 ha.');
    const quebrada = lerTrechos('A intervenção na APP ocorrerá com cerca de 308\nmetros da rede de mé-\ndia tensão, com área\nde 0,1848 ha.');
    expect(quebrada.map(({ metros, tipo, ha }) => ({ metros, tipo, ha }))).toEqual(inteira.map(({ metros, tipo, ha }) => ({ metros, tipo, ha })));
  });

  it('"média e baixa tensão (conjugada)": a conjugada ganha', () => {
    const t = lerTrechos('A intervenção na APP ocorrerá com cerca de 50 metros da rede de média e baixa tensão (conjugada), com área de 0,0300 ha.');
    expect(t[0].tipo).toBe('CONJ');
  });

  it('BT e trechos com o hectare entre parênteses', () => {
    const t = lerTrechos('Foram considerados 16 metros (0,0096 ha) de rede de média tensão e 23 metros (0,0069 ha) de rede de baixa tensão, resultando em uma área total de 0,0165 ha.');
    expect(t.map((x) => [x.metros, x.tipo, x.ha])).toEqual([[16, 'MT', 0.0096], [23, 'BT', 0.0069]]);
  });

  it('frase sem hectare não é trecho; o total "Ao todo" também não', () => {
    expect(lerTrechos('Serão construídos 400 metros de rede aérea de média tensão 13,8 kV em cabo CAA 1/0 AWG.')).toEqual([]);
    expect(lerTrechos('Ao todo, o projeto possui 400 metros de extensão; destes, 308 metros (0,1848 ha) estão inseridos em APP X.')).toEqual([]);
  });

  it('trecho de intervenção sem hectare legível sai com ha null e vira amarelo TRECHO_ILEGIVEL', () => {
    const frase = 'A intervenção na APP DO AÇUDE EXEMPLO ocorrerá entre o poste Nº 1 (0500000, 9500020) e o poste Nº 2 (0500308, 9500020), com cerca de 308 metros da rede de média tensão, com área de 0,18 4 ha.';
    expect(lerTrechos(frase)[0]).toMatchObject({ metros: 308, ha: null });
    const { texto, ctx } = montar();
    const t = troca(texto, 'com área de 0,1848 ha.', 'com área de 0,18 4 ha.');
    const itens = conferirTexto(t, ctx);
    expect(codigos(itens, 'amarelo')).toContain('TRECHO_ILEGIVEL');
    expect(codigos(itens, 'vermelho')).not.toContain('HA_TRECHO');
    expect(codigos(itens, 'verde')).not.toContain('HA_TRECHO');
  });
});

describe('conferirTexto: obra sem intervenção e obra só de poste (Review Focus 5)', () => {
  it('sem intervenção: nenhum vermelho de trecho', () => {
    const { texto, ctx } = montar({ confirmadas: [] });
    expect(texto).not.toContain('ocorrerá entre');
    const itens = conferirTexto(texto, ctx);
    expect(de(itens, 'vermelho')).toEqual([]);
    expect(de(itens, 'amarelo')).toEqual([]);
  });

  it('só de poste: nenhum vermelho de trecho nem de metros', () => {
    const rede: Rede = { origem: 'dxf', vaos: [], postes: [poste('p1', pt(50, 20), '3')] };
    const { texto, ctx } = montar({ rede, arvores: [] });
    expect(texto).toContain('não haverá extensão de rede');
    const itens = conferirTexto(texto, ctx);
    expect(de(itens, 'vermelho')).toEqual([]);
    expect(de(itens, 'amarelo')).toEqual([]);
  });

  it('só de poste: texto que diz ter rede é vermelho de metros', () => {
    const rede: Rede = { origem: 'dxf', vaos: [], postes: [poste('p1', pt(50, 20), '3')] };
    const { texto, ctx } = montar({ rede, arvores: [] });
    expect(codigos(conferirTexto(troca(texto, 'Média tensão\n0', 'Média tensão\n120'), ctx), 'vermelho')).toContain('METROS');
  });
});

// ---------- Tarefa 12: conferência da Planilha Padrão contra o memorial ----------
// A planilha é a inventada do teste (nada da Enel), preenchida pelo próprio site (Tarefa 9) e lida de volta.
const LAGOA: AreaConfirmada = { nome: 'APP DA LAGOA EXEMPLO', tipo: 'APP', poligonos: [[retangulo(0, 0, 308, 40)]], largura: 100, aguaId: 77 };
const NOME_PLANILHA = 'SOB 0000000000_Planilha Inventada_REV 09_20.03.2026.xlsm';

interface ComPlanilha { linha: Partial<Record<Campo, string>>; pctx: Parameters<typeof conferirPlanilha>[1]; texto: string }
function comPlanilha(p: { uc?: SituacaoUc | null; arvores?: Arvore[] } = {}): ComPlanilha {
  const uc = p.uc ?? null;
  const { texto, ctx } = montar({ confirmadas: [LAGOA], arvores: p.arvores });
  const d = dados();
  d.tipoAgua = { 77: 'lagoa' };
  const r = preencherPlanilha(lerPlanilha(planilhaInventada({ linhaCabecalho: 4 }), NOME_PLANILHA),
    { os: '0000000001', caso: ctx.caso!, rede: ctx.rede!, dados: d, empresa, uc: uc ?? UC_FORA, arvores: ctx.arvores, limpeza: [], assinatura: null }, ', ');
  const pl = lerPlanilha(r.bytes, r.nome);
  const assunto = (lerCelulas(pl.pasta, pl.aba).get('A1') ?? '').split(/\r?\n/).pop()!;
  return { linha: lerLinhaDaObra(pl), pctx: { ...ctx, uc, textoMemorial: texto, assunto }, texto };
}
const UC_FORA: SituacaoUc = { ponto: pt(450, 20), dentro: [], emApp: false };

describe('conferirPlanilha', () => {
  it('a linha de uma planilha preenchida pelo site sai toda verde', () => {
    const { linha, pctx } = comPlanilha();
    expect(linha.metrosMT).toBe('400');
    expect(linha.poda).toBe('SIM');
    expect(linha.appRede).toBe('SIM (LAGOS/LAGOAS NATURAIS)');
    expect(pctx.assunto).toBe('SOB 0000000001_PROCESSO DOCUMENTAL_PARTE DA REDE EM APP');
    const itens = conferirPlanilha(linha, pctx);
    expect(itens.filter((i) => i.nivel !== 'verde')).toEqual([]);
    expect(codigos(itens, 'verde')).toEqual(expect.arrayContaining(['PLANILHA_METROS', 'PLANILHA_PODA', 'PLANILHA_SUPRESSAO', 'PLANILHA_APP', 'PLANILHA_ASSUNTO']));
  });

  it('com a UC fora de área, a planilha do site também sai toda verde', () => {
    const { linha, pctx } = comPlanilha({ uc: UC_FORA });
    expect(conferirPlanilha(linha, pctx).filter((i) => i.nivel !== 'verde')).toEqual([]);
  });

  it('PLANILHA_METROS: metros trocados dão vermelho', () => {
    const { linha, pctx } = comPlanilha();
    const v = de(conferirPlanilha({ ...linha, metrosMT: '300' }, pctx), 'vermelho');
    expect(v.map((i) => i.codigo)).toEqual(['PLANILHA_METROS']);
    expect(v[0].porque).toContain('300');
    expect(v[0].comoCorrigir).toContain('400');
  });

  it('PLANILHA_PODA: "SIM" com o memorial dizendo "não haverá poda simples" dá vermelho', () => {
    const { linha, pctx, texto } = comPlanilha({ arvores: [] });
    expect(texto).toContain('não haverá poda simples');
    expect(linha.poda).toBe('NÃO');
    const v = de(conferirPlanilha({ ...linha, poda: 'SIM' }, pctx), 'vermelho');
    expect(v.map((i) => i.codigo)).toEqual(['PLANILHA_PODA']);
    expect(v[0].porque).toContain('não haverá poda simples');
  });

  it('PLANILHA_PODA: "NÃO" com o memorial dizendo que haverá poda dá vermelho', () => {
    const { linha, pctx } = comPlanilha();
    expect(codigos(conferirPlanilha({ ...linha, poda: 'NÃO' }, pctx), 'vermelho')).toEqual(['PLANILHA_PODA']);
  });

  it('PLANILHA_APP: "SIM (LAGOS/LAGOAS NATURAIS)" com o memorial falando em açude dá vermelho', () => {
    const { linha, pctx, texto } = comPlanilha();
    const memorial = troca(texto, 'APP DA LAGOA EXEMPLO', 'APP DO AÇUDE EXEMPLO');
    const v = de(conferirPlanilha(linha, { ...pctx, textoMemorial: memorial }), 'vermelho');
    expect(v.map((i) => i.codigo)).toEqual(['PLANILHA_APP']);
    expect(v[0].porque).toContain('SIM (LAGOS/LAGOAS NATURAIS)');
  });

  it('PLANILHA_APP: "NÃO" com o memorial falando de intervenção em APP dá vermelho', () => {
    const { linha, pctx } = comPlanilha();
    expect(codigos(conferirPlanilha({ ...linha, appRede: 'NÃO' }, pctx), 'vermelho')).toEqual(['PLANILHA_APP']);
  });

  it('PLANILHA_APP: o memorial cita mais um tipo de água que a planilha não marca: amarelo, não vermelho', () => {
    const { linha, pctx, texto } = comPlanilha();
    const memorial = `${texto}\nA intervenção na APP do Riacho Exemplo ocorrerá com cerca de 10 metros da rede de média tensão, com área de 0,0060 ha.`;
    const itens = conferirPlanilha(linha, { ...pctx, textoMemorial: memorial });
    expect(codigos(itens, 'vermelho')).toEqual([]);
    expect(codigos(itens, 'amarelo')).toContain('PLANILHA_APP');
  });

  it('PLANILHA_ASSUNTO: "UC E REDE" com a UC fora da área dá vermelho', () => {
    const { linha, pctx } = comPlanilha({ uc: UC_FORA });
    const v = de(conferirPlanilha(linha, { ...pctx, assunto: 'SOB 0000000001_PROCESSO DOCUMENTAL_UC E REDE EM APP' }), 'vermelho');
    expect(v.map((i) => i.codigo)).toEqual(['PLANILHA_ASSUNTO']);
    expect(v[0].comoCorrigir).toContain('SOB 0000000001_PROCESSO DOCUMENTAL_PARTE DA REDE EM APP');
  });

  // revisão final (I1): sem saber onde está a UC, o assunto nunca sai verde
  it('PLANILHA_ASSUNTO: UC não marcada (undefined) dá amarelo, com "REDE EM" e com "UC E REDE EM"', () => {
    const { linha, pctx } = comPlanilha({ uc: UC_FORA });
    for (const assunto of ['SOB 0000000001_PROCESSO DOCUMENTAL_PARTE DA REDE EM APP', 'SOB 0000000001_PROCESSO DOCUMENTAL_UC E PARTE DA REDE EM APP']) {
      const a = conferirPlanilha(linha, { ...pctx, uc: undefined, assunto }).filter((i) => i.codigo === 'PLANILHA_ASSUNTO');
      expect(a.map((i) => i.nivel)).toEqual(['amarelo']);
      expect(a[0].porque).toContain('UC');
    }
  });

  it('PLANILHA_ASSUNTO: outra OS no assunto dá vermelho; "XXXXXXXXXX" do modelo dá amarelo', () => {
    const { linha, pctx } = comPlanilha();
    expect(codigos(conferirPlanilha(linha, { ...pctx, assunto: 'SOB 1234567890_PROCESSO DOCUMENTAL_PARTE DA REDE EM APP' }), 'vermelho')).toEqual(['PLANILHA_ASSUNTO']);
    const itens = conferirPlanilha(linha, { ...pctx, assunto: 'SOB XXXXXXXXXX_PROCESSO DOCUMENTAL_PARTE DA REDE EM APP' });
    expect(codigos(itens, 'vermelho')).toEqual([]);
    expect(codigos(itens, 'amarelo')).toContain('PLANILHA_ASSUNTO');
  });

  it('sem memorial e sem caso: nada vermelho, os itens saem amarelos', () => {
    const { linha, pctx } = comPlanilha();
    const itens = conferirPlanilha(linha, { ...pctx, caso: null, rede: null, metrosZip: null, textoMemorial: null });
    expect(codigos(itens, 'vermelho')).toEqual([]);
    expect(codigos(itens, 'amarelo')).toEqual(expect.arrayContaining(['PLANILHA_METROS', 'PLANILHA_PODA', 'PLANILHA_APP', 'PLANILHA_ASSUNTO']));
  });
});

// ---------- Decisões do Italo de 20/11 (Tarefa 12, retomada) ----------
const UC_EST = ['Unidade de Conservação Estadual', 'Uso Sustentável'];

describe('decisões de 20/11: nome da área por palavras-chave, folga de metros e subterrânea', () => {
  const CRUZA = area('APA DA SERRA VERDE EXEMPLO', UC_EST, 0, 0, 200, 40);

  it('área do KMZ citada com prefixo diferente ("área de proteção ambiental (APA) da ...") não acusa nada', () => {
    const { texto, ctx } = montar({ areas: [CRUZA, LONGE] });
    expect(texto).toContain('APA DA SERRA VERDE EXEMPLO');
    const t = texto.split('APA DA SERRA VERDE EXEMPLO').join('área de proteção ambiental (APA) da Serra Verde Exemplo');
    const itens = conferirTexto(t, ctx);
    expect(itens.filter((i) => i.codigo === 'AREA_FALTA' && i.nivel !== 'verde')).toEqual([]);
  });

  it('área do KMZ que o texto não cita pelas palavras-chave dá amarelo, nunca vermelho', () => {
    const { texto, ctx } = montar({ areas: [CRUZA, LONGE] });
    const itens = conferirTexto(texto.split('APA DA SERRA VERDE EXEMPLO').join('APA DO MORRO EXEMPLO'), ctx);
    expect(de(itens, 'vermelho').map((i) => `${i.codigo}: ${i.porque}`)).toEqual([]);
    const a = de(itens, 'amarelo').find((i) => i.codigo === 'AREA_FALTA');
    expect(a).toBeDefined();
    expect(a!.titulo + a!.porque).toContain('APA DA SERRA VERDE EXEMPLO');
  });

  // revisão da Tarefa 12 (rodada 1): as palavras-chave só valem em frase de intervenção, nunca no endereço, no município
  // ou no "não intervém"; palavra que identifica a área ("vida", "terra", "parque"...) não é genérica
  it('área com o nome do município, citada só no endereço, dá amarelo (sem verde falso)', () => {
    const SERRA_ALTA = area('APA DA SERRA ALTA', UC_EST, 0, 0, 200, 40);
    const { texto, ctx } = montar({ areas: [SERRA_ALTA, LONGE] });
    const t = `${texto.split('APA DA SERRA ALTA').join('APA DO MORRO EXEMPLO')}\nEndereço: Rua Exemplo, 10, Centro, Serra Alta-CE.\nA obra fica no município de Serra Alta.`;
    const itens = conferirTexto(t, { ...ctx, municipioKmz: 'Serra Alta' });
    expect(codigos(itens, 'vermelho')).not.toContain('AREA_FALTA');
    expect(codigos(itens, 'amarelo')).toContain('AREA_FALTA');
    expect(codigos(itens, 'verde')).not.toContain('AREA_FALTA');
  });

  it('área citada por palavras que também são do nome do município dá amarelo "confira"', () => {
    const SERRA_ALTA = area('APA DA SERRA ALTA', UC_EST, 0, 0, 200, 40);
    const { texto, ctx } = montar({ areas: [SERRA_ALTA, LONGE] });
    const t = texto.split('APA DA SERRA ALTA').join('área de proteção ambiental (APA) Serra Alta');
    const itens = conferirTexto(t, { ...ctx, municipioKmz: 'Serra Alta' });
    expect(codigos(itens, 'vermelho')).not.toContain('AREA_FALTA');
    expect(codigos(itens, 'amarelo')).toContain('AREA_FALTA');
  });

  it('área do KMZ escrita igual numa frase de intervenção, mesmo com o nome do município, sai verde', () => {
    const SERRA_ALTA = area('APA DA SERRA ALTA', UC_EST, 0, 0, 200, 40);
    const { texto, ctx } = montar({ areas: [SERRA_ALTA, LONGE] });
    expect(codigos(conferirTexto(texto, { ...ctx, municipioKmz: 'Serra Alta' }), 'verde')).toContain('AREA_FALTA');
  });

  it('"PA NOVA VIDA" com o texto só falando em "rede nova" dá amarelo', () => {
    const NOVA_VIDA = area('PA NOVA VIDA', UC_EST, 0, 0, 200, 40);
    const { texto, ctx } = montar({ areas: [NOVA_VIDA, LONGE] });
    const t = `${texto.split('PA NOVA VIDA').join('APA DO MORRO EXEMPLO')}\nA intervenção da rede nova ocorrerá dentro da faixa de servidão.`;
    const itens = conferirTexto(t, ctx);
    expect(codigos(itens, 'vermelho')).not.toContain('AREA_FALTA');
    expect(codigos(itens, 'amarelo')).toContain('AREA_FALTA');
  });

  it('área citada só numa frase de "não intervém" dá amarelo', () => {
    const BRANCA = area('POLIGONAL_SERRA BRANCA EXEMPLO', UC_EST, 0, 0, 200, 40);
    const { texto, ctx } = montar({ areas: [BRANCA, LONGE] });
    const t = `${texto.split('POLIGONAL_SERRA BRANCA EXEMPLO').join('APA DO MORRO EXEMPLO')}\nA obra não intervém no perímetro Serra Branca Exemplo.`;
    expect(codigos(conferirTexto(t, ctx), 'amarelo')).toContain('AREA_FALTA');
  });

  it('AREA_A_MAIS: o nome da área cruzada escrito de outro jeito sai da frase e não vira outra área da base', () => {
    const POLIGONO = area('POLÍGONO PEDRA SERRA CAMPOS SEM ASSENTAMENTO', UC_EST, 0, 0, 200, 40);
    const OUTRA = area('Serra Campos', UC_EST, 3000, 3000, 3100, 3100);
    const { texto, ctx } = montar({ areas: [POLIGONO, OUTRA] });
    const t = texto.split('POLÍGONO PEDRA SERRA CAMPOS SEM ASSENTAMENTO').join('perímetro irrigado Poligonal Pedra Serra Campos');
    const itens = conferirTexto(t, ctx);
    expect(codigos(itens, 'vermelho')).not.toContain('AREA_A_MAIS');
    expect(itens.filter((i) => i.codigo === 'AREA_FALTA' && i.nivel !== 'verde')).toEqual([]);
  });

  it('METROS: diferença até max(2 m, 3%) do caso dá amarelo; acima, vermelho', () => {
    const { texto, ctx } = montar();
    const perto = conferirTexto(troca(texto, 'Serão construídos 400 metros', 'Serão construídos 405 metros'), ctx);
    expect(codigos(perto, 'vermelho')).not.toContain('METROS');
    const a = de(perto, 'amarelo').find((i) => i.codigo === 'METROS');
    expect(a).toBeDefined();
    expect(a!.porque).toContain('KML e o CAD costumam diferir um pouco');
    expect(codigos(conferirTexto(troca(texto, 'Serão construídos 400 metros', 'Serão construídos 413 metros'), ctx), 'vermelho')).toContain('METROS');
  });

  it('METROS: a extensão do projeto na folga dá amarelo', () => {
    const { texto, ctx } = montar();
    const itens = conferirTexto(troca(texto, 'possui 400 metros de extensão', 'possui 402 metros de extensão'), ctx);
    expect(codigos(itens, 'vermelho')).not.toContain('METROS');
    expect(codigos(itens, 'amarelo')).toContain('METROS');
  });

  it('METROS: a rede subterrânea de MT soma com a aérea (a Tarefa 2 conta a subterrânea como MT)', () => {
    const { ctx } = montar();
    const semCaso: ContextoTexto = { ...ctx, caso: null, rede: null, nomesDaBase: [], arvores: [], metrosZip: { MT: 400 } };
    const t = 'Serão construídos 300 metros de rede aérea de média tensão e 100 metros de rede subterrânea de média tensão.';
    const itens = conferirTexto(t, semCaso).filter((i) => i.codigo === 'METROS');
    expect(itens.map((i) => i.nivel)).toEqual(['verde']);
  });

  it('PLANILHA_METROS: diferença na folga dá amarelo, não vermelho', () => {
    const { linha, pctx } = comPlanilha();
    const itens = conferirPlanilha({ ...linha, metrosMT: '403' }, pctx);
    expect(codigos(itens, 'vermelho')).toEqual([]);
    const a = de(itens, 'amarelo').find((i) => i.codigo === 'PLANILHA_METROS');
    expect(a).toBeDefined();
    expect(a!.porque).toContain('KML e o CAD costumam diferir um pouco');
  });
});
