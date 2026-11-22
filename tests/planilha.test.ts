import { describe, expect, it } from 'vitest';
import { abrirXlsx, gravarCelulas, gravarXlsx, lerCelulas, listaDaCelula, serialDaData } from '../src/nucleo/xlsx';
import {
  escolherOpcao, lerLinhaDaObra, lerPlanilha, nomeDaPlanilha, opcaoDoAlvo, preencherPlanilha, revisaoDoNome, valoresDesejados,
  type EntradaPlanilha, type Planilha,
} from '../src/nucleo/planilha';
import { ERRO_NAO_E_PLANILHA, REGRAS_COLUNAS, SEPARADOR_LISTA } from '../src/regras/planilha';
import { abrirZip } from '../src/nucleo/zip';
import { calcularCaso, type AreaConfirmada } from '../src/nucleo/caso';
import { dadosVazios, metrosDaRede, type DadosObra, type Empresa, type Imagem } from '../src/nucleo/obra';
import { assuntoTexto, partesDoAssunto, textoCurto } from '../src/nucleo/assunto';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas';
import type { Arvore } from '../src/nucleo/arvores';
import type { Pt, Rede, TipoRede, Vao } from '../src/nucleo/tipos';
import type { SituacaoUc } from '../src/nucleo/uc';
import { A1_INVENTADA, CABECALHOS, NOME_ABA, OPCOES_APP, planilhaInventada, planilhaSemSob } from './ajuda/planilha-inventada';

const NOME = 'SOB 0000000001_Planilha Padrão de Entrega Inventada_REV 09_20.03.2026.xlsm';
const letraDe = (titulo: string): string => {
  const i = CABECALHOS.indexOf(titulo) + 1;
  return String.fromCharCode(64 + i);
};

describe('abrirXlsx e lerCelulas', () => {
  it('acha a aba e lê texto compartilhado, texto na célula e número', () => {
    const p = abrirXlsx(planilhaInventada({ linhaCabecalho: 4 }));
    expect(p.abas.map((a) => a.nome)).toEqual([NOME_ABA]);
    expect(p.abas[0].caminho).toBe('xl/worksheets/sheet1.xml');
    expect(p.partes.has('xl/vbaProject.bin')).toBe(true);
    const c = lerCelulas(p, NOME_ABA);
    expect(c.get('A1')).toBe(A1_INVENTADA);
    expect(c.get('A2')).toBe('PLANILHA INVENTADA PARA TESTE');
    expect(c.get('A4')).toBe('SOB');
    expect(c.get('A5')).toBe('1');
    expect(c.get(`${letraDe('DATA ENTREGA PROCESSO DOCUMENTAL VIA E-MAIL')}5`)).toBe('46000');
    expect(c.get('A16')).toBe('Assinatura Responsável Técnico');
  });

  it('bytes que não são zip: "Este arquivo não é uma planilha do Excel"', () => {
    expect(() => abrirXlsx(new TextEncoder().encode('isto não é um zip'))).toThrow('Este arquivo não é uma planilha do Excel');
  });

  it('listaDaCelula: faixa com nome da aba, nome definido + lista entre aspas juntos, outra pasta é null, sem validação é null', () => {
    const p = abrirXlsx(planilhaInventada({ linhaCabecalho: 4 }));
    expect(listaDaCelula(p, NOME_ABA, `${letraDe(CABECALHOS[7])}5`)).toEqual(OPCOES_APP);
    expect(listaDaCelula(p, NOME_ABA, `${letraDe('PODA SIMPLES?')}5`)).toEqual(['SIM', 'NÃO']);
    expect(listaDaCelula(p, NOME_ABA, `${letraDe('ZONA')}5`)).toEqual(['RURAL', 'URBANA', 'MISTA']);
    expect(listaDaCelula(p, NOME_ABA, `${letraDe('NOME EMPRESA PARCEIRA')}5`)).toBeNull();
    expect(listaDaCelula(p, NOME_ABA, 'B5')).toBeNull();
  });
});

