// Planilha Padrão de Entrega da Enel: acha a aba e a linha do cabeçalho (a que tem "SOB") e casa cada coluna com um
// dado da obra pelo texto do cabeçalho (desenho §6.6). Depois preenche só a linha da obra, o assunto (A1) e o texto
// curto; a macro, as validações, as outras abas e as fórmulas ficam como estavam.
import {
  abrirXlsx, gravarCelulas, gravarXlsx, imagensDaAba, lerCelulas, letraDaColuna, listaDaCelula, porImagem, separarRef, type Pasta, type Valor,
} from './xlsx';
import { ehAgua, orgaoDaArea, semAcento, type AreaProtegida, type BaseAreas } from './areas';
import type { AreaConfirmada, Caso } from './caso';
import type { Aviso, Pt, Rede, TipoRede } from './tipos';
import type { SituacaoUc } from './uc';
import type { Arvore } from './arvores';
import { metrosDaRede, type DadosObra, type Empresa, type Imagem, type Resposta, type TipoAgua } from './obra';
import { assuntoTexto, partesDoAssunto, textoCurto } from './assunto';
import {
  CAMPOS_DATA, COLUNAS_INTACTAS, EQUIVALENTES, ERRO_NAO_E_PLANILHA, GESTOR_UC, OPCAO, PREFIXOS_AREA, REGRAS_COLUNAS, SEPARADOR_LISTA,
  TEXTOS_PLANILHA as TP, type Campo,
} from '../regras/planilha';

export interface Coluna { letra: string; cabecalho: string; opcoes: string[] | null }
export interface Planilha {
  nome: string;
  revisao: string;
  pasta: Pasta;
  aba: string;
  linhaCabecalho: number;
  colunas: Coluna[];
  campos: Partial<Record<Campo, string>>; // campo -> letra da coluna
  desconhecidas: Coluna[]; // colunas que nenhuma regra reconheceu (ou que mais de uma regra quis): ficam em amarelo
}

// sem acento, maiúsculas e espaços (e quebras de linha) juntados num só
const normal = (s: string): string => semAcento(s).replace(/\s+/g, ' ').trim();

// a linha do cabeçalho fica no topo da aba; olho só as primeiras linhas
const LINHAS_DO_TOPO = 20;

const casa = (cabecalho: string, alternativa: string[]): boolean =>
  alternativa.every((t) => (t.startsWith('!') ? !cabecalho.includes(t.slice(1)) : cabecalho.includes(t)));

/** "REV 09 · 20/03/2026", "Rev.05 · 16/02/2025"; só a revisão se não houver data; vazio se o nome não disser. */
export function revisaoDoNome(nome: string): string {
  const m = /(?:^|[^A-Za-z])(rev[ .]*\d+)/i.exec(nome);
  if (!m) return '';
  const resto = nome.slice(m.index + m[0].length);
  const d = /^[\s_()-]*(\d{2})\.(\d{2})\.(\d{4})/.exec(resto);
  return d ? `${m[1]} · ${d[1]}/${d[2]}/${d[3]}` : m[1];
}

/** A opção da lista que casa com o alvo (sem acento e sem espaço repetido): igual, ou a única que começa assim. Senão null. */
export function escolherOpcao(alvo: string, opcoes: string[]): string | null {
  const a = normal(alvo);
  if (a === '') return null;
  const igual = opcoes.find((o) => normal(o) === a);
  if (igual !== undefined) return igual;
  const comeco = opcoes.filter((o) => normal(o).startsWith(a));
  const distintas = new Set(comeco.map(normal));
  return distintas.size === 1 ? comeco[0] : null;
}

