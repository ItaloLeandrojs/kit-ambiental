// Kit completo (desenho §6.8): reconhece os arquivos que o projetista solta, renomeia no padrão dos kits aprovados,
// monta o zip final `<OS>_PROCESSO DOCUMENTAL_<REGIONAL>.zip` e confere tudo antes de entregar (Parte 1 + §6.7 + §8.1).
// O pdf.js não entra aqui: a leitura do PDF chega pronta em `ctx.lerPdf` (src/tela/pdf.ts no navegador).
import type { Nivel } from './tipos.ts';
import type { CamadaKit } from './shp.ts';
import type { Regional } from './obra.ts';
import type { LerPdf } from './pdf-texto.ts';
import { abrirZip, montarZip, type ArquivoZip } from './zip.ts';
import { arquivosDoPacote } from './pacote.ts';
import { conferirZip, type ItemConferencia } from './conferir.ts';
import { conferirPlanilha, conferirTexto, type ContextoTexto } from './conferir-texto.ts';
import { textoDoDocx } from './docx.ts';
import { lerLinhaDaObra, lerPlanilha, nomeDaPlanilha } from './planilha.ts';
import { lerCelulas } from './xlsx.ts';
import { semAcento } from './areas.ts';
import { ERRO_NAO_E_PLANILHA } from '../regras/planilha.ts';
import { OBRIGATORIOS_KIT, TEXTOS_KIT } from '../regras/textos-memorial.ts';

export type Papel =
  | 'memorial-pdf' | 'memorial-docx' | 'art' | 'cvt' | 'cad-dwg' | 'cad-pdf' | 'planta-dwg' | 'planta-pdf'
  | 'planilha-xlsm' | 'planilha-pdf' | 'poda' | 'regularidade';
export interface ArquivoSolto { nome: string; bytes: Uint8Array; papel: Papel | null }

const nomeDoCaminho = (c: string): string => {
  const s = c.replace(/\\/g, '/');
  return s.slice(s.lastIndexOf('/') + 1);
};
const pastaDoCaminho = (c: string): string => c.slice(0, Math.max(0, c.lastIndexOf('/')));
const partes = (nome: string): { base: string; ext: string } => {
  const n = nomeDoCaminho(nome);
  const i = n.lastIndexOf('.');
  return i <= 0 ? { base: n, ext: '' } : { base: n.slice(0, i), ext: n.slice(i + 1).toLowerCase() };
};
// palavra inteira entre letras (o número colado vale: "ART123", "0000000001CAD"; "PARTE" não é ART)
const palavra = (re: string): RegExp => new RegExp(`(?<![A-Z])(?:${re})(?![A-Z])`);
const RE = {
  memorial: palavra('MEMORIAL'),
  planilha: palavra('PLANILHA'),
  art: palavra('ART'),
  cvt: palavra('CVT'),
  poda: palavra('PODAS?'),
  // os mesmos nomes que a conferência da Parte 1 aceita como documento de regularidade
  regularidade: palavra('REGULARIDADE|CCU|TITULO|ESCRITURA|CONTRATO DE CONCESS[A-Z]*'),
  planta: palavra('PLANTA|GEORREF[A-Z]*'),
  cad: palavra('CAD|PROJETO'),
};
// nome sem acento, maiúsculo, com "_", "-" e "." como espaço
const textoDoNome = (base: string): string => semAcento(base).replace(/[_.-]+/g, ' ');

/**
 * O papel de um arquivo pela extensão e por palavras do nome. A ordem importa: memorial e planilha primeiro
 * (o nome deles pode citar poda ou planta), depois ART, CVT, poda e regularidade, e por fim planta e projeto.
 * O que não se reconhece é null: a tela pergunta.
 */
export function reconhecer(nome: string): Papel | null {
  const { base, ext } = partes(nome);
  const t = textoDoNome(base);
  if (ext === 'docx') return RE.memorial.test(t) ? 'memorial-docx' : null;
  if (ext === 'xlsm') return 'planilha-xlsm';
  // .dwg só com PLANTA/GEORREF ou CAD/PROJETO no nome; sem isso a tela pergunta (§6.8), nada de chute
  if (ext === 'dwg') return RE.planta.test(t) ? 'planta-dwg' : RE.cad.test(t) ? 'cad-dwg' : null;
  if (ext !== 'pdf') return null;
  if (RE.memorial.test(t)) return 'memorial-pdf';
  if (RE.planilha.test(t)) return 'planilha-pdf';
  if (RE.art.test(t)) return 'art';
  if (RE.cvt.test(t)) return 'cvt';
  if (RE.poda.test(t)) return 'poda';
  if (RE.regularidade.test(t)) return 'regularidade';
  if (RE.planta.test(t)) return 'planta-pdf';
  if (RE.cad.test(t)) return 'cad-pdf';
  return null;
}