describe('lerPlanilha', () => {
  it('acha o cabeçalho na linha 4 (Rev.06 em diante) e na linha 3 (Rev.05)', () => {
    expect(lerPlanilha(planilhaInventada({ linhaCabecalho: 4 }), NOME).linhaCabecalho).toBe(4);
    expect(lerPlanilha(planilhaInventada({ linhaCabecalho: 3 }), NOME).linhaCabecalho).toBe(3);
  });

  it('casa as colunas pelo texto: MT não é a coluna CONJUGADA', () => {
    const pl = lerPlanilha(planilhaInventada({ linhaCabecalho: 4 }), NOME);
    expect(pl.aba).toBe(NOME_ABA);
    expect(pl.campos.sob).toBe('A');
    expect(pl.campos.municipio).toBe('B');
    expect(pl.campos.metrosBT).toBe(letraDe('EXTENSÃO DE REDE BT (METRO)'));
    expect(pl.campos.metrosMT).toBe(letraDe('EXTENSÃO DE REDE MT (METRO)'));
    expect(pl.campos.metrosCONJ).toBe(letraDe('EXTENSÃO DE REDE MT/BT CONJUGADA (METRO)'));
    expect(pl.campos.metrosMT).not.toBe(pl.campos.metrosCONJ);
    expect(pl.campos.poda).toBe(letraDe('PODA SIMPLES?'));
    expect(pl.campos.supressao).toBe(letraDe('SUPRESSÃO DE VEGETAÇÃO = PODA FORTE OU CORTE?'));
    expect(pl.campos.appRede).toBe(letraDe(CABECALHOS[7]));
    expect(pl.campos.zona).toBe(letraDe('ZONA'));
    expect(pl.campos.parceira).toBe(letraDe('NOME EMPRESA PARCEIRA'));
    expect(pl.revisao).toBe('REV 09 · 20/03/2026');
  });

  it('a coluna de data com =TODAY() é conhecida (fica intacta) e não vai para desconhecidas', () => {
    const pl = lerPlanilha(planilhaInventada({ linhaCabecalho: 4 }), NOME);
    expect(pl.desconhecidas).toEqual([]);
    expect(pl.colunas.map((c) => c.cabecalho)).toEqual(CABECALHOS);
  });

  it('coluna nova de outra revisão aparece em desconhecidas', () => {
    const pl = lerPlanilha(planilhaInventada({ linhaCabecalho: 4, colunasExtras: ['COLUNA NOVA DA REV 10'] }), NOME);
    expect(pl.desconhecidas.map((c) => c.cabecalho)).toEqual(['COLUNA NOVA DA REV 10']);
    expect(pl.desconhecidas[0].letra).toBe(String.fromCharCode(65 + CABECALHOS.length));
  });

  it('duas colunas que casam com o mesmo campo: nenhuma é escolhida (nunca chuta) e as duas ficam em desconhecidas', () => {
    const pl = lerPlanilha(planilhaInventada({ linhaCabecalho: 4, colunasExtras: ['EXTENSÃO DE REDE BT (METRO) DA OBRA'] }), NOME);
    expect(pl.campos.metrosBT).toBeUndefined();
    expect(pl.desconhecidas.map((c) => c.cabecalho)).toEqual(['EXTENSÃO DE REDE BT (METRO)', 'EXTENSÃO DE REDE BT (METRO) DA OBRA']);
  });

  it('opcoes da coluna de APP lista as opções da validação', () => {
    const pl = lerPlanilha(planilhaInventada({ linhaCabecalho: 3 }), NOME);
    const app = pl.colunas.find((c) => c.letra === pl.campos.appRede)!;
    expect(app.opcoes).toEqual(OPCOES_APP);
    expect(pl.colunas.find((c) => c.letra === 'A')!.opcoes).toBeNull();
  });

  it('um .xlsx sem nenhuma célula "SOB" não é a Planilha Padrão', () => {
    expect(() => lerPlanilha(planilhaSemSob(), 'compras.xlsx')).toThrow(ERRO_NAO_E_PLANILHA);
    expect(ERRO_NAO_E_PLANILHA).toBe('Esta planilha não é a Planilha Padrão de Entrega da Enel.');
  });

  it('bytes que não são zip: "Este arquivo não é uma planilha do Excel"', () => {
    expect(() => lerPlanilha(new Uint8Array([1, 2, 3]), 'x.xlsm')).toThrow('Este arquivo não é uma planilha do Excel');
  });
});

describe('REGRAS_COLUNAS', () => {
  it('cada campo aparece uma vez só nas regras', () => {
    const campos = REGRAS_COLUNAS.map((r) => r.campo);
    expect(new Set(campos).size).toBe(campos.length);
  });
});