/** Lê a Planilha Padrão. Erro "Esta planilha não é a Planilha Padrão de Entrega da Enel." se nenhuma aba tem a célula "SOB". */
export function lerPlanilha(bytes: Uint8Array, nome: string): Planilha {
  const pasta = abrirXlsx(bytes);
  for (const { nome: aba } of pasta.abas) {
    const celulas = lerCelulas(pasta, aba);
    let linhaCabecalho = 0;
    for (const [ref, v] of celulas) {
      const r = separarRef(ref);
      if (r && r.linha <= LINHAS_DO_TOPO && normal(v) === 'SOB' && (linhaCabecalho === 0 || r.linha < linhaCabecalho)) linhaCabecalho = r.linha;
    }
    if (linhaCabecalho === 0) continue;

    const colunas: Coluna[] = [];
    const naLinha: { col: number; texto: string }[] = [];
    for (const [ref, v] of celulas) {
      const r = separarRef(ref);
      if (r && r.linha === linhaCabecalho && v.trim() !== '') naLinha.push({ col: r.col, texto: v });
    }
    naLinha.sort((x, y) => x.col - y.col);
    for (const { col, texto } of naLinha) {
      const letra = letraDaColuna(col);
      colunas.push({ letra, cabecalho: texto.trim(), opcoes: listaDaCelula(pasta, aba, `${letra}${linhaCabecalho + 1}`) });
    }

    // nunca chuta: o campo só fica com a coluna quando ela é a única que casa e casa só com ele
    const camposDaColuna = colunas.map((c) => {
      const cab = normal(c.cabecalho);
      return REGRAS_COLUNAS.filter((r) => r.trechos.some((alt) => casa(cab, alt))).map((r) => r.campo);
    });
    const campos: Partial<Record<Campo, string>> = {};
    for (const { campo } of REGRAS_COLUNAS) {
      const quem = colunas.filter((_, i) => camposDaColuna[i].includes(campo));
      const i = colunas.indexOf(quem[0]);
      if (quem.length === 1 && camposDaColuna[i].length === 1) campos[campo] = quem[0].letra;
    }
    const usadas = new Set(Object.values(campos));
    const desconhecidas = colunas.filter((c) => {
      if (usadas.has(c.letra)) return false;
      const cab = normal(c.cabecalho);
      return !COLUNAS_INTACTAS.some((alt) => casa(cab, alt));
    });

    return { nome, revisao: revisaoDoNome(nome), pasta, aba, linhaCabecalho, colunas, campos, desconhecidas };
  }
  throw new Error(ERRO_NAO_E_PLANILHA);
}

// ---------- o que vai em cada coluna ----------

export interface EntradaPlanilha {
  os: string; caso: Caso; rede: Rede; dados: DadosObra; empresa: Empresa; uc: SituacaoUc | null;
  arvores: Arvore[]; limpeza: Pt[][]; assinatura: Imagem | null;
  base?: BaseAreas; // para o tipo de água padrão da APP (açude, lagoa ou rio) quando o projetista não escolheu
}
// número, texto (data em aaaa-mm-dd nos CAMPOS_DATA) ou, nas colunas de lista, as opções que valem todas juntas
export type Desejado = string[] | number | string;

const TIPOS: TipoRede[] = ['MT', 'BT', 'CONJ'];
const CAMPO_METROS: Record<TipoRede, Campo> = { MT: 'metrosMT', BT: 'metrosBT', CONJ: 'metrosCONJ' };
const OPCAO_APP: Record<TipoAgua, string> = { rio: OPCAO.appRio, lagoa: OPCAO.appLagoa, reservatorio: OPCAO.appReservatorio };
const AGUA_PADRAO: Record<'acude' | 'lagoa' | 'rio', TipoAgua> = { acude: 'reservatorio', lagoa: 'lagoa', rio: 'rio' };

const ehConfirmada = (a: AreaProtegida | AreaConfirmada): a is AreaConfirmada => 'largura' in a;
const resposta = (r: Resposta): string[] | undefined => (r === null ? undefined : [r]);
const texto = (s: string): string | undefined => (s.trim() === '' ? undefined : s.trim());
// lista em que um item sem certeza (null) derruba tudo: o campo fica sem valor e a tela pede a escolha no Excel
const todasOuNada = (itens: (string | null)[]): string[] | undefined =>
  itens.some((i) => i === null) ? undefined : [...new Set(itens as string[])];

// grupo da UC pela categoria do órgão: "UC (Uso Sustentável)" -> "USO SUSTENTÁVEL"
const grupoDaUc = (categoria: string): string | null => /\((.+)\)/.exec(categoria)?.[1].toUpperCase() ?? null;