const EXT_PADRAO: Record<Papel, string> = {
  'memorial-pdf': 'pdf', 'memorial-docx': 'docx', art: 'pdf', cvt: 'pdf', 'cad-dwg': 'dwg', 'cad-pdf': 'pdf', 'planta-dwg': 'dwg',
  'planta-pdf': 'pdf', 'planilha-xlsm': 'xlsm', 'planilha-pdf': 'pdf', poda: 'pdf', regularidade: 'pdf',
};

/**
 * Caminho do arquivo dentro da pasta do kit, no padrão do desenho §6.8. A extensão é a do arquivo original.
 * A ART mantém o nome original (ele traz o contrato); só ganha "ART " na frente se o nome não disser ART.
 * O documento de regularidade também mantém o nome (CCU, título, escritura...), com "REGULARIDADE " na frente
 * se o nome não disser o que é, para a conferência achá-lo de novo.
 */
export function nomeNoKit(papel: Papel, os: string, original: string): string {
  const nome = nomeDoCaminho(original);
  const { base, ext: e } = partes(original);
  const ext = e || EXT_PADRAO[papel];
  const t = textoDoNome(base);
  switch (papel) {
    case 'memorial-pdf':
    case 'memorial-docx': return `MEMORIAL/${os} MEMORIAL DESCRITIVO.${ext}`;
    case 'art': return RE.art.test(t) ? nome : `ART ${nome}`;
    case 'cvt': return `${os}_CVT.${ext}`;
    case 'cad-dwg':
    case 'cad-pdf': return `${os} CAD.${ext}`;
    case 'planta-dwg':
    case 'planta-pdf': return `${os} PLANTA GEORREFERENCIADA.${ext}`;
    case 'planilha-xlsm':
    case 'planilha-pdf': return nomeDaPlanilha(os, nome);
    case 'poda': return `${os} AUTORIZAÇÃO PODA.${ext}`;
    case 'regularidade': return RE.regularidade.test(t) ? nome : `REGULARIDADE ${nome}`;
  }
}

export const pastaDoKit = (os: string, regional: Regional): string => `${os}_PROCESSO DOCUMENTAL_${regional}`;

/**
 * Zip final: a pasta do kit com KML/ e SHAPEFILE/ (sem o prefixo da OS, como nos kits aprovados) e os documentos
 * renomeados. Arquivo sem papel entra com o nome original (nada some em silêncio; a tela pergunta o papel).
 * Dois arquivos com o mesmo caminho dão erro, em vez de um sobrescrever o outro.
 */
export function montarKit(e: { os: string; regional: Regional; soltos: ArquivoSolto[]; camadas: CamadaKit[] }): { nome: string; bytes: Uint8Array } {
  const pasta = pastaDoKit(e.os, e.regional);
  const arquivos: ArquivoZip[] = arquivosDoPacote(e.os, e.camadas, { kml: `${pasta}/KML`, shp: `${pasta}/SHAPEFILE` });
  const vistos = new Set(arquivos.map((a) => a.caminho.toLowerCase()));
  for (const s of e.soltos) {
    const caminho = `${pasta}/${s.papel ? nomeNoKit(s.papel, e.os, s.nome) : nomeDoCaminho(s.nome)}`;
    if (vistos.has(caminho.toLowerCase())) throw new Error(`Nome de arquivo repetido no kit: ${caminho}`);
    vistos.add(caminho.toLowerCase());
    arquivos.push({ caminho, bytes: s.bytes });
  }
  return { nome: `${pasta}.zip`, bytes: montarZip(arquivos) };
}

const item = (nivel: Nivel, codigo: string, titulo: string, porque: string, comoCorrigir: string, arquivos: string[] = []): ItemConferencia =>
  ({ nivel, codigo, titulo, porque, comoCorrigir, arquivos });
const troca = (modelo: string, v: Record<string, string>): string => modelo.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);

// desenho §8.1: o que trava o kit
const VERMELHOS: Papel[] = ['memorial-pdf', 'art', 'cvt', 'cad-dwg', 'cad-pdf', 'planta-dwg', 'planta-pdf', 'planilha-xlsm', 'planilha-pdf'];

