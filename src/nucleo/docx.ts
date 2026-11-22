import { abrirZip, montarZip, type ArquivoZip } from './zip';
import { percorrerXml } from './xml';
import type { Imagem } from './obra';
import {
  EMU_POR_TWIP, ESPACO, FONTE_CORPO, FONTE_TITULO, LARGURA_UTIL, LARGURA_UTIL_EMU, MARGEM, PAGINA, SECAO, TAMANHO,
} from '../regras/memorial-estilo';

export interface Texto { texto: string; negrito?: boolean; amarelo?: boolean }
export type Bloco =
  | { t: 'titulo'; textos: Texto[] }
  | { t: 'secao'; texto: string }
  | { t: 'paragrafo'; textos: Texto[]; centro?: boolean }
  | { t: 'tabela'; cabecalho: string[]; linhas: Texto[][][] }
  | { t: 'figura'; numero: number; legenda: string; imagem: Imagem | null } // legenda: só o texto depois de "Figura N: " (o prefixo é posto pelo gravador)
  | { t: 'assinatura'; nome: string; registro: string; rnp: string; imagem: Imagem | null; nota: string | null };
export interface Documento { cabecalho: { linhas: string[]; logo: Imagem | null }; blocos: Bloco[] }

// ---------- texto simples ----------

// Tira caracteres que o XML não aceita e troca quebra de linha por espaço (um parágrafo = uma linha).
const limpa = (s: string): string =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/\r?\n|\r/g, ' ');
const juntar = (textos: Texto[]): string => textos.map((x) => limpa(x.texto)).join('');
const avisoFigura = (n: number): string => `[PREENCHER: solte a imagem da Figura ${n} no site]`;
const legendaFigura = (n: number, legenda: string): string => `Figura ${n}: ${legenda}`;

/** Um parágrafo por linha, sem formatação, na mesma ordem em que o .docx grava. Parágrafo vazio não conta. */
export function textoDoDocumento(doc: Documento): string {
  const l: string[] = [];
  for (const b of doc.blocos) {
    if (b.t === 'titulo' || b.t === 'paragrafo') l.push(juntar(b.textos));
    else if (b.t === 'secao') l.push(limpa(b.texto));
    else if (b.t === 'tabela') {
      for (const c of b.cabecalho) l.push(limpa(c));
      for (const linha of b.linhas) for (const cel of linha) l.push(juntar(cel));
    } else if (b.t === 'figura') {
      if (!b.imagem) l.push(avisoFigura(b.numero));
      l.push(limpa(legendaFigura(b.numero, b.legenda)));
    } else {
      l.push(limpa(b.nome), limpa(b.registro), limpa(b.rnp));
      if (b.nota) l.push(limpa(b.nota));
    }
  }
  return l.filter((x) => x !== '').join('\n');
}

/** Lê word/document.xml de um .docx: um parágrafo (w:p) por linha, só o texto dos w:t. */
export function textoDoDocx(bytes: Uint8Array): string {
  const arq = abrirZip(bytes).find((a) => a.caminho === 'word/document.xml');
  if (!arq) throw new Error('Este arquivo não é um .docx');
  const linhas: string[] = [];
  let atual = '';
  let dentroT = false;
  percorrerXml(new TextDecoder().decode(arq.bytes), {
    abre(nome) { if (nome === 'p') atual = ''; else if (nome === 't') dentroT = true; },
    fecha(nome) { if (nome === 't') dentroT = false; else if (nome === 'p') linhas.push(atual); },
    texto(t) { if (dentroT) atual += t; },
  });
  return linhas.filter((x) => x !== '').join('\n');
}

// ---------- imagem ----------

/** Lê tipo e tamanho de um PNG (IHDR) ou JPEG (SOF0, SOF1 ou SOF2). Outro formato devolve null. */
export function lerImagem(bytes: Uint8Array): Imagem | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 24 && PNG.every((b, i) => bytes[i] === b) && dv.getUint32(12) === 0x49484452) {
    const largura = dv.getUint32(16);
    const altura = dv.getUint32(20);
    return largura > 0 && altura > 0 ? { bytes, tipo: 'png', largura, altura } : null;
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 4 <= bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const m = bytes[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m === 0xd9 || m === 0xda) return null;
      if (m === 0xc0 || m === 0xc1 || m === 0xc2) {
        if (i + 9 > bytes.length) return null;
        const altura = dv.getUint16(i + 5);
        const largura = dv.getUint16(i + 7);
        return largura > 0 && altura > 0 ? { bytes, tipo: 'jpeg', largura, altura } : null;
      }
      i += 2 + dv.getUint16(i + 2);
    }
  }
  return null;
}