type Classe = 'uc' | 'rppn' | 'indigena' | 'quilombola' | 'assentamento' | 'patrimonio' | 'dnocs' | 'outra';
function classeDaArea(a: AreaProtegida): { classe: Classe; esfera: string; grupo: string | null } {
  const o = orgaoDaArea(a);
  if (!o) return { classe: 'outra', esfera: '', grupo: null };
  const c = o.categoria;
  const classe: Classe = /^UC\b/.test(c) ? 'uc' : c === 'RPPN' ? 'rppn' : /^Terra ind/i.test(c) ? 'indigena' : c === 'Quilombola' ? 'quilombola'
    : c === 'Assentamento' ? 'assentamento' : /^Patrim/i.test(c) ? 'patrimonio' : /DNOCS/.test(c) ? 'dnocs' : 'outra';
  return { classe, esfera: o.esfera, grupo: grupoDaUc(c) };
}

// opção da lista de áreas ("NOME_ESFERA_GRUPO"); a área sem item na lista leva o nome dela, que não casa e vira amarelo
function alvoDaArea(a: AreaProtegida, comAssentamento: boolean): string {
  const { classe, esfera, grupo } = classeDaArea(a);
  if (classe === 'uc') return [a.nome, esfera.toUpperCase(), grupo].filter((s) => s).join('_');
  if (classe === 'rppn') return OPCAO.rppn;
  if (classe === 'indigena') return OPCAO.terraIndigena;
  if (classe === 'quilombola') return OPCAO.quilombola;
  if (classe === 'assentamento' && comAssentamento) return OPCAO.assentamento;
  return a.nome;
}

// gestor da área para a coluna "ÓRGÃO RESPONSÁVEL/GESTOR"; null quando o site não tem certeza
function gestorDaArea(a: AreaProtegida): string | null {
  const { classe, esfera, grupo } = classeDaArea(a);
  if (classe === 'uc') return GESTOR_UC[esfera] && grupo ? `UNIDADE DE CONSERVAÇÃO ${GESTOR_UC[esfera]} - ${grupo}` : null;
  if (classe === 'rppn') return OPCAO.gestorRppn;
  if (classe === 'indigena') return OPCAO.gestorTerraIndigena;
  if (classe === 'quilombola') return OPCAO.gestorQuilombola;
  return null;
}

// tipo de água da APP: a escolha do projetista, senão o padrão pela pasta COGERH da água; sem os dois, null
function aguaDaApp(a: AreaConfirmada, e: EntradaPlanilha): TipoAgua | null {
  if (a.aguaId === undefined) return null;
  const escolhida = e.dados.tipoAgua[a.aguaId];
  if (escolhida) return escolhida;
  const agua = e.base?.areas.find((x) => x.id === a.aguaId);
  const tipo = agua ? ehAgua(agua) : null;
  return tipo ? AGUA_PADRAO[tipo] : null;
}

const appDe = (areas: AreaConfirmada[], e: EntradaPlanilha): string[] | undefined =>
  areas.length === 0 ? [OPCAO.nao] : todasOuNada(areas.map((a) => { const t = aguaDaApp(a, e); return t ? OPCAO_APP[t] : null; }));

const PERMISSAO: Partial<Record<Classe, { area: string; orgao: string }>> = {
  dnocs: { area: OPCAO.permissaoPerimetro, orgao: OPCAO.orgaoDnocs },
  assentamento: { area: OPCAO.permissaoAssentamento, orgao: OPCAO.orgaoIncra },
  patrimonio: { area: OPCAO.permissaoPatrimonio, orgao: OPCAO.orgaoIphan },
};
// áreas que vão para as colunas de permissão (patrimônio da União), não para as de área ambiental
const DE_PERMISSAO: Classe[] = ['dnocs', 'assentamento', 'patrimonio'];

