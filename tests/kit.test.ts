import { describe, expect, it } from 'vitest';
import { abrirZip, montarZip } from '../src/nucleo/zip.ts';
import { montarPacote, arquivosDoPacote } from '../src/nucleo/pacote.ts';
import { montarCamadas } from '../src/nucleo/camadas.ts';
import {
  conferirKit, conferirObrigatorios, montarKit, nomeNoKit, pastaDoKit, reconhecer, type ArquivoSolto, type Papel,
} from '../src/nucleo/kit.ts';
import type { ContextoTexto } from '../src/nucleo/conferir-texto.ts';
import { lerPlanilha, preencherPlanilha } from '../src/nucleo/planilha.ts';
import { planilhaInventada } from './ajuda/planilha-inventada.ts';
import { gravarCelulas, gravarXlsx } from '../src/nucleo/xlsx.ts';
import { lerPdfNoNode, pdfDeTexto } from './ajuda/pdf-simples.ts';
import { montarMemorial, type EntradaMemorial } from '../src/nucleo/memorial.ts';
import { gravarDocx, textoDoDocumento, textoDoDocx } from '../src/nucleo/docx.ts';
import { calcularCaso, type AreaConfirmada, type Caso } from '../src/nucleo/caso.ts';
import { dadosVazios, type DadosObra, type Empresa, type Imagem, type Responsavel } from '../src/nucleo/obra.ts';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas.ts';
import type { Arvore } from '../src/nucleo/arvores.ts';
import type { ItemConferencia } from '../src/nucleo/conferir.ts';
import type { CamadaKit } from '../src/nucleo/shp.ts';
import type { SituacaoUc } from '../src/nucleo/uc.ts';
import type { Poste, Pt, Rede, TipoRede, Vao } from '../src/nucleo/tipos.ts';
import { TEXTOS_KIT } from '../src/regras/textos-memorial.ts';

// tudo inventado, em metros, perto de (500000, 9500000)
const OS = '0000000001';
const X = 500000;
const Y = 9500000;
const pt = (x: number, y: number): Pt => [X + x, Y + y];
const retangulo = (x0: number, y0: number, x1: number, y1: number): Pt[] => [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1), pt(x0, y0)];
const area = (id: number, nome: string, pasta: string[], x0: number, y0: number, x1: number, y1: number): AreaProtegida =>
  ({ id, nome, pasta, atributos: {}, poligonos: [[retangulo(x0, y0, x1, y1)]], linhas: [], caixa: [X + x0, Y + y0, X + x1, Y + y1] });
const vao = (id: string, tipo: TipoRede, pts: Pt[]): Vao => ({ id, pts, camada: 'C', tipo, situacao: 'novo', motivo: '' });
const poste = (id: string, ponto: Pt, numero: string | null): Poste => ({ id, ponto, numero, novo: true, coordEscrita: null, etiqueta: null });

// 400 m de MT; a APP da lagoa cobre de 0 a 308 (308 m de MT)
const LAGOA: AreaConfirmada = { nome: 'APP DA LAGOA EXEMPLO', tipo: 'APP', poligonos: [[retangulo(0, 0, 308, 40)]], largura: 100, aguaId: 77 };
const AGUA = area(77, 'LAGOA EXEMPLO', ['Hidrografia'], 100, 50, 200, 90);
const LONGE = area(1, 'APA DA SERRA EXEMPLO', ['Unidade de Conservação Estadual', 'Uso Sustentável'], 2000, 2000, 2100, 2100);
const REDE: Rede = { origem: 'dxf', vaos: [vao('a', 'MT', [pt(0, 20), pt(400, 20)])], postes: [poste('p1', pt(0, 20), '1'), poste('p2', pt(308, 20), '2'), poste('p3', pt(400, 20), '3')] };
const municipios = [area(2, 'Eusébio', ['Municípios_CE'], -5000, -5000, 5000, 5000)];
const BASE_CASO: BaseAreas = { revisao: 'teste', data: '', areas: [LONGE], municipios };
const BASE_CAMADAS: BaseAreas = { revisao: 'teste', data: '', areas: [LONGE, AGUA], municipios };

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
  d.tipoAgua = { 77: 'lagoa' };
  return d;
}