describe('escolherOpcao', () => {
  it('acha a opção igual, sem acento e sem espaço repetido', () => {
    expect(escolherOpcao('SIM (RIO/RIACHO)', OPCOES_APP)).toBe('SIM (RIO/RIACHO)');
    expect(escolherOpcao('nao  se aplica', OPCOES_APP)).toBe('NÃO SE APLICA');
    expect(escolherOpcao('NAO', OPCOES_APP)).toBe('NÃO');
  });
  it('acha pelo começo quando só uma opção começa assim', () => {
    expect(escolherOpcao('SIM (LAGOS', OPCOES_APP)).toBe('SIM (LAGOS/LAGOAS NATURAIS)');
  });
  it('começo ambíguo ou nada parecido: null', () => {
    expect(escolherOpcao('SIM', ['SIM - A', 'SIM - B'])).toBeNull();
    expect(escolherOpcao('TALVEZ', OPCOES_APP)).toBeNull();
    expect(escolherOpcao('', OPCOES_APP)).toBeNull();
  });
});

describe('revisaoDoNome', () => {
  it('lê a revisão e a data do nome do arquivo', () => {
    expect(revisaoDoNome('SOB 0000000001_Planilha Padrão de Entrega de Processos Documentais Ambientais_REV 09_20.03.2026.xlsm')).toBe('REV 09 · 20/03/2026');
    expect(revisaoDoNome('SOB 0000000001_Planilha Padrão Licenciamento Ambiental_Rev.05 (16.02.2025).xlsx')).toBe('Rev.05 · 16/02/2025');
    expect(revisaoDoNome('SOB 0000000001_Planilha Padrão de Entrega e_ou Permissões_Rev.06_24.02.2026.xlsm')).toBe('Rev.06 · 24/02/2026');
  });
  it('sem revisão no nome: vazio', () => {
    expect(revisaoDoNome('planilha.xlsm')).toBe('');
  });
});

// ---------- Tarefa 9: preencher ----------
// Tudo inventado, em metros, perto de (500000, 9500000).
const X0 = 500000;
const Y0 = 9500000;
const pt = (x: number, y: number): Pt => [X0 + x, Y0 + y];
const retangulo = (x0: number, y0: number, x1: number, y1: number): Pt[] => [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1), pt(x0, y0)];
const caixa = (x0: number, y0: number, x1: number, y1: number): [number, number, number, number] => [X0 + x0, Y0 + y0, X0 + x1, Y0 + y1];
const baseVazia = (): BaseAreas => ({
  revisao: 'teste', data: '', areas: [],
  municipios: [{ id: 999, nome: 'Cidade Exemplo', pasta: ['Municípios_CE'], atributos: {}, poligonos: [[retangulo(-5000, -5000, 5000, 5000)]], linhas: [], caixa: caixa(-5000, -5000, 5000, 5000) }],
});
const vao = (id: string, tipo: TipoRede, pts: Pt[]): Vao => ({ id, pts, camada: 'C', tipo, situacao: 'novo', motivo: '' });
// 300 m de MT, 23,4 m de BT e 79 m de conjugada
const REDE: Rede = {
  origem: 'kml', postes: [],
  vaos: [vao('a', 'MT', [pt(0, 20), pt(300, 20)]), vao('b', 'BT', [pt(0, 60), pt(23.4, 60)]), vao('c', 'CONJ', [pt(0, 90), pt(79, 90)])],
};
const app = (aguaId: number, x0: number, x1: number): AreaConfirmada => ({ nome: `APP DA ÁGUA ${aguaId}`, tipo: 'APP', poligonos: [[retangulo(x0, 0, x1, 40)]], largura: 100, aguaId });
const empresaEx: Empresa = { nome: 'Empresa Exemplo Ltda', cnpj: '00.000.000/0001-00', endereco: 'Rua Exemplo, 1', municipio: 'Cidade Exemplo', telefone: '(00) 0000-0000', email: 'contato@exemplo.com', logo: null };
const arvore = (id: string, intervencao: Arvore['intervencao']): Arvore => ({ id, foto: `${id}.jpg`, ponto: pt(5, 5), especie: 'Cajueiro', intervencao });
const PNG: Imagem = { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), tipo: 'png', largura: 300, altura: 100 };

function dadosEx(mudar: (d: DadosObra) => void = () => {}): DadosObra {
  const d = dadosVazios();
  d.interessado = { nome: 'Fulano de Tal', endereco: 'Sítio Exemplo, s/n', bairro: 'Zona rural', cep: '00000-000' };
  d.obra = { endereco: 'Estrada Exemplo', municipio: 'Cidade Exemplo', sed: 'SED Exemplo', alimentador: 'EXE01', csi: 'X0001', dataSob: '2025-03-12', zona: 'RURAL' };
  d.tipoAgua = { 1: 'rio', 2: 'lagoa', 3: 'reservatorio' };
  mudar(d);
  return d;
}

