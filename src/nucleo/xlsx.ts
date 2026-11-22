// Pasta do Excel (.xlsx/.xlsm) sem biblioteca: zip + XML. Lê as células e as listas; grava trocando só as partes
// que mudam (a aba, o desenho) e montando o zip de novo.
import { abrirZip, montarZip } from './zip';
import { percorrerXml } from './xml';
import type { Imagem } from './obra';

export interface Pasta { partes: Map<string, Uint8Array>; abas: { nome: string; caminho: string }[]; compartilhadas: string[] }

const ERRO_NAO_E_EXCEL = 'Este arquivo não é uma planilha do Excel';
const dec = new TextDecoder();

// ---------- referência de célula ----------

/** "AT" -> 46 (A = 1). */
export function numeroDaColuna(letra: string): number {
  let n = 0;
  for (const ch of letra.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** 46 -> "AT". */
export function letraDaColuna(n: number): string {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** "$AT$9" ou "AT9" -> { col: 46, linha: 9 }; null se não for uma célula. */
export function separarRef(ref: string): { col: number; linha: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref.trim());
  return m ? { col: numeroDaColuna(m[1]), linha: Number(m[2]) } : null;
}

interface Faixa { c1: number; l1: number; c2: number; l2: number }

function faixa(texto: string): Faixa | null {
  const [a, b = a] = texto.split(':');
  const p = separarRef(a);
  const q = separarRef(b);
  if (!p || !q) return null;
  return { c1: Math.min(p.col, q.col), l1: Math.min(p.linha, q.linha), c2: Math.max(p.col, q.col), l2: Math.max(p.linha, q.linha) };
}

// ---------- abrir ----------

const texto = (p: Map<string, Uint8Array>, caminho: string): string | null => {
  const b = p.get(caminho);
  return b ? dec.decode(b) : null;
};

// Destino de uma relação: relativo à pasta da parte de origem, ou absoluto quando começa com "/".
function destino(pastaBase: string, alvo: string): string {
  if (alvo.startsWith('/')) return alvo.slice(1);
  const partes = pastaBase.split('/').filter(Boolean);
  for (const s of alvo.split('/')) {
    if (s === '..') partes.pop();
    else if (s !== '.' && s !== '') partes.push(s);
  }
  return partes.join('/');
}

/** Texto de cada <si>: junta os <t> (texto rico) e ignora a fonética (<rPh>). */
function lerCompartilhadas(xml: string | null): string[] {
  const lista: string[] = [];
  if (!xml) return lista;
  let atual: string[] | null = null;
  let emT = 0;
  let emFonetica = 0;
  percorrerXml(xml, {
    abre(n) {
      if (n === 'si') atual = [];
      else if (n === 'rPh') emFonetica++;
      else if (n === 't') emT++;
    },
    fecha(n) {
      if (n === 'si' && atual) { lista.push(atual.join('')); atual = null; }
      else if (n === 'rPh') emFonetica--;
      else if (n === 't') emT--;
    },
    texto(t) { if (atual && emT > 0 && emFonetica === 0) atual.push(t); },
  });
  return lista;
}

/** Abre a pasta do Excel. Erro "Este arquivo não é uma planilha do Excel" se não for zip ou não tiver xl/workbook.xml. */
export function abrirXlsx(bytes: Uint8Array): Pasta {
  let arquivos;
  try {
    arquivos = abrirZip(bytes);
  } catch {
    throw new Error(ERRO_NAO_E_EXCEL);
  }
  const partes = new Map<string, Uint8Array>();
  for (const a of arquivos) partes.set(a.caminho, a.bytes);
  const livro = texto(partes, 'xl/workbook.xml');
  if (livro === null) throw new Error(ERRO_NAO_E_EXCEL);

  const alvos = new Map<string, string>();
  const rels = texto(partes, 'xl/_rels/workbook.xml.rels');
  let caminhoCompartilhadas = 'xl/sharedStrings.xml';
  if (rels) {
    percorrerXml(rels, {
      abre(n, a) {
        if (n !== 'Relationship' || !a.Id || !a.Target) return;
        const alvo = destino('xl', a.Target);
        alvos.set(a.Id, alvo);
        if ((a.Type ?? '').endsWith('/sharedStrings')) caminhoCompartilhadas = alvo;
      },
      fecha() {},
      texto() {},
    });
  }
  const abas: Pasta['abas'] = [];
  percorrerXml(livro, {
    abre(n, a) {
      // o r:id chega sem o prefixo, como "id"
      if (n === 'sheet' && a.name !== undefined && a.id && alvos.has(a.id)) abas.push({ nome: a.name, caminho: alvos.get(a.id)! });
    },
    fecha() {},
    texto() {},
  });
  return { partes, abas, compartilhadas: lerCompartilhadas(texto(partes, caminhoCompartilhadas)) };
}

// ---------- células ----------

interface LidoDaAba { celulas: Map<string, string>; validacoes: { sqref: string; formula: string }[] }

// Cache por parte (o Uint8Array): se a Tarefa 9 trocar a parte, a leitura é refeita.
const cache = new WeakMap<Uint8Array, LidoDaAba>();

function lerAba(p: Pasta, aba: string): LidoDaAba {
  const a = p.abas.find((x) => x.nome === aba);
  const bytes = a ? p.partes.get(a.caminho) : undefined;
  if (!a || !bytes) throw new Error(`A aba "${aba}" não existe nesta planilha`);
  const visto = cache.get(bytes);
  if (visto) return visto;

  const celulas = new Map<string, string>();
  const validacoes: LidoDaAba['validacoes'] = [];
  let ref = '';
  let tipo = '';
  let valor: string[] = [];
  let emC = false;
  let emV = false;
  let emIs = 0;
  let emT = 0;
  let emFonetica = 0;
  // validação: <dataValidation type="list" sqref><formula1>…</formula1></dataValidation>,
  // ou a forma do Excel 2010 (x14) com <x14:formula1><xm:f>…</xm:f></x14:formula1><xm:sqref>…</xm:sqref>
  let val: { tipo: string; sqref: string; formula: string } | null = null;
  let emFormula1 = 0;
  let emSqref = 0;
  percorrerXml(dec.decode(bytes), {
    abre(n, at) {
      if (n === 'c') { emC = true; ref = at.r ?? ''; tipo = at.t ?? ''; valor = []; }
      else if (emC && n === 'v') emV = true;
      else if (emC && n === 'is') emIs++;
      else if (emC && n === 'rPh') emFonetica++;
      else if (emC && n === 't') emT++;
      else if (n === 'dataValidation') { val = { tipo: at.type ?? '', sqref: at.sqref ?? '', formula: '' }; }
      else if (val && n === 'formula1') emFormula1++;
      else if (val && n === 'sqref') emSqref++;
    },
    fecha(n) {
      if (n === 'c' && emC) {
        emC = false;
        const bruto = valor.join('');
        let s: string | null = bruto;
        if (tipo === 's') s = p.compartilhadas[Number(bruto)] ?? null;
        if (ref && s !== null && (s !== '' || tipo === 'inlineStr')) celulas.set(ref, s);
      } else if (n === 'v') emV = false;
      else if (n === 'is') emIs--;
      else if (n === 'rPh') emFonetica--;
      else if (n === 't') emT--;
      else if (n === 'formula1') emFormula1--;
      else if (n === 'sqref') emSqref--;
      else if (n === 'dataValidation' && val) {
        if (val.tipo === 'list') validacoes.push({ sqref: val.sqref.trim(), formula: val.formula.trim() });
        val = null;
      }
    },
    texto(t) {
      if (emC) {
        if (emV || (emIs > 0 && emT > 0 && emFonetica === 0)) valor.push(t);
      } else if (val) {
        if (emFormula1 > 0) val.formula += t;
        else if (emSqref > 0) val.sqref += (val.sqref ? ' ' : '') + t;
      }
    },
  });
  const lido = { celulas, validacoes };
  cache.set(bytes, lido);
  return lido;
}

/** Todas as células com valor da aba: "G5" -> texto (compartilhado, na célula ou o número como está gravado). */
export function lerCelulas(p: Pasta, aba: string): Map<string, string> {
  return new Map(lerAba(p, aba).celulas);
}

// ---------- validação de lista ----------

const cobre = (sqref: string, col: number, linha: number): boolean =>
  sqref.split(/\s+/).some((pedaco) => {
    const f = faixa(pedaco);
    return f !== null && col >= f.c1 && col <= f.c2 && linha >= f.l1 && linha <= f.l2;
  });

function nomesDefinidos(p: Pasta): Map<string, string> {
  const nomes = new Map<string, string>();
  const livro = texto(p.partes, 'xl/workbook.xml');
  if (!livro) return nomes;
  let atual: string | null = null;
  let corpo = '';
  percorrerXml(livro, {
    abre(n, a) { if (n === 'definedName' && a.name) { atual = a.name; corpo = ''; } },
    fecha(n) {
      if (n === 'definedName' && atual !== null) {
        if (!nomes.has(atual)) nomes.set(atual, corpo.trim());
        atual = null;
      }
    },
    texto(t) { if (atual !== null) corpo += t; },
  });
  return nomes;
}

// Opções de uma fórmula de lista; null quando não dá para resolver (outra pasta, nome que não existe, função).
function opcoesDaFormula(p: Pasta, abaAtual: string, formula: string, nivel = 0): string[] | null {
  let f = formula.trim().replace(/^=/, '');
  const aspas = /^"([\s\S]*)"$/.exec(f);
  if (aspas) return aspas[1].replace(/""/g, '"').split(',').map((s) => s.trim()).filter((s) => s !== '');
  if (f.includes('[')) return null; // faixa em outra pasta do Excel
  let aba = abaAtual;
  const ex = f.lastIndexOf('!');
  if (ex >= 0) {
    aba = f.slice(0, ex).replace(/^'([\s\S]*)'$/, '$1').replace(/''/g, "'");
    f = f.slice(ex + 1);
  }
  const fx = faixa(f);
  if (!fx) {
    if (ex >= 0 || nivel > 0) return null;
    const def = nomesDefinidos(p).get(f);
    return def === undefined ? null : opcoesDaFormula(p, abaAtual, def, nivel + 1);
  }
  if (!p.abas.some((a) => a.nome === aba)) return null;
  const celulas = lerAba(p, aba).celulas;
  const saida: string[] = [];
  for (let l = fx.l1; l <= fx.l2; l++) {
    for (let c = fx.c1; c <= fx.c2; c++) {
      const v = celulas.get(letraDaColuna(c) + l);
      if (v !== undefined && v.trim() !== '') saida.push(v);
    }
  }
  return saida;
}

/** Opções da validação tipo lista da célula; várias validações na mesma célula se juntam (sem repetir).
 *  null sem validação de lista, ou quando alguma lista não dá para ler. */
export function listaDaCelula(p: Pasta, aba: string, celula: string): string[] | null {
  const r = separarRef(celula);
  if (!r) return null;
  const doCaso = lerAba(p, aba).validacoes.filter((v) => cobre(v.sqref, r.col, r.linha));
  if (doCaso.length === 0) return null;
  const juntas: string[] = [];
  for (const v of doCaso) {
    const o = opcoesDaFormula(p, aba, v.formula);
    if (o === null) return null;
    for (const s of o) if (!juntas.includes(s)) juntas.push(s);
  }
  return juntas;
}

// ---------- gravar ----------
// Só troca o texto das partes que precisam mudar; as outras (macro, estilos, outras abas) seguem byte a byte.

// 'vazio' apaga o valor e deixa a célula com o estilo dela
export type Valor = { t: 'texto'; v: string } | { t: 'numero'; v: number } | { t: 'data'; v: string } | { t: 'vazio' };

const enc = new TextEncoder();
// caracteres de controle não cabem no XML; o resto é escapado
const escXml = (s: string): string =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "2026-11-03" -> número de série do Excel (dias desde 30/12/1899). */
export function serialDaData(aaaammdd: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(aaaammdd);
  if (!m) throw new Error(`Data inválida: ${aaaammdd}`);
  return (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - Date.UTC(1899, 11, 30)) / 86400000;
}

function caminhoDaAba(p: Pasta, aba: string): string {
  const a = p.abas.find((x) => x.nome === aba);
  if (!a || !p.partes.has(a.caminho)) throw new Error(`A aba "${aba}" não existe nesta planilha`);
  return a.caminho;
}

// etiqueta que começa em `ini`: onde ela acaba (depois do ">") e se ela se fecha sozinha ("/>")
function fimDaEtiqueta(xml: string, ini: number): { fim: number; sozinha: boolean } {
  let aspas = '';
  for (let i = ini + 1; i < xml.length; i++) {
    const c = xml[i];
    if (aspas) { if (c === aspas) aspas = ''; } else if (c === '"' || c === "'") aspas = c;
    else if (c === '>') return { fim: i + 1, sozinha: xml[i - 1] === '/' };
  }
  throw new Error('XML da aba cortado');
}

// elemento inteiro que começa em `ini` (não há <c> dentro de <c> nem <row> dentro de <row>)
function fimDoElemento(xml: string, ini: number, nome: string): number {
  const e = fimDaEtiqueta(xml, ini);
  if (e.sozinha) return e.fim;
  const f = xml.indexOf(`</${nome}>`, e.fim);
  if (f < 0) throw new Error('XML da aba cortado');
  return f + nome.length + 3;
}

const atributo = (etiqueta: string, nome: string): string | null => {
  const m = new RegExp(`\\s${nome}="([^"]*)"`).exec(etiqueta);
  return m ? m[1] : null;
};

// os elementos <nome> entre ini e fim, um depois do outro
function elementos(xml: string, ini: number, fim: number, nome: string): { ini: number; fim: number; etiqueta: string }[] {
  const saida: { ini: number; fim: number; etiqueta: string }[] = [];
  const re = new RegExp(`<${nome}[\\s/>]`, 'g');
  re.lastIndex = ini;
  for (let m = re.exec(xml); m && m.index < fim; m = re.exec(xml)) {
    const e = fimDaEtiqueta(xml, m.index);
    const f = fimDoElemento(xml, m.index, nome);
    saida.push({ ini: m.index, fim: f, etiqueta: xml.slice(m.index, e.fim) });
    re.lastIndex = f;
  }
  return saida;
}

function xmlDaCelula(ref: string, s: string | null, valor: Valor): string {
  const estilo = s !== null ? ` s="${s}"` : '';
  switch (valor.t) {
    case 'texto': return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${escXml(valor.v)}</t></is></c>`;
    case 'numero': return `<c r="${ref}"${estilo}><v>${valor.v}</v></c>`;
    case 'data': return `<c r="${ref}"${estilo}><v>${serialDaData(valor.v)}</v></c>`;
    case 'vazio': return `<c r="${ref}"${estilo}/>`;
  }
}

// "spans" da linha e "dimension" da aba são dicas do Excel: crescem quando a célula nova fica fora
function alargarSpans(etiquetaLinha: string, col: number): string {
  const sp = atributo(etiquetaLinha, 'spans');
  if (!sp) return etiquetaLinha;
  const [a, b] = sp.split(':').map(Number);
  if (col >= a && col <= b) return etiquetaLinha;
  return etiquetaLinha.replace(/\sspans="[^"]*"/, ` spans="${Math.min(a, col)}:${Math.max(b, col)}"`);
}

function alargarDimensao(xml: string, col: number, linha: number): string {
  const m = /<dimension ref="([^"]*)"\s*\/>/.exec(xml);
  if (!m) return xml;
  const [a, b = a] = m[1].split(':');
  const p = separarRef(a);
  const q = separarRef(b);
  if (!p || !q) return xml;
  const c1 = Math.min(p.col, col), l1 = Math.min(p.linha, linha), c2 = Math.max(q.col, col), l2 = Math.max(q.linha, linha);
  const ref = c1 === c2 && l1 === l2 ? `${letraDaColuna(c1)}${l1}` : `${letraDaColuna(c1)}${l1}:${letraDaColuna(c2)}${l2}`;
  return xml.replace(m[0], `<dimension ref="${ref}"/>`);
}

function gravarUma(xml: string, ref: string, valor: Valor, formulasTiradas: string[]): string {
  const r = separarRef(ref);
  if (!r) throw new Error(`Célula inválida: ${ref}`);
  const iDados = xml.indexOf('<sheetData');
  if (iDados < 0) throw new Error('A aba não tem <sheetData>');
  const eDados = fimDaEtiqueta(xml, iDados);
  if (eDados.sozinha) return gravarUma(`${xml.slice(0, iDados)}<sheetData></sheetData>${xml.slice(eDados.fim)}`, ref, valor, formulasTiradas);
  const fimDados = xml.indexOf('</sheetData>', eDados.fim);
  const linhas = elementos(xml, eDados.fim, fimDados, 'row');
  const linha = linhas.find((l) => Number(atributo(l.etiqueta, 'r')) === r.linha);
  if (!linha) {
    // linha nova, na ordem das linhas
    const depois = linhas.find((l) => Number(atributo(l.etiqueta, 'r')) > r.linha);
    const onde = depois ? depois.ini : fimDados;
    return alargarDimensao(`${xml.slice(0, onde)}<row r="${r.linha}">${xmlDaCelula(ref, null, valor)}</row>${xml.slice(onde)}`, r.col, r.linha);
  }
  const eLinha = fimDaEtiqueta(xml, linha.ini);
  const etiquetaNova = alargarSpans(eLinha.sozinha ? linha.etiqueta.replace(/\s*\/>$/, '>') : linha.etiqueta, r.col);
  const miolo = eLinha.sozinha ? '' : xml.slice(eLinha.fim, linha.fim - '</row>'.length);
  const celulas = elementos(miolo, 0, miolo.length, 'c');
  const atual = celulas.find((c) => atributo(c.etiqueta, 'r') === ref);
  let mioloNovo: string;
  if (atual) {
    if (/<f[\s>/]/.test(miolo.slice(atual.ini, atual.fim))) formulasTiradas.push(ref);
    mioloNovo = miolo.slice(0, atual.ini) + xmlDaCelula(ref, atributo(atual.etiqueta, 's'), valor) + miolo.slice(atual.fim);
  } else {
    // célula nova, na ordem das colunas
    const depois = celulas.find((c) => (separarRef(atributo(c.etiqueta, 'r') ?? '')?.col ?? 0) > r.col);
    const onde = depois ? depois.ini : miolo.length;
    mioloNovo = miolo.slice(0, onde) + xmlDaCelula(ref, null, valor) + miolo.slice(onde);
  }
  const novo = `${xml.slice(0, linha.ini)}${etiquetaNova}${mioloNovo}</row>${xml.slice(linha.fim)}`;
  return atual ? novo : alargarDimensao(novo, r.col, r.linha);
}

// célula que tinha fórmula e virou valor sai da cadeia de cálculo (senão o Excel abre pedindo reparo)
function tirarDaCadeia(partes: Map<string, Uint8Array>, refs: string[], idAba: string | null): void {
  const cadeia = partes.get('xl/calcChain.xml');
  if (!cadeia) return;
  let xml = dec.decode(cadeia);
  let atual = idAba;
  xml = xml.replace(/<c\s[^>]*\/>/g, (todo) => {
    // o "i" só aparece quando muda de aba: vale para as células seguintes
    const i = atributo(todo, 'i');
    if (i !== null) atual = i;
    return refs.includes(atributo(todo, 'r') ?? '') && (idAba === null || atual === idAba) ? '' : todo;
  });
  partes.set('xl/calcChain.xml', enc.encode(xml));
}

/** Grava valores nas células da aba, mantendo o estilo (s) de cada célula. As outras células e partes não mudam. */
export function gravarCelulas(p: Pasta, aba: string, celulas: Record<string, Valor>): Pasta {
  const caminho = caminhoDaAba(p, aba);
  let xml = dec.decode(p.partes.get(caminho)!);
  const formulas: string[] = [];
  for (const [ref, valor] of Object.entries(celulas)) xml = gravarUma(xml, ref.toUpperCase(), valor, formulas);
  const partes = new Map(p.partes);
  partes.set(caminho, enc.encode(xml));
  if (formulas.length) {
    // o "i" da cadeia de cálculo é o sheetId da aba
    let sheetId: string | null = null;
    percorrerXml(dec.decode(p.partes.get('xl/workbook.xml')!), {
      abre(n, a) { if (n === 'sheet' && a.name === aba) sheetId = a.sheetId ?? null; },
      fecha() {},
      texto() {},
    });
    tirarDaCadeia(partes, formulas, sheetId);
  }
  return { ...p, partes };
}

// ---------- imagem ----------

const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const TIPO_DESENHO = `${NS_REL}/drawing`;
const TIPO_IMAGEM = `${NS_REL}/image`;
const EMU_POR_PONTO = 12700;

const relsDe = (caminho: string): string => {
  const i = caminho.lastIndexOf('/');
  return `${caminho.slice(0, i)}/_rels/${caminho.slice(i + 1)}.rels`;
};

function lerRels(xml: string | null): { id: string; alvo: string }[] {
  const saida: { id: string; alvo: string }[] = [];
  if (!xml) return saida;
  for (const m of xml.matchAll(/<Relationship\s[^>]*>/g)) saida.push({ id: atributo(m[0], 'Id') ?? '', alvo: atributo(m[0], 'Target') ?? '' });
  return saida;
}

function idLivre(rels: { id: string }[]): string {
  let n = 1;
  while (rels.some((r) => r.id === `rId${n}`)) n++;
  return `rId${n}`;
}

function comRel(xml: string | null, id: string, tipo: string, alvo: string): string {
  const rel = `<Relationship Id="${id}" Type="${tipo}" Target="${alvo}"/>`;
  if (!xml) return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`;
  return xml.replace('</Relationships>', `${rel}</Relationships>`);
}

function caminhoLivre(partes: Map<string, Uint8Array>, modelo: (n: number) => string): string {
  let n = 1;
  while (partes.has(modelo(n))) n++;
  return modelo(n);
}

// altura de uma linha em EMU: a "ht" dela, senão a altura padrão da aba (15 pontos quando nada diz)
function alturaDaLinha(xml: string, linha: number): number {
  const padrao = Number(atributo(/<sheetFormatPr\s[^>]*>/.exec(xml)?.[0] ?? '', 'defaultRowHeight') ?? 15);
  const m = new RegExp(`<row\\s[^>]*\\br="${linha}"[^>]*>`).exec(xml);
  const ht = m ? atributo(m[0], 'ht') : null;
  return Math.round((ht !== null ? Number(ht) : padrao) * EMU_POR_PONTO);
}

// o <drawing> entra antes destes (a ordem dos elementos do worksheet é fixa)
const DEPOIS_DO_DESENHO = ['<legacyDrawing', '<legacyDrawingHF', '<drawingHF', '<picture', '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst', '</worksheet>'];

/**
 * Põe a imagem (PNG ou JPEG) na aba: canto de cima à esquerda na célula `ancora.de`, altura das linhas de `de` até a linha
 * antes de `ate`, largura pela proporção da imagem. O que já estava no desenho fica igual; só entra a âncora nova.
 */
export function porImagem(p: Pasta, aba: string, ancora: { de: string; ate: string }, png: Imagem): Pasta {
  const de = separarRef(ancora.de);
  const ate = separarRef(ancora.ate);
  if (!de || !ate || ate.linha <= de.linha) throw new Error('Âncora da imagem inválida');
  const caminhoAba = caminhoDaAba(p, aba);
  const partes = new Map(p.partes);
  let abaXml = dec.decode(partes.get(caminhoAba)!);
  const relsAba = relsDe(caminhoAba);
  let relsAbaXml = texto(partes, relsAba);
  let tipos = texto(partes, '[Content_Types].xml') ?? '';

  // o desenho da aba: o que já existe, ou um novo
  let caminhoDesenho: string | null = null;
  const etiquetaDesenho = /<drawing\s[^>]*>/.exec(abaXml);
  if (etiquetaDesenho) {
    const id = atributo(etiquetaDesenho[0], 'r:id');
    const rel = lerRels(relsAbaXml).find((r) => r.id === id);
    if (rel) caminhoDesenho = destino(caminhoAba.slice(0, caminhoAba.lastIndexOf('/')), rel.alvo);
  }
  if (caminhoDesenho === null || !partes.has(caminhoDesenho)) {
    caminhoDesenho = caminhoLivre(partes, (n) => `xl/drawings/drawing${n}.xml`);
    partes.set(caminhoDesenho, enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${NS_A}"></xdr:wsDr>`));
    const id = idLivre(lerRels(relsAbaXml));
    relsAbaXml = comRel(relsAbaXml, id, TIPO_DESENHO, `../drawings/${caminhoDesenho.split('/').pop()}`);
    const raiz = /<worksheet\b[^>]*>/.exec(abaXml)!;
    if (!raiz[0].includes(`xmlns:r="${NS_REL}"`)) abaXml = abaXml.replace(raiz[0], raiz[0].replace('<worksheet', `<worksheet xmlns:r="${NS_REL}"`));
    const onde = Math.min(...DEPOIS_DO_DESENHO.map((t) => abaXml.indexOf(t)).filter((i) => i >= 0));
    abaXml = `${abaXml.slice(0, onde)}<drawing r:id="${id}"/>${abaXml.slice(onde)}`;
    tipos = tipos.replace('</Types>', `<Override PartName="/${caminhoDesenho}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
    partes.set(relsAba, enc.encode(relsAbaXml));
    partes.set(caminhoAba, enc.encode(abaXml));
  }

  // a imagem e a relação dela no desenho
  const ext = png.tipo === 'jpeg' ? 'jpeg' : 'png';
  const caminhoImagem = caminhoLivre(partes, (n) => `xl/media/image${n}.${ext}`);
  partes.set(caminhoImagem, png.bytes);
  const relsDesenho = relsDe(caminhoDesenho);
  const relsDesenhoXml = texto(partes, relsDesenho);
  const idImagem = idLivre(lerRels(relsDesenhoXml));
  partes.set(relsDesenho, enc.encode(comRel(relsDesenhoXml, idImagem, TIPO_IMAGEM, `../media/${caminhoImagem.split('/').pop()}`)));
  if (!new RegExp(`<Default\\s[^>]*Extension="${ext}"`, 'i').test(tipos)) {
    tipos = tipos.replace(/<Types\b[^>]*>/, (t) => `${t}<Default Extension="${ext}" ContentType="image/${ext}"/>`);
  }
  partes.set('[Content_Types].xml', enc.encode(tipos));

  // âncora de uma célula: altura das linhas, largura pela proporção
  let cy = 0;
  for (let l = de.linha; l < ate.linha; l++) cy += alturaDaLinha(abaXml, l);
  const cx = Math.round((cy * png.largura) / Math.max(png.altura, 1));
  let desenho = dec.decode(partes.get(caminhoDesenho)!);
  const ids = [...desenho.matchAll(/<xdr:cNvPr\s[^>]*\bid="(\d+)"/g)].map((m) => Number(m[1]));
  const idForma = Math.max(1, ...ids) + 1;
  const ancoraXml =
    `<xdr:oneCellAnchor><xdr:from><xdr:col>${de.col - 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${de.linha - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:ext cx="${cx}" cy="${cy}"/>` +
    `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${idForma}" name="Assinatura ${idForma}"/><xdr:cNvPicPr><a:picLocks xmlns:a="${NS_A}" noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
    `<xdr:blipFill><a:blip xmlns:a="${NS_A}" xmlns:r="${NS_REL}" r:embed="${idImagem}"/><a:stretch xmlns:a="${NS_A}"><a:fillRect/></a:stretch></xdr:blipFill>` +
    `<xdr:spPr><a:xfrm xmlns:a="${NS_A}"><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom xmlns:a="${NS_A}" prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>` +
    '<xdr:clientData/></xdr:oneCellAnchor>';
  desenho = desenho.replace('</xdr:wsDr>', `${ancoraXml}</xdr:wsDr>`);
  partes.set(caminhoDesenho, enc.encode(desenho));
  return { ...p, partes };
}

// caminho do desenho ligado à aba, ou null
function desenhoDaAba(p: Pasta, caminhoAba: string): string | null {
  const abaXml = dec.decode(p.partes.get(caminhoAba)!);
  const etiqueta = /<drawing\s[^>]*>/.exec(abaXml);
  if (!etiqueta) return null;
  const id = atributo(etiqueta[0], 'r:id');
  const rel = lerRels(texto(p.partes, relsDe(caminhoAba))).find((r) => r.id === id);
  if (!rel) return null;
  const caminho = destino(caminhoAba.slice(0, caminhoAba.lastIndexOf('/')), rel.alvo);
  return p.partes.has(caminho) ? caminho : null;
}

/** Linhas (1 = primeira, as duas inclusive) que cada imagem do desenho da aba ocupa. Só imagens (<pic>) ancoradas em célula. */
export function imagensDaAba(p: Pasta, aba: string): { linhaDe: number; linhaAte: number }[] {
  const caminhoAba = caminhoDaAba(p, aba);
  const caminho = desenhoDaAba(p, caminhoAba);
  if (caminho === null) return [];
  const abaXml = dec.decode(p.partes.get(caminhoAba)!);
  const desenho = dec.decode(p.partes.get(caminho)!);
  const num = (xml: string, nome: string): number => Number(new RegExp(`<(?:\\w+:)?${nome}>\\s*(-?\\d+)\\s*<`).exec(xml)?.[1] ?? 0);
  const saida: { linhaDe: number; linhaAte: number }[] = [];
  for (const m of desenho.matchAll(/<(?:\w+:)?(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/(?:\w+:)?\1>/g)) {
    if (!/<(?:\w+:)?pic[\s>]/.test(m[0])) continue;
    const de = /<(?:\w+:)?from>([\s\S]*?)<\/(?:\w+:)?from>/.exec(m[0])?.[1] ?? '';
    const linhaDe = num(de, 'row') + 1;
    let linhaAte = linhaDe;
    if (m[1] === 'twoCellAnchor') {
      const ate = /<(?:\w+:)?to>([\s\S]*?)<\/(?:\w+:)?to>/.exec(m[0])?.[1] ?? '';
      // terminar no topo de uma linha (deslocamento 0) não ocupa essa linha
      linhaAte = Math.max(linhaDe, num(ate, 'row') + (num(ate, 'rowOff') > 0 ? 1 : 0));
    } else {
      // uma célula: desce pelas alturas das linhas até cobrir a altura da imagem
      const cy = Number(/<(?:\w+:)?ext\s[^>]*\bcy="(\d+)"/.exec(m[0])?.[1] ?? 0);
      let resto = cy + num(de, 'rowOff') - alturaDaLinha(abaXml, linhaDe);
      while (resto > 0) { linhaAte++; resto -= alturaDaLinha(abaXml, linhaAte); }
    }
    saida.push({ linhaDe, linhaAte });
  }
  return saida;
}

/** Monta o arquivo de novo, com as partes na mesma ordem. */
export function gravarXlsx(p: Pasta): Uint8Array {
  return montarZip([...p.partes].map(([caminho, bytes]) => ({ caminho, bytes })));
}