const caso: Caso = calcularCaso(REDE, BASE_CASO, [LAGOA]);
const entrada: EntradaMemorial = {
  os: OS, caso, rede: REDE, dados: dados(), empresa, rt: RT, uc: null, arvores: [MANGUEIRA], limpeza: [],
  data: new Date(2026, 10, 19), assinar: true, imagens: {},
};
const documento = montarMemorial(entrada);
// o texto do site com as marcas amarelas já preenchidas, como o projetista faz no Word antes do PDF
const textoFinal = textoDoDocumento(documento).replace(/\[(?:PREENCHER:[^\]]*|COLAR DO GOM)\]/g, 'preenchido');
// o PDF de teste só leva Latin-1 (WinAnsi); como o Word, quebra a linha antes da margem (o pdf.js não lê o que passa
// da página) e põe 40 linhas por página
const quebrar = (paragrafo: string): string[] => {
  const ls: string[] = [];
  let atual = '';
  for (const p of paragrafo.split(' ')) {
    if (atual !== '' && atual.length + 1 + p.length > 70) { ls.push(atual); atual = p; } else atual = atual === '' ? p : `${atual} ${p}`;
  }
  return [...ls, atual];
};
const paginas = (texto: string): string[][] => {
  const linhas = texto.split('\n').flatMap(quebrar);
  const ps: string[][] = [];
  for (let i = 0; i < linhas.length; i += 40) ps.push(linhas.slice(i, i + 40));
  return ps;
};
const memorialPdf = pdfDeTexto(paginas(textoFinal));
const pdfSemTexto = pdfDeTexto([['1']]);

// a UC marcada no 5a, fora de toda área (a mesma da camada da UC abaixo): sem ela a planilha não escreve o assunto da A1
const UC_FORA: SituacaoUc = { ponto: pt(450, 20), dentro: [], emApp: false };
const planilha = preencherPlanilha(lerPlanilha(planilhaInventada({ linhaCabecalho: 4 }), 'SOB 0000000000_Planilha Inventada_REV 09_20.03.2026.xlsm'),
  { os: OS, caso, rede: REDE, dados: dados(), empresa, uc: UC_FORA, arvores: [MANGUEIRA], limpeza: [], assinatura: null }, ', ');

const ucCamada: CamadaKit = { nome: `${OS} UC`, tipo: 'ponto', feicoes: [{ name: 'UC', geometria: [{ t: 'ponto', p: pt(450, 20) }] }] };
const camadas = montarCamadas(OS, caso, REDE, [ucCamada], BASE_CAMADAS);
const falso = new Uint8Array([1, 2, 3]);
const solto = (nome: string, bytes: Uint8Array = falso): ArquivoSolto => ({ nome, bytes, papel: reconhecer(nome) });
const soltosDoKit = (memorial: Uint8Array = memorialPdf): ArquivoSolto[] => [
  { nome: 'memorial final.pdf', bytes: memorial, papel: 'memorial-pdf' },
  solto('ART 1234567.pdf'),
  solto('cvt.pdf'),
  solto('projeto.dwg'),
  solto('CAD obra.pdf'),
  solto('planta georref.dwg'),
  solto('planta georref.pdf'),
  solto(planilha.nome, planilha.bytes),
  solto('SOB 0000000001_Planilha Inventada_REV 09_20.03.2026.pdf'),
  solto('autorização poda.pdf'),
];
const ctx: ContextoTexto & { lerPdf: typeof lerPdfNoNode; temPoda: boolean; ucEmArea: boolean; assunto: string | null } = {
  os: OS, caso, rede: REDE, nomesDaBase: [LONGE.nome], arvores: [MANGUEIRA], limpeza: [], municipioKmz: 'Eusébio', rt: RT, metrosZip: null,
  uc: null, lerPdf: lerPdfNoNode, temPoda: true, ucEmArea: false, assunto: null,
};
const kit = (soltos: ArquivoSolto[]): Uint8Array => montarKit({ os: OS, regional: 'LESTE', soltos, camadas }).bytes;
const de = (itens: ItemConferencia[], nivel: ItemConferencia['nivel']): ItemConferencia[] => itens.filter((i) => i.nivel === nivel);