/** O que vai em cada coluna da linha da obra. Campo que falta = o site não tem certeza: a célula fica vazia e sai amarelo. */
export function valoresDesejados(e: EntradaPlanilha): Partial<Record<Campo, Desejado>> {
  const d = e.dados;
  const v: Partial<Record<Campo, Desejado>> = {};
  const por = (c: Campo, x: Desejado | undefined): void => { if (x !== undefined) v[c] = x; };

  // SOB como número, igual às planilhas aprovadas
  por('sob', /^\d+$/.test(e.os) ? Number(e.os) : e.os);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d.obra.dataSob)) v.dataSob = d.obra.dataSob;
  por('municipio', texto(d.obra.municipio || e.caso.municipio || '')?.toUpperCase());
  por('sed', texto(d.obra.sed));
  if (d.obra.zona) v.zona = [d.obra.zona];
  const metros = metrosDaRede(e.rede);
  for (const t of TIPOS) v[CAMPO_METROS[t]] = Math.round(metros[t]);

  // vegetação: poda é SIM/NÃO; supressão de árvore pode ser poda drástica ou corte, e o site não sabe qual
  v.poda = [e.arvores.some((a) => a.intervencao === 'poda') ? OPCAO.sim : OPCAO.nao];
  por('podaAnexada', resposta(d.planilha.podaAnexada));
  const temLimpeza = e.limpeza.some((l) => l.length >= 3);
  const temSupressao = e.arvores.some((a) => a.intervencao === 'supressao');
  const limpezaRev06 = { arbustiva: OPCAO.limpezaArbustiva, arborea: OPCAO.limpezaArborea, 'mista-arbustiva': OPCAO.limpezaMistaArbustiva, 'mista-arborea': OPCAO.limpezaMistaArborea };
  const limpezaRev05 = { arbustiva: OPCAO.limpezaRev05Arbustiva, arborea: OPCAO.limpezaRev05Arborea, 'mista-arbustiva': OPCAO.limpezaRev05Mista, 'mista-arborea': OPCAO.limpezaRev05Mista };
  if (!temSupressao) {
    if (!temLimpeza) v.supressao = [OPCAO.nao];
    else if (d.predominancia) v.supressao = [limpezaRev06[d.predominancia]];
  }
  if (!temLimpeza) v.limpeza = [OPCAO.nao];
  else if (d.predominancia) v.limpeza = [limpezaRev05[d.predominancia]];

  por('solicitante', texto(d.interessado.nome));
  por('regularidadeApresentou', resposta(d.planilha.regularidadeApresentou));
  por('regularidadeAnexou', resposta(d.planilha.regularidadeAnexou));

  // UC: sem UC confirmada, as colunas dela ficam para o Excel
  if (e.uc) {
    const appsUc = e.uc.dentro.filter(ehConfirmada);
    const areasUc = e.uc.dentro.filter((a): a is AreaProtegida => !ehConfirmada(a));
    por('appUc', appDe(appsUc, e));
    // quem licencia a APP é o município, se ele licencia, ou a SEMACE: o site não sabe
    if (appsUc.length === 0) v.appUcOrgao = [OPCAO.naoSeAplica];
    v.ucEmArea = [areasUc.length > 0 ? OPCAO.sim : OPCAO.nao];
    const naLista = areasUc.filter((a) => !['dnocs', 'patrimonio'].includes(classeDaArea(a).classe));
    v.areaDaUc = naLista.length === 0 ? [OPCAO.naoSeAplica] : [...new Set(naLista.map((a) => alvoDaArea(a, true)))];
  }

  const r = d.planilha.reformaAgraria;
  if (r === 'NÃO') v.reformaAgraria = [OPCAO.reformaNao];
  else if (r === 'NÃO SE APLICA') v.reformaAgraria = [OPCAO.naoSeAplica];
  // "SIM" tem duas opções (atende ou não às premissas do INCRA): fica para o Excel
  const m = resposta(d.planilha.manutencao);
  por('manutencaoUc', m);
  por('manutencaoApp', m);
  por('manutencaoArea', m);

  // rede
  const apps = e.caso.intervencoes.map((iv) => iv.area).filter(ehConfirmada);
  const areas = e.caso.intervencoes.map((iv) => iv.area).filter((a): a is AreaProtegida => !ehConfirmada(a));
  por('appRede', appDe(apps, e));
  const ambientais = areas.filter((a) => !DE_PERMISSAO.includes(classeDaArea(a).classe));
  v.areaDaRede = ambientais.length === 0 ? [OPCAO.naoSeAplica] : [...new Set(ambientais.map((a) => alvoDaArea(a, false)))];
  // sem intervenção, não se aplica; só com áreas ambientais, o gestor delas. Com APP (município ou SEMACE) ou área de
  // permissão, os kits aprovados põem o licenciador, que o site não sabe: fica para o Excel
  if (e.caso.intervencoes.length === 0) v.orgaoAreaRede = [OPCAO.naoSeAplica];
  else if (apps.length === 0 && ambientais.length === areas.length) por('orgaoAreaRede', todasOuNada(ambientais.map(gestorDaArea)));
  const permissoes = areas.map((a) => PERMISSAO[classeDaArea(a).classe]).filter((p) => p !== undefined);
  v.permissaoArea = permissoes.length === 0 ? [OPCAO.naoSeAplica] : [...new Set(permissoes.map((p) => p.area))];
  v.permissaoOrgao = permissoes.length === 0 ? [OPCAO.naoSeAplica] : [...new Set(permissoes.map((p) => p.orgao))];

  por('validador', texto(d.planilha.validador));
  por('cvtFotos', resposta(d.planilha.cvtFotos));
  por('parceira', texto(e.empresa.nome));
  return v;
}