/**
 * Documentos obrigatórios do zip final (desenho §8.1). Falta de memorial PDF, ART, CVT, CAD (DWG e PDF), planta
 * (DWG e PDF) ou planilha (.xlsm e PDF) é vermelho, um por documento. A autorização de poda, quando há poda, e o
 * documento de regularidade, quando a UC está em área protegida, são amarelos. O KML e o SHP ficam com a Parte 1.
 */
export function conferirObrigatorios(papeis: Papel[], ctx: { temPoda: boolean; ucEmArea: boolean }): ItemConferencia[] {
  const tem = new Set(papeis);
  const itens: ItemConferencia[] = [];
  const falta = (nivel: Nivel, p: Papel): void => {
    const o = OBRIGATORIOS_KIT[p as keyof typeof OBRIGATORIOS_KIT];
    itens.push(item(nivel, 'DOCUMENTOS', troca(TEXTOS_KIT.falta, { nome: o.nome }), o.porque, o.como));
  };
  for (const p of VERMELHOS) if (!tem.has(p)) falta('vermelho', p);
  if (ctx.temPoda && !tem.has('poda')) falta('amarelo', 'poda');
  if (ctx.ucEmArea && !tem.has('regularidade')) falta('amarelo', 'regularidade');
  if (VERMELHOS.every((p) => tem.has(p))) itens.push(item('verde', 'DOCUMENTOS', TEXTOS_KIT.tudo, TEXTOS_KIT.porqueTudo, 'Nada a corrigir.'));
  return itens;
}

// papel de um arquivo do zip; dentro da pasta MEMORIAL o nome pode não dizer "memorial"
function papelNoZip(caminho: string): Papel | null {
  const p = reconhecer(caminho);
  if (p) return p;
  if (palavra('MEMORIAL').test(semAcento(pastaDoCaminho(caminho)))) {
    const m = reconhecer(`MEMORIAL ${nomeDoCaminho(caminho)}`);
    if (m === 'memorial-pdf' || m === 'memorial-docx') return m;
  }
  return null;
}

// a linha do assunto na A1: a última que começa com "SOB " (as de cima são a explicação da Enel)
function assuntoDaA1(a1: string): string | null {
  const linhas = a1.split(/\r?\n/).map((l) => l.trim());
  for (let i = linhas.length - 1; i >= 0; i--) if (linhas[i].toUpperCase().startsWith('SOB ')) return linhas[i];
  return null;
}

const mensagem = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// texto do .docx do memorial, ou o erro (o .docx que não abre, ou que não tem texto, não some sem aviso)
const lerDocx = (bytes: Uint8Array): { texto: string; erro: null } | { texto: null; erro: string } => {
  try {
    const t = textoDoDocx(bytes);
    return t.trim() === '' ? { texto: null, erro: TEXTOS_KIT.docxVazio } : { texto: t, erro: null };
  } catch (e) {
    return { texto: null, erro: mensagem(e) };
  }
};

/**
 * Conferência do zip final: a do zip espacial da Parte 1 (menos a lista de documentos dela, que aqui é a do §8.1),
 * os obrigatórios, o texto do memorial (do PDF; se o PDF não tem texto, do .docx do kit) e a linha da Planilha Padrão.
 * O assunto da planilha é só o da A1 do .xlsm do kit (é ela que vai para o órgão): `ctx.assunto` NÃO é usado para o
 * assunto, nem como reserva. Sem a linha "SOB ..." na A1, o conferirPlanilha dá o amarelo da A1 sem assunto.
 * .docx do memorial que não abre e PDF que o pdf.js não abre dão amarelos próprios, com o erro no porquê
 * (o Word é opcional no §8.1 e o PDF ilegível nunca é vermelho falso; a falta do PDF já é vermelha nos obrigatórios).
 * Vermelhos primeiro, depois amarelos, depois verdes (ordem estável dentro de cada grupo).
 */