describe('reconhecer', () => {
  it('pela extensão e por palavras do nome', () => {
    expect(reconhecer('ART 1234567.pdf')).toBe('art');
    expect(reconhecer('cvt.pdf')).toBe('cvt');
    expect(reconhecer('planta georref.dwg')).toBe('planta-dwg');
    expect(reconhecer('planta georref.pdf')).toBe('planta-pdf');
    expect(reconhecer('projeto.dwg')).toBe('cad-dwg');
    expect(reconhecer('0000000001CAD.dwg')).toBe('cad-dwg');
    expect(reconhecer('CAD obra.pdf')).toBe('cad-pdf');
    expect(reconhecer('SOB 0000000001_Planilha Padrão de Entrega_REV 09.xlsm')).toBe('planilha-xlsm');
    expect(reconhecer('SOB 0000000001_Planilha Padrão de Entrega_REV 09.pdf')).toBe('planilha-pdf');
    expect(reconhecer('memorial.docx')).toBe('memorial-docx');
    expect(reconhecer('Memorial descritivo.pdf')).toBe('memorial-pdf');
    expect(reconhecer('autorização poda.pdf')).toBe('poda');
    expect(reconhecer('CCU do cliente.pdf')).toBe('regularidade');
    expect(reconhecer('foto.jpg')).toBeNull();
  });

  it('palavra só vale inteira: "parte" não é ART, e o que não se reconhece fica null', () => {
    expect(reconhecer('parte do projeto.txt')).toBeNull();
    expect(reconhecer('relatorio.pdf')).toBeNull();
    // .dwg sem PLANTA/GEORREF e sem CAD/PROJETO: a tela pergunta, nada de chute
    expect(reconhecer('desenho.dwg')).toBeNull();
    expect(reconhecer(`${OS} REDE MT.kml`)).toBeNull();
  });
});

describe('nomeNoKit e pastaDoKit', () => {
  it('os nomes do desenho §6.8, letra por letra', () => {
    expect(nomeNoKit('memorial-pdf', OS, 'qualquer.pdf')).toBe('MEMORIAL/0000000001 MEMORIAL DESCRITIVO.pdf');
    expect(nomeNoKit('memorial-docx', OS, 'qualquer.docx')).toBe('MEMORIAL/0000000001 MEMORIAL DESCRITIVO.docx');
    expect(nomeNoKit('cad-dwg', OS, 'projeto.dwg')).toBe('0000000001 CAD.dwg');
    expect(nomeNoKit('cad-pdf', OS, 'projeto.pdf')).toBe('0000000001 CAD.pdf');
    expect(nomeNoKit('planta-dwg', OS, 'planta.dwg')).toBe('0000000001 PLANTA GEORREFERENCIADA.dwg');
    expect(nomeNoKit('planta-pdf', OS, 'planta.pdf')).toBe('0000000001 PLANTA GEORREFERENCIADA.pdf');
    expect(nomeNoKit('cvt', OS, 'cvt.pdf')).toBe('0000000001_CVT.pdf');
    expect(nomeNoKit('poda', OS, 'autorizacao.pdf')).toBe('0000000001 AUTORIZAÇÃO PODA.pdf');
    expect(nomeNoKit('planilha-xlsm', OS, 'SOB 0000000000_Planilha Padrão de Entrega_REV 09.xlsm')).toBe('SOB 0000000001_Planilha Padrão de Entrega_REV 09.xlsm');
    expect(nomeNoKit('planilha-pdf', OS, 'Planilha Padrão de Entrega_REV 09.pdf')).toBe('SOB 0000000001_Planilha Padrão de Entrega_REV 09.pdf');
  });

  it('a ART mantém o nome original', () => {
    expect(nomeNoKit('art', OS, 'ART 1234567.pdf')).toBe('ART 1234567.pdf');
    expect(nomeNoKit('art', OS, 'pasta/ART_CE20260000001 contrato 12.pdf')).toBe('ART_CE20260000001 contrato 12.pdf');
  });

  it('pasta do kit', () => {
    expect(pastaDoKit(OS, 'LESTE')).toBe('0000000001_PROCESSO DOCUMENTAL_LESTE');
    expect(pastaDoKit(OS, 'CENTRO-SUL')).toBe('0000000001_PROCESSO DOCUMENTAL_CENTRO-SUL');
  });
});