// ---------- casar com a lista ----------

// nome da área sem o prefixo do tipo e sem "DA/DE/DO" na frente; o tipo volta à parte (áreas de tipos diferentes não casam)
function nucleoDaArea(nome: string): { tipo: string | null; nucleo: string } {
  let n = normal(nome).replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  let tipo: string | null = null;
  for (const p of PREFIXOS_AREA) {
    const forma = p.formas.find((f) => n === f || n.startsWith(`${f} `));
    if (forma) { tipo = p.tipo; n = n.slice(forma.length).trim(); break; }
  }
  n = n.replace(/^(DA|DE|DO|DAS|DOS)\s+/, '');
  return { tipo, nucleo: n };
}

// "NOME_ESFERA_GRUPO" (o nome pode ter "_" no meio; partes vazias de "__" não contam)
function partesDaArea(s: string): { nome: string; esfera: string; grupo: string | null } | null {
  const p = s.split('_').map((x) => x.trim()).filter((x) => x !== '');
  if (p.length < 2) return null;
  const esferas = ['FEDERAL', 'ESTADUAL', 'MUNICIPAL', 'PARTICULAR'];
  const iEsfera = p.findIndex((x, i) => i > 0 && esferas.includes(normal(x)));
  if (iEsfera < 0) return null;
  return { nome: p.slice(0, iEsfera).join(' '), esfera: normal(p[iEsfera]), grupo: p[iEsfera + 1] !== undefined ? normal(p[iEsfera + 1]) : null };
}

function casaArea(alvo: string, opcao: string): boolean {
  const a = partesDaArea(alvo);
  const o = partesDaArea(opcao);
  if (!a || !o || a.esfera !== o.esfera) return false;
  if (a.grupo !== null && o.grupo !== null && a.grupo !== o.grupo) return false;
  const na = nucleoDaArea(a.nome);
  const no = nucleoDaArea(o.nome);
  if (na.tipo !== null && no.tipo !== null && na.tipo !== no.tipo) return false;
  return na.nucleo !== '' && na.nucleo === no.nucleo;
}

/** A opção da lista para um alvo: a igual (sem acento e sem espaço repetido), uma forma equivalente da mesma resposta,
 *  ou a área de mesmo nome sem prefixo e mesma esfera, quando só uma casa. Nunca pelo começo do texto. Senão null. */
export function opcaoDoAlvo(campo: Campo, alvo: string, opcoes: string[]): string | null {
  const igual = (t: string): string | undefined => opcoes.find((o) => normal(o) === normal(t));
  const direta = igual(alvo);
  if (direta !== undefined) return direta;
  for (const eq of EQUIVALENTES) {
    if (!eq.campos.includes(campo) || normal(eq.alvo) !== normal(alvo)) continue;
    for (const outra of eq.outras) {
      const achada = igual(outra);
      if (achada !== undefined) return achada;
    }
  }
  const areas = [...new Set(opcoes.filter((o) => casaArea(alvo, o)).map(normal))];
  return areas.length === 1 ? opcoes.find((o) => normal(o) === areas[0])! : null;
}