function entradaEx(p: Partial<EntradaPlanilha> & { confirmadas?: AreaConfirmada[] } = {}): EntradaPlanilha {
  const rede = p.rede ?? REDE;
  return {
    os: '0000000001', rede, caso: p.caso ?? calcularCaso(rede, baseVazia(), p.confirmadas ?? [app(1, 100, 200)]),
    dados: p.dados ?? dadosEx(), empresa: empresaEx, uc: p.uc ?? null, arvores: p.arvores ?? [], limpeza: p.limpeza ?? [],
    assinatura: p.assinatura ?? null, base: p.base,
  };
}

// UC marcada no 5a, fora de toda área
const UC_FORA: SituacaoUc = { ponto: pt(450, 300), dentro: [], emApp: false };
const plan = (extras: string[] = []): Planilha => lerPlanilha(planilhaInventada({ linhaCabecalho: 4, colunasExtras: extras }), NOME);
const reabrir = (r: { nome: string; bytes: Uint8Array }): Planilha => lerPlanilha(r.bytes, r.nome);
const parte = (bytes: Uint8Array, caminho: string): Uint8Array => abrirZip(bytes).find((a) => a.caminho === caminho)!.bytes;
const textoDa = (bytes: Uint8Array, caminho: string): string => new TextDecoder().decode(parte(bytes, caminho));
const ROTULO_DATA = 'DATA ENTREGA PROCESSO DOCUMENTAL VIA E-MAIL';

describe('SEPARADOR_LISTA', () => {
  it('é o da macro da REV 09: vírgula e espaço', () => {
    expect(SEPARADOR_LISTA).toBe(', ');
  });
});

describe('gravarCelulas e gravarXlsx', () => {
  it('troca o valor e mantém o estilo; cria a célula e a linha que não existem, na ordem', () => {
    const p = abrirXlsx(planilhaInventada({ linhaCabecalho: 4 }));
    const xml0 = new TextDecoder().decode(p.partes.get('xl/worksheets/sheet1.xml'));
    const partes = new Map(p.partes);
    partes.set('xl/worksheets/sheet1.xml', new TextEncoder().encode(xml0.replace('<c r="A5">', '<c r="A5" s="7">')));
    const q = gravarCelulas({ ...p, partes }, NOME_ABA, { A5: { t: 'numero', v: 42 }, C5: { t: 'texto', v: 'novo' }, A30: { t: 'data', v: '2025-03-12' } });
    const xml = new TextDecoder().decode(q.partes.get('xl/worksheets/sheet1.xml'));
    expect(xml).toContain('<c r="A5" s="7"><v>42</v></c>');
    expect(xml.indexOf('<c r="A5"')).toBeLessThan(xml.indexOf('<c r="C5"'));
    expect(xml.indexOf('<c r="C5"')).toBeLessThan(xml.indexOf(`<c r="${letraDe(ROTULO_DATA)}5"`));
    expect(xml.indexOf('<row r="16">')).toBeLessThan(xml.indexOf('<row r="30">'));
    const c = lerCelulas(abrirXlsx(gravarXlsx(q)), NOME_ABA);
    expect(c.get('A5')).toBe('42');
    expect(c.get('C5')).toBe('novo');
    expect(c.get('A30')).toBe('45728');
  });

  it('data aaaa-mm-dd vira o número de série do Excel', () => {
    expect(serialDaData('2025-03-12')).toBe(45728);
    expect(serialDaData('1900-03-01')).toBe(61);
  });
});