describe('arquivosDoPacote', () => {
  it('sem pastas, os mesmos caminhos e bytes do montarPacote', () => {
    const cs = camadas;
    const arqs = arquivosDoPacote(OS, cs);
    expect(arqs.map((a) => a.caminho)).toEqual(abrirZip(montarPacote(OS, cs)).map((a) => a.caminho));
    expect(arqs.every((a) => a.caminho.startsWith(`${OS} KML/`) || a.caminho.startsWith(`${OS} SHAPEFILE/`))).toBe(true);
  });

  it('com pastas, cada arquivo vai para a pasta pedida', () => {
    const arqs = arquivosDoPacote(OS, camadas, { kml: 'X/KML', shp: 'X/SHAPEFILE' });
    expect(arqs.map((a) => a.caminho)).toContain(`X/KML/${OS} UNIFICADO.kml`);
    expect(arqs.map((a) => a.caminho)).toContain(`X/SHAPEFILE/${OS} UNIFICADO.shp`);
  });
});

describe('montarKit', () => {
  const r = montarKit({ os: OS, regional: 'LESTE', soltos: soltosDoKit(), camadas });
  const caminhos = abrirZip(r.bytes).map((a) => a.caminho);
  const P = '0000000001_PROCESSO DOCUMENTAL_LESTE';

  it('zip com a pasta de mesmo nome, KML e SHAPEFILE sem o prefixo da OS e a camada UC', () => {
    expect(r.nome).toBe(`${P}.zip`);
    expect(caminhos.every((c) => c.startsWith(`${P}/`))).toBe(true);
    expect(caminhos).toContain(`${P}/KML/0000000001 UC.kml`);
    expect(caminhos).toContain(`${P}/KML/0000000001 UNIFICADO.kml`);
    for (const e of ['shp', 'shx', 'dbf', 'prj', 'cpg']) expect(caminhos).toContain(`${P}/SHAPEFILE/0000000001 UC.${e}`);
    expect(caminhos.some((c) => c.includes(`${OS} KML/`) || c.includes(`${OS} SHAPEFILE/`))).toBe(false);
  });

  it('cada documento renomeado no padrão', () => {
    for (const n of [
      'MEMORIAL/0000000001 MEMORIAL DESCRITIVO.pdf', 'ART 1234567.pdf', '0000000001_CVT.pdf', '0000000001 CAD.dwg', '0000000001 CAD.pdf',
      '0000000001 PLANTA GEORREFERENCIADA.dwg', '0000000001 PLANTA GEORREFERENCIADA.pdf', 'SOB 0000000001_Planilha Inventada_REV 09_20.03.2026.xlsm',
      'SOB 0000000001_Planilha Inventada_REV 09_20.03.2026.pdf', '0000000001 AUTORIZAÇÃO PODA.pdf',
    ]) expect(caminhos).toContain(`${P}/${n}`);
  });

  it('arquivo sem papel entra com o nome original; dois com o mesmo nome no kit dão erro', () => {
    const outro = montarKit({ os: OS, regional: 'LESTE', soltos: [{ nome: 'foto.jpg', bytes: falso, papel: null }], camadas });
    expect(abrirZip(outro.bytes).map((a) => a.caminho)).toContain(`${P}/foto.jpg`);
    expect(() => montarKit({ os: OS, regional: 'LESTE', soltos: [solto('cvt.pdf'), solto('CVT assinada.pdf')], camadas })).toThrow(/repetid/i);
  });
});