export async function conferirKit(
  bytes: Uint8Array,
  // `assunto` fica na assinatura do plano, mas não é usado: o assunto conferido é o da A1 do kit
  ctx: ContextoTexto & { lerPdf: LerPdf; temPoda: boolean; ucEmArea: boolean; assunto: string | null },
): Promise<ItemConferencia[]> {
  let todos: ArquivoZip[];
  try {
    todos = abrirZip(bytes);
  } catch {
    return conferirZip(bytes); // o vermelho "Este arquivo não é um zip" da Parte 1
  }
  const itens = conferirZip(bytes).filter((i) => i.codigo !== 'DOCUMENTOS');
  const arquivos = todos
    .filter((a) => !/(^|\/)__MACOSX\//.test(a.caminho) && !nomeDoCaminho(a.caminho).startsWith('._'))
    .map((a) => ({ a, papel: papelNoZip(a.caminho) }));
  itens.push(...conferirObrigatorios(arquivos.flatMap((x) => (x.papel ? [x.papel] : [])), ctx));

  // ---- texto do memorial ----
  const pdf = arquivos.find((x) => x.papel === 'memorial-pdf')?.a;
  const docx = arquivos.find((x) => x.papel === 'memorial-docx')?.a;
  const dx = docx ? lerDocx(docx.bytes) : null;
  if (docx && dx!.erro !== null) {
    itens.push(item('amarelo', 'MEMORIAL_DOCX', TEXTOS_KIT.docxNaoAbre, `${TEXTOS_KIT.porqueDocxNaoAbre} (${dx!.erro})`, TEXTOS_KIT.comoDocxNaoAbre, [docx.caminho]));
  }
  let texto: string | null = null;
  if (pdf) {
    let lido: Awaited<ReturnType<LerPdf>> | null = null;
    let erroPdf: string | null = null;
    try {
      lido = await ctx.lerPdf(pdf.bytes);
    } catch (e) {
      erroPdf = mensagem(e); // PDF que o pdf.js não abre (corrompido): aviso próprio, não o do PDF escaneado
      itens.push(item('amarelo', 'MEMORIAL_TEXTO', TEXTOS_KIT.pdfNaoAbre, `${TEXTOS_KIT.porquePdfNaoAbre} (${erroPdf})`, TEXTOS_KIT.comoPdfNaoAbre, [pdf.caminho]));
    }
    if (lido?.temTexto) texto = lido.paginas.join('\n');
    else if (dx?.texto) {
      texto = dx.texto;
      itens.push(item('amarelo', 'MEMORIAL_TEXTO', TEXTOS_KIT.usouDocx, TEXTOS_KIT.porqueUsouDocx, TEXTOS_KIT.comoUsouDocx, [pdf.caminho, docx!.caminho]));
    } else if (erroPdf === null) {
      // PDF sem texto: sem .docx, pede o .docx; com o .docx que não abre, o aviso dele já saiu e este não pede de novo
      if (!docx) itens.push(item('amarelo', 'MEMORIAL_TEXTO', TEXTOS_KIT.pdfSemTexto, TEXTOS_KIT.porqueSemTexto, TEXTOS_KIT.comoSemTexto, [pdf.caminho]));
      else itens.push(item('amarelo', 'MEMORIAL_TEXTO', TEXTOS_KIT.semTextoParaConferir, TEXTOS_KIT.porqueSemTextoParaConferir, TEXTOS_KIT.comoSemTextoParaConferir, [pdf.caminho, docx.caminho]));
    }
  } else if (dx?.texto) {
    texto = dx.texto; // sem o PDF (já vermelho acima), o texto do .docx ainda é conferido
  }
  if (texto !== null) itens.push(...conferirTexto(texto, ctx));

  // ---- Planilha Padrão (.xlsm); sem ela, a falta já é vermelha e esta conferência não roda ----
  const xlsm = arquivos.find((x) => x.papel === 'planilha-xlsm')?.a;
  if (xlsm) {
    try {
      const p = lerPlanilha(xlsm.bytes, nomeDoCaminho(xlsm.caminho));
      // só a A1 do kit: sem a linha "SOB ...", null faz o conferirPlanilha dar o amarelo (nunca o ctx.assunto)
      const assunto = assuntoDaA1(lerCelulas(p.pasta, p.aba).get('A1') ?? '');
      itens.push(...conferirPlanilha(lerLinhaDaObra(p), { ...ctx, textoMemorial: texto, assunto }));
    } catch (e) {
      const naoE = e instanceof Error && e.message === ERRO_NAO_E_PLANILHA;
      itens.push(item('vermelho', 'PLANILHA', naoE ? ERRO_NAO_E_PLANILHA : TEXTOS_KIT.planilhaNaoAbre,
        naoE ? TEXTOS_KIT.porquePlanilha : `${TEXTOS_KIT.porquePlanilha} (${mensagem(e)})`, TEXTOS_KIT.comoPlanilha, [xlsm.caminho]));
    }
  }

  const ordem: Record<Nivel, number> = { vermelho: 0, amarelo: 1, verde: 2 };
  return itens.map((x, i) => ({ x, i })).sort((a, b) => ordem[a.x.nivel] - ordem[b.x.nivel] || a.i - b.i).map((e) => e.x);
}