describe('preencherPlanilha', () => {
  it('a macro, a outra aba, o desenho e a célula com =TODAY() ficam iguais', () => {
    const bytes = planilhaInventada({ linhaCabecalho: 4, outraAba: true });
    const r = preencherPlanilha(lerPlanilha(bytes, NOME), entradaEx());
    for (const c of ['xl/vbaProject.bin', 'xl/worksheets/sheet2.xml', 'xl/drawings/drawing1.xml', 'xl/sharedStrings.xml', 'xl/workbook.xml', '[Content_Types].xml']) {
      expect(parte(r.bytes, c), c).toEqual(parte(bytes, c));
    }
    const ref = `${letraDe(ROTULO_DATA)}5`;
    const celula = (b: Uint8Array): string => new RegExp(`<c r="${ref}"[^>]*>.*?</c>`).exec(textoDa(b, 'xl/worksheets/sheet1.xml'))![0];
    expect(celula(r.bytes)).toBe(celula(bytes));
    expect(celula(r.bytes)).toContain('<f ca="1">TODAY()</f>');
  });

  it('a linha da obra tem os metros inteiros do caso e poda SIM com uma árvore de poda', () => {
    const r = preencherPlanilha(plan(), entradaEx({ arvores: [arvore('a1', 'poda')] }));
    const l = lerLinhaDaObra(reabrir(r));
    expect(l.metrosMT).toBe('300');
    expect(l.metrosBT).toBe('23');
    expect(l.metrosCONJ).toBe('79');
    expect(l.poda).toBe('SIM');
    expect(l.supressao).toBe('NÃO');
    expect(l.municipio).toBe('CIDADE EXEMPLO');
    expect(l.zona).toBe('RURAL');
    expect(l.parceira).toBe('Empresa Exemplo Ltda');
  });

  it('sem árvore de poda, poda NÃO', () => {
    expect(lerLinhaDaObra(reabrir(preencherPlanilha(plan(), entradaEx()))).poda).toBe('NÃO');
  });

  it('SOB gravado como número', () => {
    expect(valoresDesejados(entradaEx()).sob).toBe(1);
    const r = preencherPlanilha(plan(), entradaEx());
    expect(textoDa(r.bytes, 'xl/worksheets/sheet1.xml')).toContain('<c r="A5"><v>1</v></c>');
    expect(lerLinhaDaObra(reabrir(r)).sob).toBe('1');
  });

  it('A1 mantém as linhas de cima e a última vira o assunto', () => {
    const e = entradaEx({ uc: UC_FORA });
    const r = preencherPlanilha(plan(), e);
    const assunto = assuntoTexto(e.os, partesDoAssunto(e.caso, UC_FORA, metrosDaRede(e.rede)))!;
    expect(assunto).toBe('SOB 0000000001_PROCESSO DOCUMENTAL_PARTE DA REDE EM APP');
    const linhas = A1_INVENTADA.split('\n');
    expect(lerCelulas(reabrir(r).pasta, NOME_ABA).get('A1')).toBe([...linhas.slice(0, -1), assunto].join('\n'));
    expect(r.avisos.filter((a) => a.codigo === 'PLANILHA_ASSUNTO')).toEqual([]);
  });

  // revisão final (I1): sem a UC marcada no 5a o site não sabe se ela está na área; nada de assunto que diga que está fora
  it('UC não marcada no 5a: A1 fica como estava e sai o amarelo do assunto pedindo a UC', () => {
    const r = preencherPlanilha(plan(), entradaEx({ uc: null }));
    expect(lerCelulas(reabrir(r).pasta, NOME_ABA).get('A1')).toBe(A1_INVENTADA);
    const a = r.avisos.filter((x) => x.codigo === 'PLANILHA_ASSUNTO');
    expect(a).toHaveLength(1);
    expect(a[0].nivel).toBe('amarelo');
    expect(a[0].texto).toContain('UC');
    expect(a[0].comoCorrigir).toContain('5a');
    // o mesmo sem área cruzada: a UC pode estar numa área ("UC EM ...")
    const semArea = preencherPlanilha(plan(), entradaEx({ uc: null, confirmadas: [] }));
    expect(lerCelulas(reabrir(semArea).pasta, NOME_ABA).get('A1')).toBe(A1_INVENTADA);
    expect(semArea.avisos.filter((x) => x.codigo === 'PLANILHA_ASSUNTO').map((x) => x.texto)).toEqual([a[0].texto]);
  });

  it('caso sem área cruzada: A1 fica como estava e sai amarelo para confirmar o assunto com o P&M', () => {
    const r = preencherPlanilha(plan(), entradaEx({ confirmadas: [], uc: UC_FORA }));
    expect(lerCelulas(reabrir(r).pasta, NOME_ABA).get('A1')).toBe(A1_INVENTADA);
    const a = r.avisos.find((x) => x.codigo === 'PLANILHA_ASSUNTO')!;
    expect(a.nivel).toBe('amarelo');
    expect(a.texto).toBe('sem área cruzada: confirme com o P&M o assunto do e-mail');
    expect(r.avisos.map((x) => x.texto).join(' ')).not.toContain('não precisa de processo');
  });

  it('texto curto na coluna A, três linhas abaixo do cabeçalho', () => {
    const e = entradaEx();
    const r = preencherPlanilha(plan(), e);
    expect(lerCelulas(reabrir(r).pasta, NOME_ABA).get('A7')).toBe(textoCurto(e.os, e.caso, null, metrosDaRede(e.rede)));
  });

  it('tipo de APP sem opção na lista: célula vazia e amarelo "escolha na lista ao abrir no Excel" com a letra', () => {
    // açude = reservatório artificial, que a lista inventada não tem
    const r = preencherPlanilha(plan(), entradaEx({ confirmadas: [app(3, 100, 200)] }));
    expect(lerLinhaDaObra(reabrir(r)).appRede).toBeUndefined();
    const a = r.avisos.find((x) => x.codigo === 'PLANILHA_ESCOLHER')!;
    expect(a.nivel).toBe('amarelo');
    expect(a.texto).toContain('escolha na lista ao abrir no Excel');
    expect(a.texto).toContain(`Coluna ${letraDe(CABECALHOS[7])} `);
  });

  it('APP sem tipo escolhido usa o padrão da água do KMZ (lagoa = lagoa natural); sem a água, amarelo', () => {
    const lagoa = { id: 7, nome: 'LAGOA EXEMPLO', pasta: ['RECURSOS HÍDRICOS - COGERH', 'AÇUDES MONITORADOS'], atributos: {}, poligonos: [[retangulo(100, 0, 200, 40)]], linhas: [], caixa: caixa(100, 0, 200, 40) };
    const com = preencherPlanilha(plan(), entradaEx({ confirmadas: [app(7, 100, 200)], base: { ...baseVazia(), areas: [lagoa] } }));
    expect(lerLinhaDaObra(reabrir(com)).appRede).toBe('SIM (LAGOS/LAGOAS NATURAIS)');
    const sem = preencherPlanilha(plan(), entradaEx({ confirmadas: [app(7, 100, 200)] }));
    expect(lerLinhaDaObra(reabrir(sem)).appRede).toBeUndefined();
    expect(sem.avisos.some((a) => a.codigo === 'PLANILHA_ESCOLHER')).toBe(true);
  });

  it('sem APP na rede: "NÃO"', () => {
    expect(lerLinhaDaObra(reabrir(preencherPlanilha(plan(), entradaEx({ confirmadas: [] })))).appRede).toBe('NÃO');
  });

  it('duas opções na mesma coluna sem separador: célula vazia e amarelo com as duas opções', () => {
    const e = entradaEx({ confirmadas: [app(1, 100, 150), app(2, 200, 250)] });
    expect(valoresDesejados(e).appRede).toEqual(['SIM (RIO/RIACHO)', 'SIM (LAGOS/LAGOAS NATURAIS)']);
    const r = preencherPlanilha(plan(), e, null);
    expect(lerLinhaDaObra(reabrir(r)).appRede).toBeUndefined();
    const a = r.avisos.find((x) => x.codigo === 'PLANILHA_ESCOLHER')!;
    expect(a.nivel).toBe('amarelo');
    expect(a.texto).toContain('SIM (RIO/RIACHO)');
    expect(a.texto).toContain('SIM (LAGOS/LAGOAS NATURAIS)');
    // com o separador da macro, as duas vão juntas
    expect(lerLinhaDaObra(reabrir(preencherPlanilha(plan(), e))).appRede).toBe('SIM (RIO/RIACHO), SIM (LAGOS/LAGOAS NATURAIS)');
  });

  it('coluna desconhecida: amarelo com o cabeçalho', () => {
    const r = preencherPlanilha(plan(['COLUNA NOVA DA REV 10']), entradaEx());
    const a = r.avisos.find((x) => x.codigo === 'PLANILHA_COLUNA_NOVA')!;
    expect(a.nivel).toBe('amarelo');
    expect(a.texto).toContain('COLUNA NOVA DA REV 10');
  });

  it('nome do cliente com &, <, aspas e acento: a planilha abre de novo e o nome volta igual', () => {
    const nome = 'Fulano & Filhos <Ltda> "Ação" d\'Ávila';
    const r = preencherPlanilha(plan(['NOME DO SOLICITANTE']), entradaEx({ dados: dadosEx((d) => { d.interessado.nome = nome; }) }));
    const p = reabrir(r);
    expect(p.campos.solicitante).toBeDefined();
    expect(lerLinhaDaObra(p).solicitante).toBe(nome);
  });

  it('com assinatura: imagem nas 3 linhas acima de "Assinatura Responsável Técnico" e png no [Content_Types].xml', () => {
    const bytes = planilhaInventada({ linhaCabecalho: 4 });
    const r = preencherPlanilha(lerPlanilha(bytes, NOME), entradaEx({ assinatura: PNG }));
    const desenho = textoDa(r.bytes, 'xl/drawings/drawing1.xml');
    const antes = textoDa(bytes, 'xl/drawings/drawing1.xml');
    // o que já estava continua; entra uma âncora nova 3 linhas acima do rótulo (linha 16 -> linha 13, índice 12)
    const semFim = antes.replace('</xdr:wsDr>', '');
    expect(desenho.startsWith(semFim)).toBe(true);
    const nova = desenho.slice(semFim.length);
    expect(nova).toContain('<xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>12</xdr:row>');
    expect(nova).toContain(`cy="${3 * 15 * 12700}"`);
    expect(textoDa(r.bytes, '[Content_Types].xml')).toContain('Extension="png"');
    const alvo = /Target="\.\.\/media\/([^"]+)"/.exec(textoDa(r.bytes, 'xl/drawings/_rels/drawing1.xml.rels'))![1];
    expect(parte(r.bytes, `xl/media/${alvo}`)).toEqual(PNG.bytes);
  });

  it('planilha guardada que já tem imagem nas linhas da assinatura: vermelho, sem imagem nova e o desenho intacto', () => {
    const bytes = planilhaInventada({ linhaCabecalho: 4, assinaturaAntiga: true });
    for (const assinatura of [PNG, null]) {
      const r = preencherPlanilha(lerPlanilha(bytes, NOME), entradaEx({ assinatura }));
      const a = r.avisos.filter((x) => x.codigo === 'PLANILHA_JA_ASSINADA');
      expect(a).toHaveLength(1);
      expect(a[0].nivel).toBe('vermelho');
      expect(a[0].comoCorrigir).toContain('em branco');
      expect(parte(r.bytes, 'xl/drawings/drawing1.xml')).toEqual(parte(bytes, 'xl/drawings/drawing1.xml'));
      expect(parte(r.bytes, '[Content_Types].xml')).toEqual(parte(bytes, '[Content_Types].xml'));
      expect(abrirZip(r.bytes).some((x) => x.caminho.startsWith('xl/media/'))).toBe(false);
    }
  });

  it('sem imagem nas linhas da assinatura, não há o vermelho de planilha já assinada', () => {
    for (const assinatura of [PNG, null]) {
      const r = preencherPlanilha(plan(), entradaEx({ assinatura }));
      expect(r.avisos.some((x) => x.codigo === 'PLANILHA_JA_ASSINADA')).toBe(false);
    }
  });

  it('sem assinatura, o desenho não muda', () => {
    const bytes = planilhaInventada({ linhaCabecalho: 4 });
    const r = preencherPlanilha(lerPlanilha(bytes, NOME), entradaEx());
    expect(textoDa(r.bytes, 'xl/drawings/drawing1.xml')).toBe(textoDa(bytes, 'xl/drawings/drawing1.xml'));
    expect(abrirZip(r.bytes).some((a) => a.caminho.startsWith('xl/media/'))).toBe(false);
  });

  it('nome do arquivo: "SOB <OS>_" + o nome original sem o SOB que já estava na frente', () => {
    expect(preencherPlanilha(plan(), { ...entradaEx(), os: '0000000099' }).nome).toBe('SOB 0000000099_Planilha Padrão de Entrega Inventada_REV 09_20.03.2026.xlsm');
    expect(nomeDaPlanilha('0000000099', 'Planilha Inventada_REV 09.xlsm')).toBe('SOB 0000000099_Planilha Inventada_REV 09.xlsm');
    expect(nomeDaPlanilha('0000000099', 'SOB 0000000001 _Planilha Inventada.xlsx')).toBe('SOB 0000000099_Planilha Inventada.xlsx');
  });
});