describe('conferirObrigatorios', () => {
  const todos: Papel[] = ['memorial-pdf', 'art', 'cvt', 'cad-dwg', 'cad-pdf', 'planta-dwg', 'planta-pdf', 'planilha-xlsm', 'planilha-pdf'];

  it('com tudo: só verde', () => {
    const itens = conferirObrigatorios(todos, { temPoda: false, ucEmArea: false });
    expect(itens.filter((i) => i.nivel !== 'verde')).toEqual([]);
    expect(itens.length).toBeGreaterThan(0);
  });

  it('cada obrigatório que falta é um vermelho', () => {
    for (const p of todos) {
      const v = de(conferirObrigatorios(todos.filter((x) => x !== p), { temPoda: false, ucEmArea: false }), 'vermelho');
      expect(v, p).toHaveLength(1);
    }
    expect(de(conferirObrigatorios([], { temPoda: false, ucEmArea: false }), 'vermelho')).toHaveLength(todos.length);
  });

  it('poda e regularidade: amarelo só quando o caso pede (§8.1)', () => {
    expect(de(conferirObrigatorios(todos, { temPoda: true, ucEmArea: false }), 'amarelo')).toHaveLength(1);
    expect(de(conferirObrigatorios(todos, { temPoda: false, ucEmArea: true }), 'amarelo')).toHaveLength(1);
    expect(de(conferirObrigatorios(todos, { temPoda: true, ucEmArea: true }), 'amarelo')).toHaveLength(2);
    expect(conferirObrigatorios([...todos, 'poda', 'regularidade'], { temPoda: true, ucEmArea: true }).filter((i) => i.nivel !== 'verde')).toEqual([]);
  });
});