// ---------- preencher ----------

const aviso = (codigo: string, texto: string, comoCorrigir: string): Aviso => ({ nivel: 'amarelo', codigo, texto, comoCorrigir });
const curto = (cabecalho: string): string => {
  const s = cabecalho.replace(/\s+/g, ' ').trim();
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
};
const troca = (modelo: string, v: Record<string, string>): string => modelo.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);
const ROTULO_ASSINATURA = 'ASSINATURA RESPONSAVEL TECNICO';
const LINHAS_DA_ASSINATURA = 3;

/** A1: as linhas de cima ficam; a linha do assunto ("SOB ...", a última) vira o assunto novo. */
function a1ComAssunto(atual: string, assunto: string): string {
  const linhas = atual.split(/\r?\n/);
  let i = -1;
  for (let k = linhas.length - 1; k >= 0; k--) if (linhas[k].trim().toUpperCase().startsWith('SOB ')) { i = k; break; }
  if (i < 0) return atual.trim() === '' ? assunto : `${atual}\n${assunto}`;
  linhas[i] = assunto;
  return linhas.join('\n');
}

/** "SOB 0000000001_" + o nome original sem o "SOB <dígitos>_" que já estiver na frente. */
export const nomeDaPlanilha = (os: string, original: string): string => `SOB ${os}_${original.replace(/^SOB\s*\d+\s*_\s*/i, '')}`;

/**
 * Preenche a linha da obra, o assunto (A1), o texto curto (linha do cabeçalho + 3) e, se houver, a assinatura nas 3 linhas
 * acima de "Assinatura Responsável Técnico". Nunca chuta: opção sem casamento deixa a célula vazia e sai amarelo.
 * `separador` = como juntar várias opções numa célula (o da macro); null = não juntar.
 */