describe('valoresDesejados: áreas', () => {
  const area = (id: number, nome: string, pasta: string[]): AreaProtegida => ({ id, nome, pasta, atributos: {}, poligonos: [[retangulo(100, 0, 200, 40)]], linhas: [], caixa: caixa(100, 0, 200, 40) });
  const casoCom = (a: AreaProtegida): EntradaPlanilha => entradaEx({ caso: calcularCaso(REDE, { ...baseVazia(), areas: [a] }, []) });

  it('perímetro do DNOCS vai para as colunas de permissão; a área ambiental fica "não se aplica" e o órgão para o Excel', () => {
    const v = valoresDesejados(casoCom(area(20, 'POLIGONAL EXEMPLO', ['ÁREAS PROTEGIDAS', 'Perímetros Irrigados - DNOCS'])));
    expect(v.permissaoArea).toEqual(['ÁREAS PERÍMETROS IRRIGADOS_FEDERAL_PERMISSÃO']);
    expect(v.permissaoOrgao).toEqual(['DNOCS (FEDERAL) - DEPARTAMENTO NACIONAL DE OBRAS CONTRA AS SECAS']);
    expect(v.areaDaRede).toEqual(['NÃO SE APLICA']);
    expect(v.orgaoAreaRede).toBeUndefined();
  });

  it('UC estadual: nome com esfera e grupo, e o gestor pela esfera', () => {
    const v = valoresDesejados(casoCom(area(21, 'ÁREA DE PROTEÇÃO AMBIENTAL DA LAGOA EXEMPLO', ['ÁREAS PROTEGIDAS', 'Unidade de Conservação Estadual', 'Uso Sustentável'])));
    expect(v.areaDaRede).toEqual(['ÁREA DE PROTEÇÃO AMBIENTAL DA LAGOA EXEMPLO_ESTADUAL_USO SUSTENTÁVEL']);
    expect(v.orgaoAreaRede).toEqual(['UNIDADE DE CONSERVAÇÃO ESTADUAL (SEMA) - USO SUSTENTÁVEL']);
    expect(v.permissaoArea).toEqual(['NÃO SE APLICA']);
  });

  it('sem intervenção nenhuma: as colunas de área da rede ficam "não se aplica"', () => {
    const v = valoresDesejados(entradaEx({ confirmadas: [] }));
    expect(v.areaDaRede).toEqual(['NÃO SE APLICA']);
    expect(v.orgaoAreaRede).toEqual(['NÃO SE APLICA']);
    expect(v.permissaoArea).toEqual(['NÃO SE APLICA']);
    expect(v.appRede).toEqual(['NÃO']);
  });

  it('com APP na rede, o órgão da área fica para o Excel (município ou SEMACE)', () => {
    expect(valoresDesejados(entradaEx()).orgaoAreaRede).toBeUndefined();
  });

  it('supressão de árvore (poda drástica ou corte?) e limpeza sem predominância ficam para o Excel', () => {
    expect(valoresDesejados(entradaEx({ arvores: [arvore('s', 'supressao')] })).supressao).toBeUndefined();
    const faixa = [retangulo(0, 0, 10, 10)];
    expect(valoresDesejados(entradaEx({ limpeza: faixa })).supressao).toBeUndefined();
    expect(valoresDesejados(entradaEx({ limpeza: faixa, dados: dadosEx((d) => { d.predominancia = 'mista-arborea'; }) })).supressao)
      .toEqual(['SIM - LIMPEZA DE FAIXA DE SERVIDÃO ARBUSTIVA E ARBÓREA (PREDOMINÂNCIA ARBÓREA)']);
  });
});