// a primeira leitura carrega o pdf.js (frio, com a máquina ocupada passou de 5 s uma vez): folga de 30 s
describe('conferirKit', { timeout: 30_000 }, () => {
  it('kit montado pelo site, com memorial PDF e planilha preenchida: sem vermelho', async () => {
    const itens = await conferirKit(kit(soltosDoKit()), ctx);
    expect(de(itens, 'vermelho')).toEqual([]);
    expect(de(itens, 'amarelo')).toEqual([]);
    // a lista de documentos da Parte 1 sai: fica só a do §8.1, um verde
    expect(itens.filter((i) => i.codigo === 'DOCUMENTOS').map((i) => i.nivel)).toEqual(['verde']);
    // a conferência do texto e a da planilha rodaram
    expect(itens.map((i) => i.codigo)).toEqual(expect.arrayContaining(['METROS', 'MARCA', 'PLANILHA_METROS', 'PLANILHA_ASSUNTO', 'UNIFICADO']));
    expect(itens.find((i) => i.codigo === 'PLANILHA_ASSUNTO')!.nivel).toBe('verde');
    // ordem: vermelhos, amarelos, verdes
    const ordem = { vermelho: 0, amarelo: 1, verde: 2 };
    expect(itens.map((i) => ordem[i.nivel])).toEqual([...itens.map((i) => ordem[i.nivel])].sort((a, b) => a - b));
  });

  it('o mesmo kit sem a ART: vermelho', async () => {
    const itens = await conferirKit(kit(soltosDoKit().filter((s) => s.papel !== 'art')), ctx);
    const v = de(itens, 'vermelho');
    expect(v).toHaveLength(1);
    expect(v[0].titulo).toMatch(/\bART\b/);
  });

  it('memorial PDF sem texto: amarelo pedindo o .docx, e o texto não é conferido', async () => {
    const itens = await conferirKit(kit(soltosDoKit(pdfSemTexto)), ctx);
    const a = itens.filter((i) => i.titulo === TEXTOS_KIT.pdfSemTexto);
    expect(a).toHaveLength(1);
    expect(a[0].nivel).toBe('amarelo');
    expect(TEXTOS_KIT.pdfSemTexto).toBe('não deu para ler este PDF; solte o .docx final para conferir o texto');
    expect(itens.some((i) => i.codigo === 'HA_TRECHO' || i.codigo === 'MARCA')).toBe(false);
    expect(de(itens, 'vermelho')).toEqual([]);
  });

  it('PDF sem texto com o .docx no kit: a conferência usa o texto do .docx', async () => {
    // o .docx do site ainda tem as marcas amarelas: só o texto dele dá o vermelho MARCA
    const docx = gravarDocx(documento);
    expect(textoDoDocx(docx)).toMatch(/\[(?:PREENCHER|COLAR DO GOM)/);
    const soltos = [...soltosDoKit(pdfSemTexto), { nome: 'memorial.docx', bytes: docx, papel: reconhecer('memorial.docx') }];
    const itens = await conferirKit(kit(soltos), ctx);
    expect(itens.some((i) => i.titulo === TEXTOS_KIT.pdfSemTexto)).toBe(false);
    expect(itens.find((i) => i.codigo === 'MARCA')!.nivel).toBe('vermelho');
    expect(itens.some((i) => i.titulo === TEXTOS_KIT.usouDocx)).toBe(true);
  });

  it('o PDF com texto ganha do .docx', async () => {
    const soltos = [...soltosDoKit(), { nome: 'memorial.docx', bytes: gravarDocx(documento), papel: reconhecer('memorial.docx') }];
    const itens = await conferirKit(kit(soltos), ctx);
    expect(de(itens, 'vermelho')).toEqual([]);
    expect(itens.find((i) => i.codigo === 'MARCA')!.nivel).toBe('verde');
  });

  it('sem planilha: o vermelho da falta, e a conferência da planilha não roda', async () => {
    const itens = await conferirKit(kit(soltosDoKit().filter((s) => s.papel !== 'planilha-xlsm')), ctx);
    expect(de(itens, 'vermelho')).toHaveLength(1);
    expect(itens.some((i) => i.codigo.startsWith('PLANILHA_'))).toBe(false);
  });

  it('planilha que não é a Planilha Padrão: vermelho com o erro', async () => {
    const soltos = soltosDoKit().map((s) => (s.papel === 'planilha-xlsm' ? { ...s, bytes: montarZip([{ caminho: 'a.txt', bytes: falso }]) } : s));
    const v = de(await conferirKit(kit(soltos), ctx), 'vermelho');
    expect(v).toHaveLength(1);
    expect(v[0].codigo).toBe('PLANILHA');
  });

  it('A1 sem a linha "SOB ...": PLANILHA_ASSUNTO amarelo, mesmo com ctx.assunto preenchido (sem verde falso)', async () => {
    const p = lerPlanilha(planilha.bytes, planilha.nome);
    const semAssunto = gravarXlsx(gravarCelulas(p.pasta, p.aba, { A1: { t: 'texto', v: 'Obs: planilha sem a linha do assunto' } }));
    const soltos = soltosDoKit().map((s) => (s.papel === 'planilha-xlsm' ? { ...s, bytes: semAssunto } : s));
    const itens = await conferirKit(kit(soltos), { ...ctx, assunto: 'SOB 0000000001_PROCESSO DOCUMENTAL_PARTE DA REDE EM APP' });
    const a = itens.filter((i) => i.codigo === 'PLANILHA_ASSUNTO');
    expect(a.map((i) => i.nivel)).toEqual(['amarelo']);
    // e com a A1 certa o verde vem da própria A1, mesmo com ctx.assunto de outra OS
    const certo = await conferirKit(kit(soltosDoKit()), { ...ctx, assunto: 'SOB 9999999999_PROCESSO DOCUMENTAL_REDE EM APP' });
    expect(certo.find((i) => i.codigo === 'PLANILHA_ASSUNTO')!.nivel).toBe('verde');
  });

  it('PDF que o pdf.js não abre: aviso próprio com o erro, diferente do PDF escaneado', async () => {
    const quebrado = { ...ctx, lerPdf: async (): Promise<never> => { throw new Error('PDF quebrado de teste'); } };
    const itens = await conferirKit(kit(soltosDoKit()), quebrado);
    const a = itens.filter((i) => i.titulo === TEXTOS_KIT.pdfNaoAbre);
    expect(a).toHaveLength(1);
    expect(a[0].nivel).toBe('amarelo');
    expect(a[0].porque).toContain('PDF quebrado de teste');
    expect(itens.some((i) => i.titulo === TEXTOS_KIT.pdfSemTexto)).toBe(false);
    expect(de(itens, 'vermelho')).toEqual([]);
    // com o .docx no kit, o texto dele é conferido
    const comDocx = await conferirKit(kit([...soltosDoKit(), { nome: 'memorial.docx', bytes: gravarDocx(documento), papel: 'memorial-docx' as const }]), quebrado);
    expect(comDocx.some((i) => i.titulo === TEXTOS_KIT.pdfNaoAbre)).toBe(true);
    expect(comDocx.find((i) => i.codigo === 'MARCA')!.nivel).toBe('vermelho');
  });

  it('.docx que não abre: amarelo próprio com o erro; não pede "solte o .docx" de novo', async () => {
    const docxRuim = { nome: 'memorial.docx', bytes: falso, papel: 'memorial-docx' as const };
    const semTexto = await conferirKit(kit([...soltosDoKit(pdfSemTexto), docxRuim]), ctx);
    const d = semTexto.filter((i) => i.codigo === 'MEMORIAL_DOCX');
    expect(d).toHaveLength(1);
    expect(d[0].nivel).toBe('amarelo');
    expect(d[0].titulo).toBe(TEXTOS_KIT.docxNaoAbre);
    expect(d[0].porque).toMatch(/\(.+\)$/); // o erro vai no porquê
    expect(semTexto.some((i) => i.titulo === TEXTOS_KIT.pdfSemTexto)).toBe(false);
    expect(semTexto.some((i) => i.titulo === TEXTOS_KIT.semTextoParaConferir)).toBe(true);
    // sem o PDF: o .docx ruim não some sem aviso
    const semPdf = await conferirKit(kit([...soltosDoKit().filter((s) => s.papel !== 'memorial-pdf'), docxRuim]), ctx);
    expect(semPdf.filter((i) => i.codigo === 'MEMORIAL_DOCX').map((i) => i.nivel)).toEqual(['amarelo']);
    // com o PDF bom: o .docx ruim que vai no kit também é avisado
    const pdfBom = await conferirKit(kit([...soltosDoKit(), docxRuim]), ctx);
    expect(pdfBom.filter((i) => i.codigo === 'MEMORIAL_DOCX')).toHaveLength(1);
    expect(de(pdfBom, 'vermelho')).toEqual([]);
  });

  it('arquivo que não é zip: o vermelho da Parte 1', async () => {
    const itens = await conferirKit(falso, ctx);
    expect(itens.map((i) => [i.nivel, i.codigo])).toEqual([['vermelho', 'ZIP']]);
  });
});