// ---------- XML ----------

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Texto só de espaços vira referência numérica, senão o leitor de XML do site o descartaria.
const escTexto = (s: string): string =>
  /^\s+$/.test(s) ? [...s].map((c) => `&#${c.codePointAt(0)};`).join('') : esc(s);

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const CAB = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function corrida(t: Texto, extra = '', forcaNegrito = false): string {
  const texto = limpa(t.texto);
  const rpr = (forcaNegrito || t.negrito ? '<w:b/><w:bCs/>' : '') + extra + (t.amarelo ? '<w:highlight w:val="yellow"/>' : '');
  const preserva = /^\s|\s$/.test(texto) ? ' xml:space="preserve"' : '';
  return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t${preserva}>${escTexto(texto)}</w:t></w:r>`;
}

const paragrafo = (corpo: string, ppr = ''): string => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${corpo}</w:p>`;

// Imagens coletadas durante a montagem: cada uma ganha um nome em word/media/ e um rId.
interface Midia { nome: string; imagem: Imagem; rId: string; parte: 'corpo' | 'cabecalho' }
class Midias {
  lista: Midia[] = [];
  private idDesenho = 1;
  adiciona(imagem: Imagem, parte: Midia['parte']): Midia {
    const n = this.lista.length + 1;
    const m = { nome: `imagem${n}.${imagem.tipo === 'png' ? 'png' : 'jpeg'}`, imagem, rId: `rId${100 + n}`, parte };
    this.lista.push(m);
    return m;
  }
  desenho(m: Midia, cx: number, cy: number, descr: string): string {
    const id = this.idDesenho++;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Imagem ${id}" descr="${esc(descr)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${m.nome}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${m.rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }
}

const ALTURA_MAX_EMU = 7_200_000; // 20 cm: figura muito alta é reduzida para caber na página

function tamanhoFigura(img: Imagem): [number, number] {
  let cx = LARGURA_UTIL_EMU;
  let cy = Math.round((cx * img.altura) / img.largura);
  if (cy > ALTURA_MAX_EMU) { cx = Math.round((cx * ALTURA_MAX_EMU) / cy); cy = ALTURA_MAX_EMU; }
  return [cx, cy];
}

function tabela(cabecalho: string[], linhas: Texto[][][]): string {
  const n = Math.max(cabecalho.length, ...linhas.map((l) => l.length), 1);
  const larg = Math.floor(LARGURA_UTIL / n);
  const borda = (l: string) => `<w:${l} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`;
  const ppr = '<w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/>';
  const celula = (corpo: string, sombra: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="${larg}" w:type="dxa"/>${sombra ? '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>' : ''}</w:tcPr>${corpo}</w:tc>`;
  const colunas = Array.from({ length: n }, (_, i) => i);
  const linhaCab = `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${colunas.map((i) =>
    celula(paragrafo(corrida({ texto: cabecalho[i] ?? '' }, '', true), ppr), true)).join('')}</w:tr>`;
  const corpo = linhas.map((l) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${colunas.map((i) =>
    celula(paragrafo((l[i] ?? []).map((t) => corrida(t)).join(''), ppr), false)).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${larg * n}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(borda).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${colunas.map(() => `<w:gridCol w:w="${larg}"/>`).join('')}</w:tblGrid>${linhaCab}${corpo}</w:tbl>${paragrafo('', '<w:spacing w:after="0"/>')}`;
}

function bloco(b: Bloco, midias: Midias): string {
  switch (b.t) {
    case 'titulo': {
      const tam = `<w:sz w:val="${TAMANHO.titulo}"/><w:szCs w:val="${TAMANHO.titulo}"/>`;
      return paragrafo(b.textos.map((t) => corrida(t, tam, true)).join(''), '<w:jc w:val="center"/>');
    }
    case 'secao':
      return paragrafo(corrida({ texto: b.texto }), '<w:pStyle w:val="Heading1"/>');
    case 'paragrafo':
      return paragrafo(b.textos.map((t) => corrida(t)).join(''), `<w:jc w:val="${b.centro ? 'center' : 'both'}"/>`);
    case 'tabela':
      return tabela(b.cabecalho, b.linhas);
    case 'figura': {
      let corpo: string;
      if (b.imagem) {
        const [cx, cy] = tamanhoFigura(b.imagem);
        corpo = midias.desenho(midias.adiciona(b.imagem, 'corpo'), cx, cy, `Figura ${b.numero}`);
      } else corpo = corrida({ texto: avisoFigura(b.numero), amarelo: true });
      const tam = `<w:sz w:val="${TAMANHO.legenda}"/><w:szCs w:val="${TAMANHO.legenda}"/>`;
      return paragrafo(corpo, '<w:keepNext/><w:jc w:val="center"/>')
        + paragrafo(corrida({ texto: legendaFigura(b.numero, b.legenda) }, tam), '<w:pStyle w:val="Caption"/><w:jc w:val="center"/>');
    }
    case 'assinatura': {
      const centro = '<w:jc w:val="center"/><w:spacing w:after="0"/>';
      let x = '';
      if (b.imagem) {
        const cx = 1_440_000; // 4 cm de largura
        const cy = Math.round((cx * b.imagem.altura) / b.imagem.largura);
        x += paragrafo(midias.desenho(midias.adiciona(b.imagem, 'corpo'), cx, cy, 'Assinatura'), `<w:keepNext/>${centro}`);
      }
      x += paragrafo(corrida({ texto: b.nome, negrito: true }), `<w:keepNext/>${centro}`);
      x += paragrafo(corrida({ texto: b.registro }), `<w:keepNext/>${centro}`);
      x += paragrafo(corrida({ texto: b.rnp }), centro);
      if (b.nota) x += paragrafo(corrida({ texto: b.nota, amarelo: true }), centro);
      return x;
    }
  }
}

const fonte = (f: string) => `<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:eastAsia="${f}" w:cs="${f}"/>`;
const ESTILOS = `${CAB}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr>${fonte(FONTE_CORPO)}<w:sz w:val="${TAMANHO.corpo}"/><w:szCs w:val="${TAMANHO.corpo}"/><w:lang w:val="pt-BR" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="${ESPACO.depois}" w:line="${ESPACO.linha}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${SECAO.antes}" w:after="${SECAO.depois}" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr>${fonte(FONTE_TITULO)}<w:color w:val="${SECAO.cor}"/><w:sz w:val="${TAMANHO.secao}"/><w:szCs w:val="${TAMANHO.secao}"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="35"/><w:qFormat/><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="${TAMANHO.legenda}"/><w:szCs w:val="${TAMANHO.legenda}"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:style></w:styles>`;

const SETTINGS = `${CAB}<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

function cabecalhoXml(cab: Documento['cabecalho'], midias: Midias): string {
  const tam = `<w:sz w:val="${TAMANHO.cabecalho}"/><w:szCs w:val="${TAMANHO.cabecalho}"/>`;
  const dir = cab.linhas.map((l) => paragrafo(corrida({ texto: l }, tam), '<w:pStyle w:val="Header"/><w:jc w:val="right"/>')).join('')
    || paragrafo('', '<w:pStyle w:val="Header"/>');
  if (!cab.logo) return `${CAB}<w:hdr ${NS}>${dir}</w:hdr>`;
  // Logo à esquerda (altura de 1,5 cm, limitada a um terço da largura útil) e as linhas à direita.
  const esq = Math.round(LARGURA_UTIL / 3);
  const maxCx = esq * EMU_POR_TWIP;
  let cy = 540000;
  let cx = Math.round((cy * cab.logo.largura) / cab.logo.altura);
  if (cx > maxCx) { cy = Math.round((cy * maxCx) / cx); cx = maxCx; }
  const logo = midias.desenho(midias.adiciona(cab.logo, 'cabecalho'), cx, cy, 'Logotipo');
  const celula = (larg: number, corpo: string) => `<w:tc><w:tcPr><w:tcW w:w="${larg}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${corpo}</w:tc>`;
  const tabela = `<w:tbl><w:tblPr><w:tblW w:w="${LARGURA_UTIL}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="${esq}"/><w:gridCol w:w="${LARGURA_UTIL - esq}"/></w:tblGrid><w:tr>${celula(esq, paragrafo(logo, '<w:pStyle w:val="Header"/>'))}${celula(LARGURA_UTIL - esq, dir)}</w:tr></w:tbl>`;
  return `${CAB}<w:hdr ${NS}>${tabela}${paragrafo('', '<w:pStyle w:val="Header"/>')}</w:hdr>`;
}

const pequeno = (t: string): string => `<w:r><w:rPr><w:sz w:val="${TAMANHO.cabecalho}"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const campo = (instr: string): string => `<w:fldSimple w:instr=" ${instr} ">${pequeno('1')}</w:fldSimple>`;
const RODAPE = `${CAB}<w:ftr ${NS}>${paragrafo(`${pequeno('Página ')}${campo('PAGE')}${pequeno(' de ')}${campo('NUMPAGES')}`, '<w:pStyle w:val="Footer"/><w:jc w:val="right"/>')}</w:ftr>`;

const rels = (itens: string[]): string => `${CAB}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${itens.join('')}</Relationships>`;
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
const relMidia = (m: Midia): string => `<Relationship Id="${m.rId}" Type="${REL}/image" Target="media/${m.nome}"/>`;

/** Monta o .docx (zip com XML escrito à mão, sem biblioteca de Word). */
export function gravarDocx(doc: Documento): Uint8Array {
  const midias = new Midias();
  const corpo = doc.blocos.map((b) => bloco(b, midias)).join('');
  const cabecalho = cabecalhoXml(doc.cabecalho, midias);
  const documento = `${CAB}<w:document ${NS}><w:body>${corpo}<w:sectPr><w:headerReference w:type="default" r:id="rId11"/><w:footerReference w:type="default" r:id="rId12"/><w:pgSz w:w="${PAGINA.largura}" w:h="${PAGINA.altura}"/><w:pgMar w:top="${MARGEM.superior}" w:right="${MARGEM.direita}" w:bottom="${MARGEM.inferior}" w:left="${MARGEM.esquerda}" w:header="${MARGEM.cabecalho}" w:footer="${MARGEM.rodape}" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const usa = (tipo: string) => midias.lista.some((m) => m.imagem.tipo === tipo);
  const tipos = `${CAB}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${usa('png') ? '<Default Extension="png" ContentType="image/png"/>' : ''}${usa('jpeg') ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : ''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`;

  const doCorpo = midias.lista.filter((m) => m.parte === 'corpo');
  const doCabecalho = midias.lista.filter((m) => m.parte === 'cabecalho');
  const arquivos: ArquivoZip[] = [
    { caminho: '[Content_Types].xml', bytes: utf8(tipos) },
    { caminho: '_rels/.rels', bytes: utf8(rels([`<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>`])) },
    { caminho: 'word/document.xml', bytes: utf8(documento) },
    { caminho: 'word/styles.xml', bytes: utf8(ESTILOS) },
    { caminho: 'word/settings.xml', bytes: utf8(SETTINGS) },
    { caminho: 'word/header1.xml', bytes: utf8(cabecalho) },
    { caminho: 'word/footer1.xml', bytes: utf8(RODAPE) },
    {
      caminho: 'word/_rels/document.xml.rels',
      bytes: utf8(rels([
        `<Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/>`,
        `<Relationship Id="rId2" Type="${REL}/settings" Target="settings.xml"/>`,
        `<Relationship Id="rId11" Type="${REL}/header" Target="header1.xml"/>`,
        `<Relationship Id="rId12" Type="${REL}/footer" Target="footer1.xml"/>`,
        ...doCorpo.map(relMidia),
      ])),
    },
  ];
  if (doCabecalho.length) arquivos.push({ caminho: 'word/_rels/header1.xml.rels', bytes: utf8(rels(doCabecalho.map(relMidia))) });
  for (const m of midias.lista) arquivos.push({ caminho: `word/media/${m.nome}`, bytes: m.imagem.bytes });
  return montarZip(arquivos);
}