describe('opcaoDoAlvo', () => {
  it('o "não" da supressão e da APP é "NÃO SE APLICA" quando a lista não tem "NÃO"; nas outras colunas, nunca pelo começo', () => {
    expect(opcaoDoAlvo('supressao', 'NÃO', ['NÃO SE APLICA', 'SIM - CORTES ISOLADOS'])).toBe('NÃO SE APLICA');
    expect(opcaoDoAlvo('appRede', 'NÃO', ['NÃO SE APLICA', 'SIM (RIO/RIACHO)'])).toBe('NÃO SE APLICA');
    expect(opcaoDoAlvo('appRede', 'NÃO', ['NÃO', 'NÃO SE APLICA'])).toBe('NÃO');
    expect(opcaoDoAlvo('poda', 'NÃO', ['NÃO SE APLICA', 'SIM'])).toBeNull();
    expect(opcaoDoAlvo('poda', 'SIM', ['SIM - A', 'NÃO'])).toBeNull();
  });
  it('área pelo nome sem prefixo, pela esfera e pelo tipo', () => {
    const lista = ['APA LAGOA EXEMPLO_ESTADUAL_USO SUSTENTÁVEL', 'ÁREA DE PROTEÇÃO AMBIENTAL LAGOA EXEMPLO_MUNICIPAL_USO SUSTENTÁVEL', 'PARQUE ESTADUAL DO RIO EXEMPLO_ESTADUAL_PROTEÇÃO INTEGRAL'];
    expect(opcaoDoAlvo('areaDaRede', 'ÁREA DE PROTEÇÃO AMBIENTAL DA LAGOA EXEMPLO_ESTADUAL_USO SUSTENTÁVEL', lista)).toBe(lista[0]);
    expect(opcaoDoAlvo('areaDaRede', 'ÁREA DE PROTEÇÃO AMBIENTAL DA LAGOA EXEMPLO_FEDERAL_USO SUSTENTÁVEL', lista)).toBeNull();
    expect(opcaoDoAlvo('areaDaRede', 'APA DO RIO EXEMPLO_ESTADUAL_PROTEÇÃO INTEGRAL', lista)).toBeNull();
    expect(opcaoDoAlvo('areaDaRede', 'PE DO RIO EXEMPLO_ESTADUAL_PROTEÇÃO INTEGRAL', lista)).toBe(lista[2]);
  });
});
