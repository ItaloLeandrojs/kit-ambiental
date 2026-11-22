// Planilha inventada no estilo da Planilha Padrão de Entrega (cabeçalhos escritos à mão, nada copiado da Enel).
import { montarZip } from '../../src/nucleo/zip';

const enc = new TextEncoder();
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// letra da coluna a partir do número (1 = A)
const letra = (n: number): string => {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

export const NOME_ABA = 'Aba Inventada';
export const A1_INVENTADA = 'Obs:\nUse este padrão no assunto do e-mail\nSOB XXXXXXXXXX_PROCESSO DOCUMENTAL_REDE EM APP';
export const OPCOES_APP = ['NÃO', 'SIM (RIO/RIACHO)', 'SIM (LAGOS/LAGOAS NATURAIS)', 'NÃO SE APLICA'];

// Cabeçalhos inventados: cada um tem o trecho que o site procura, com o resto do texto diferente do da Enel.
export const CABECALHOS = [
  'SOB',
  'MUNICÍPIO',
  'EXTENSÃO DE REDE BT (METRO)',
  'EXTENSÃO DE REDE MT/BT CONJUGADA (METRO)', // antes da MT de propósito: "EXTENSÃO DE REDE MT" também está aqui
  'EXTENSÃO DE REDE MT (METRO)',
  'PODA SIMPLES?',
  'SUPRESSÃO DE VEGETAÇÃO = PODA FORTE OU CORTE?',
  'ÁREA DE PRESERVAÇÃO PERMANENTE - APP?   (REDE OU PARTE DA REDE) - LEI INVENTADA',
  'ZONA',
  'NOME EMPRESA PARCEIRA',
  'DATA ENTREGA PROCESSO DOCUMENTAL VIA E-MAIL',
];

interface Celula { ref: string; xml: string }

export const NOME_OUTRA_ABA = 'Modelos Inventados';

function montar(abaXml: string, compartilhadas: string[], comExtras: boolean, outraAba = false, desenhoExtra = ''): Uint8Array {
  const sst =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${compartilhadas.length}" uniqueCount="${compartilhadas.length}">` +
    compartilhadas.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('') +
    '</sst>';
  const arquivos = [
    { caminho: '[Content_Types].xml', bytes: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>') },
    { caminho: '_rels/.rels', bytes: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { caminho: 'xl/workbook.xml', bytes: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(NOME_ABA)}" sheetId="3" r:id="rId1"/>${outraAba ? `<sheet name="${esc(NOME_OUTRA_ABA)}" sheetId="4" r:id="rId3"/>` : ''}</sheets>${comExtras ? '<definedNames><definedName name="ListaZona">\'Aba Inventada\'!$AB$10:$AB$11</definedName></definedNames>' : ''}</workbook>`) },
    { caminho: 'xl/_rels/workbook.xml.rels', bytes: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId9" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/>' + (outraAba ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' : '') + '</Relationships>') },
    { caminho: 'xl/worksheets/sheet1.xml', bytes: enc.encode(abaXml) },
    { caminho: 'xl/worksheets/_rels/sheet1.xml.rels', bytes: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>') },
    { caminho: 'xl/sharedStrings.xml', bytes: enc.encode(sst) },
    { caminho: 'xl/drawings/drawing1.xml', bytes: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>15</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="900000" cy="300000"/><xdr:clientData/></xdr:oneCellAnchor>' + desenhoExtra + '</xdr:wsDr>') },
    ...(outraAba
      ? [{ caminho: 'xl/worksheets/sheet2.xml', bytes: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>SOB XXXXXXXXXX_PROCESSO DOCUMENTAL_REDE EM APP</t></is></c></row></sheetData></worksheet>') }]
      : []),
    // macro inventada: só bytes, o site nunca lê
    { caminho: 'xl/vbaProject.bin', bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]) },
  ];
  return montarZip(arquivos);
}

function abaXml(linhas: Map<number, Celula[]>, validacoes: string): string {
  const rows = [...linhas.keys()].sort((a, b) => a - b).map((r) => `<row r="${r}">${linhas.get(r)!.map((c) => c.xml).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${rows}</sheetData>${validacoes}<drawing r:id="rId1"/></worksheet>`;
}

class Montador {
  linhas = new Map<number, Celula[]>();
  compartilhadas: string[] = [];
  private por(r: number, c: Celula): void {
    if (!this.linhas.has(r)) this.linhas.set(r, []);
    this.linhas.get(r)!.push(c);
  }
  texto(col: number, linha: number, s: string): void {
    let i = this.compartilhadas.indexOf(s);
    if (i < 0) i = this.compartilhadas.push(s) - 1;
    const ref = letra(col) + linha;
    this.por(linha, { ref, xml: `<c r="${ref}" t="s"><v>${i}</v></c>` });
  }
  inline(col: number, linha: number, s: string): void {
    const ref = letra(col) + linha;
    this.por(linha, { ref, xml: `<c r="${ref}" t="inlineStr"><is><t>${esc(s)}</t></is></c>` });
  }
  numero(col: number, linha: number, n: number): void {
    const ref = letra(col) + linha;
    this.por(linha, { ref, xml: `<c r="${ref}"><v>${n}</v></c>` });
  }
  formula(col: number, linha: number, f: string, v: number): void {
    const ref = letra(col) + linha;
    this.por(linha, { ref, xml: `<c r="${ref}"><f ca="1">${esc(f)}</f><v>${v}</v></c>` });
  }
}

/** Uma .xlsm mínima no formato da Planilha Padrão, com o cabeçalho na linha 3 (Rev.05) ou 4 (Rev.06 em diante). */
// Imagem inventada já ancorada nas linhas acima do rótulo da assinatura (como numa planilha guardada já usada).
const imagemAntiga = (linhaRotulo: number): string =>
  `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${linhaRotulo - 7}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
  `<xdr:to><xdr:col>4</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${linhaRotulo - 2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
  '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Imagem 1"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/></xdr:blipFill><xdr:spPr/></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>';

export function planilhaInventada(opcoes: { linhaCabecalho: 3 | 4; colunasExtras?: string[]; outraAba?: boolean; assinaturaAntiga?: boolean }): Uint8Array {
  const h = opcoes.linhaCabecalho;
  const d = h + 1; // linha da obra
  const m = new Montador();
  m.texto(1, 1, A1_INVENTADA);
  m.inline(1, 2, 'PLANILHA INVENTADA PARA TESTE');
  const cabecalhos = [...CABECALHOS, ...(opcoes.colunasExtras ?? [])];
  cabecalhos.forEach((c, i) => m.texto(i + 1, h, c));
  // linha da obra: SOB como número, data com =TODAY()
  m.numero(1, d, 1);
  m.formula(CABECALHOS.length, d, 'TODAY()', 46000);
  // listas no canto da própria aba (como a Enel faz), a partir da linha 10
  OPCOES_APP.forEach((o, i) => m.texto(26, 10 + i, o)); // Z10:Z13
  m.texto(27, 10, 'SIM'); // AA10:AA11
  m.texto(27, 11, 'NÃO');
  m.texto(28, 10, 'RURAL'); // AB10:AB11
  m.texto(28, 11, 'URBANA');
  m.texto(1, h + 12, 'Assinatura Responsável Técnico');
  const col = (titulo: string): string => letra(CABECALHOS.indexOf(titulo) + 1) + d;
  const validacoes =
    '<dataValidations count="5">' +
    `<dataValidation type="list" allowBlank="1" sqref="${col('PODA SIMPLES?')} ${col('SUPRESSÃO DE VEGETAÇÃO = PODA FORTE OU CORTE?')}"><formula1>$AA$10:$AA$11</formula1></dataValidation>` +
    `<dataValidation type="list" allowBlank="1" sqref="${col(CABECALHOS[7])}"><formula1>'${NOME_ABA}'!$Z$10:$Z$13</formula1></dataValidation>` +
    // duas validações na mesma célula (a REV 09 tem isso): as opções se juntam
    `<dataValidation type="list" allowBlank="1" sqref="${col('ZONA')}"><formula1>ListaZona</formula1></dataValidation>` +
    `<dataValidation type="list" allowBlank="1" sqref="${col('ZONA')}"><formula1>"URBANA,MISTA"</formula1></dataValidation>` +
    // lista em outra pasta do Excel: não dá para ler
    `<dataValidation type="list" allowBlank="1" sqref="${col('NOME EMPRESA PARCEIRA')}"><formula1>[1]Lista!$A$1:$A$3</formula1></dataValidation>` +
    '</dataValidations>';
  return montar(abaXml(m.linhas, validacoes), m.compartilhadas, true, opcoes.outraAba ?? false, opcoes.assinaturaAntiga ? imagemAntiga(h + 12) : '');
}

/** Uma .xlsx qualquer, sem a célula "SOB": não é a Planilha Padrão. */
export function planilhaSemSob(): Uint8Array {
  const m = new Montador();
  m.texto(1, 1, 'LISTA DE COMPRAS');
  m.texto(1, 2, 'ITEM');
  m.texto(2, 2, 'QUANTIDADE');
  m.numero(2, 3, 3);
  return montar(abaXml(m.linhas, ''), m.compartilhadas, false);
}