export function preencherPlanilha(p: Planilha, e: EntradaPlanilha, separador: string | null = SEPARADOR_LISTA): { nome: string; bytes: Uint8Array; avisos: Aviso[] } {
  const avisos: Aviso[] = [];
  const desejados = valoresDesejados(e);
  const linha = p.linhaCabecalho + 1;
  const celulas: Record<string, Valor> = {};
  // juntar opções só faz sentido com a macro que entende o separador
  const junta = separador !== null && p.pasta.partes.has('xl/vbaProject.bin') ? separador : null;

  for (const { campo } of REGRAS_COLUNAS) {
    const letra = p.campos[campo];
    if (letra === undefined) continue;
    const col = p.colunas.find((c) => c.letra === letra)!;
    const ref = `${letra}${linha}`;
    const cab = curto(col.cabecalho);
    const d = desejados[campo];
    const escolher = (): void => {
      celulas[ref] = { t: 'vazio' };
      avisos.push(aviso('PLANILHA_ESCOLHER', troca(TP.colunaEscolher, { letra, cabecalho: cab, escolha: TP.escolhaNaLista }), TP.comoEscolher));
    };
    if (d === undefined) {
      if (col.opcoes) escolher();
      else {
        celulas[ref] = { t: 'vazio' };
        avisos.push(aviso('PLANILHA_SEM_VALOR', troca(TP.colunaSemValor, { letra, cabecalho: cab }), TP.comoPreencher));
      }
      continue;
    }
    if (typeof d === 'number') { celulas[ref] = { t: 'numero', v: d }; continue; }
    if (typeof d === 'string') { celulas[ref] = CAMPOS_DATA.includes(campo) ? { t: 'data', v: d } : { t: 'texto', v: d }; continue; }
    let escolhidas: string[];
    if (col.opcoes) {
      // a zona da REV 09 carrega também a lista de órgãos por engano: só valem as opções de zona
      const opcoes = campo === 'zona' ? col.opcoes.filter((o) => ['RURAL', 'URBANA'].includes(normal(o))) : col.opcoes;
      const achadas = d.map((alvo) => opcaoDoAlvo(campo, alvo, opcoes));
      if (achadas.some((a) => a === null)) { escolher(); continue; }
      escolhidas = [...new Set(achadas as string[])];
    } else escolhidas = d;
    if (escolhidas.length === 1) celulas[ref] = { t: 'texto', v: escolhidas[0] };
    else if (junta !== null) celulas[ref] = { t: 'texto', v: escolhidas.join(junta) };
    else {
      celulas[ref] = { t: 'vazio' };
      avisos.push(aviso('PLANILHA_ESCOLHER', troca(TP.colunaVariasSemSeparador, { letra, cabecalho: cab, opcoes: escolhidas.join(' + '), escolha: TP.escolhaNaLista }), TP.comoEscolher));
    }
  }

  // assunto na A1 e texto curto. UC null = não marcada no 5a: o assunto muda se ela estiver numa área, então a A1 fica
  // como estava (nunca o assunto de "UC fora") e sai o amarelo pedindo a UC
  const totais = metrosDaRede(e.rede);
  const atuais = lerCelulas(p.pasta, p.aba);
  if (e.uc === null) avisos.push(aviso('PLANILHA_ASSUNTO', TP.assuntoSemUc, TP.comoAssuntoSemUc));
  else {
    const partes = partesDoAssunto(e.caso, e.uc, totais);
    const assunto = assuntoTexto(e.os, partes);
    if (assunto === null) avisos.push(aviso('PLANILHA_ASSUNTO', partes.length === 0 ? TP.semAssunto : TP.assuntoSemModelo, TP.comoAssunto));
    else celulas.A1 = { t: 'texto', v: a1ComAssunto(atuais.get('A1') ?? '', assunto) };
  }
  celulas[`A${p.linhaCabecalho + 3}`] = { t: 'texto', v: textoCurto(e.os, e.caso, e.uc, totais) };

  if (p.desconhecidas.length > 0) {
    avisos.push(aviso('PLANILHA_COLUNA_NOVA', troca(TP.colunasDesconhecidas, { lista: p.desconhecidas.map((c) => `${c.letra} (${curto(c.cabecalho)})`).join('; ') }), TP.comoDesconhecidas));
  }

  let pasta: Pasta = gravarCelulas(p.pasta, p.aba, celulas);
  let onde: { col: number; linha: number } | null = null;
  for (const [ref, valor] of atuais) {
    const r = separarRef(ref);
    if (r && normal(valor) === ROTULO_ASSINATURA && (onde === null || r.linha < onde.linha)) onde = r;
  }
  // planilha guardada já usada: uma imagem nas linhas da assinatura é a assinatura de alguém e iria em todo arquivo.
  // O desenho não é mexido; o vermelho pede a planilha em branco, e a assinatura nova não entra por cima.
  const ocupada = onde !== null && imagensDaAba(p.pasta, p.aba)
    .some((im) => im.linhaDe <= onde!.linha - 1 && im.linhaAte >= onde!.linha - LINHAS_DA_ASSINATURA);
  if (ocupada) {
    avisos.push({ nivel: 'vermelho', codigo: 'PLANILHA_JA_ASSINADA', texto: TP.jaAssinada, comoCorrigir: TP.comoJaAssinada });
  } else if (e.assinatura) {
    if (onde && onde.linha > LINHAS_DA_ASSINATURA) {
      const col = letraDaColuna(onde.col);
      pasta = porImagem(pasta, p.aba, { de: `${col}${onde.linha - LINHAS_DA_ASSINATURA}`, ate: `${col}${onde.linha}` }, e.assinatura);
    } else avisos.push(aviso('PLANILHA_SEM_ASSINATURA', TP.semLugarAssinatura, TP.comoAssinatura));
  }
  return { nome: nomeDaPlanilha(e.os, p.nome), bytes: gravarXlsx(pasta), avisos };
}

/** O que está gravado na linha da obra, por campo (números e datas como o Excel guarda). Para a conferência. */
export function lerLinhaDaObra(p: Planilha): Partial<Record<Campo, string>> {
  const celulas = lerCelulas(p.pasta, p.aba);
  const saida: Partial<Record<Campo, string>> = {};
  for (const [campo, letra] of Object.entries(p.campos) as [Campo, string][]) {
    const v = celulas.get(`${letra}${p.linhaCabecalho + 1}`);
    if (v !== undefined) saida[campo] = v;
  }
  return saida;
}
