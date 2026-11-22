// Memorial descritivo no modelo da empresa (desenho §6.4), montado como Documento para o gravador de .docx.
// Todos os números vêm do caso da Parte 1: metros por metrosTexto, hectares por haTexto, coordenadas por coordTexto.
// Tudo que o site não preenche sai com [PREENCHER: ...] (ou [COLAR DO GOM]) e fundo amarelo.
import type { Pt, Rede, TipoRede } from './tipos.ts';
import type { Caso, Intervencao, Trecho } from './caso.ts';
import type { SituacaoUc } from './uc.ts';
import type { Arvore } from './arvores.ts';
import type { Bloco, Documento, Texto } from './docx.ts';
import { finalidadePadrao, metrosDaRede, postesNovos, type DadosObra, type Empresa, type Imagem, type Responsavel } from './obra.ts';
import { semAcento } from './areas.ts';
import { redeNova } from './rede.ts';
import { G } from './geom.ts';
import { coordTexto, haTexto, metrosTexto } from './formato.ts';
import { ehApp, numeroDoPoste, planoDeFiguras, type Figura } from './figuras.ts';
import { FAIXA } from '../regras/faixas.ts';
import { TEXTOS_MEMORIAL as T } from '../regras/textos-memorial.ts';

export interface EntradaMemorial {
  os: string; caso: Caso; rede: Rede; dados: DadosObra; empresa: Empresa; rt: Responsavel;
  uc: SituacaoUc | null; arvores: Arvore[]; limpeza: Pt[][];
  data: Date;                       // só mês e ano vão para o texto
  assinar: boolean;                 // false = há vermelho: sem imagem e com a nota de não assinado; true sem a imagem do RT = a nota que pede a imagem
  imagens: Record<number, Imagem>;  // por número da figura
}

/** Hectares de um trecho: metros inteiros × faixa do tipo ÷ 10.000 (a mesma conta do caso). */
export const haDoTrecho = (t: Trecho): number => (Math.round(t.metros) * FAIXA[t.tipo]) / 10000;

const TIPOS: TipoRede[] = ['MT', 'BT', 'CONJ'];
const NOME_TIPO: Record<TipoRede, string> = { MT: 'média tensão', BT: 'baixa tensão', CONJ: 'média e baixa tensão (conjugada)' };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const TOL_INTEIRA = 0.5; // metros: igual ao assunto, a rede dentro da área vale "inteira" a partir do total menos isto

const mesAno = (d: Date): string => `${MESES[d.getMonth()]} de ${d.getFullYear()}`;
const preencher = (rotulo: string): string => `[PREENCHER: ${rotulo}]`;
const ou = (valor: string, rotulo: string): string => valor.trim() || preencher(rotulo);
const lista = (itens: string[]): string => (itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`);
const troca = (modelo: string, v: Record<string, string>): string => modelo.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);
const m2Texto = (m2: number): string => m2.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const quantos = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;

// separa as marcas [PREENCHER: ...] e [COLAR DO GOM] num pedaço próprio, com fundo amarelo
const MARCA = /(\[(?:PREENCHER:[^\]]*|COLAR DO GOM)\])/;
function marcar(s: string, negrito = false): Texto[] {
  return s.split(MARCA).filter((x) => x !== '').map((x) => (MARCA.test(x) ? { texto: x, amarelo: true, ...(negrito ? { negrito } : {}) } : { texto: x, ...(negrito ? { negrito } : {}) }));
}
const par = (s: string): Bloco => ({ t: 'paragrafo', textos: marcar(s) });
const campo = (rotulo: string, valor: string, vazio: string): Bloco =>
  ({ t: 'paragrafo', textos: [{ texto: `${rotulo}: `, negrito: true }, ...marcar(ou(valor, vazio))] });
const secao = (texto: string): Bloco => ({ t: 'secao', texto });

const dataBr = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso.trim();
};
const soma = (m: Record<TipoRede, number>): number => TIPOS.reduce((s, t) => s + Math.round(m[t]), 0);

function fechado(anel: Pt[]): Pt[] {
  const p = anel[0], u = anel[anel.length - 1];
  return p[0] === u[0] && p[1] === u[1] ? anel : [...anel, p];
}

// Fortaleza ou área de macrozona: entram as seções da SEUMA (desenho §6.4, item 11)
function ehSeuma(e: EntradaMemorial, municipio: string): boolean {
  if (semAcento(municipio.trim()) === 'FORTALEZA') return true;
  const areas = [...e.caso.intervencoes.map((iv) => iv.area), ...e.caso.proximas.map((p) => p.area), ...(e.uc?.dentro ?? [])];
  return areas.some((a) => [a.nome, ...('pasta' in a ? a.pasta : [])].some((s) => semAcento(s).includes('MACROZONA')));
}

function figura(f: Figura, e: EntradaMemorial): Bloco {
  return { t: 'figura', numero: f.numero, legenda: f.legenda, imagem: e.imagens[f.numero] ?? null };
}

const metrosDosTrechos = (iv: Intervencao): number => iv.trechos.reduce((s, t) => s + Math.round(t.metros), 0);
const haDosTrechos = (iv: Intervencao): number => iv.trechos.reduce((s, t) => s + haDoTrecho(t), 0);

function frasesIntervencao(iv: Intervencao, totalRede: number): string[] {
  const nome = iv.area.nome;
  if (iv.trechos.length === 0) {
    const frases = iv.postesSemRede.map((x) => troca(T.posteSemRede, {
      area: nome, x: numeroDoPoste(x.poste), coord: coordTexto(x.poste.ponto), m2: m2Texto(x.m2), ha: haTexto(x.m2 / 10000),
    }));
    return [...frases, troca(T.totalSoPoste, { area: nome, ha: haTexto(iv.hectares) })];
  }
  const frases = iv.trechos.map((t) => troca(T.trecho, {
    area: nome,
    x: numeroDoPoste(t.de), coordX: coordTexto(t.de?.ponto ?? t.pts[0]),
    y: numeroDoPoste(t.ate), coordY: coordTexto(t.ate?.ponto ?? t.pts[t.pts.length - 1]),
    m: metrosTexto(t.metros), tipo: NOME_TIPO[t.tipo], ha: haTexto(haDoTrecho(t)),
  }));
  // o total da área usa a mesma regra das frases: soma dos metros inteiros e dos hectares de cada trecho
  if (totalRede > 0) frases.push(troca(T.total, { n: String(totalRede), m: String(metrosDosTrechos(iv)), ha: haTexto(haDosTrechos(iv)), area: nome }));
  return frases;
}

export function montarMemorial(e: EntradaMemorial): Documento {
  const d = e.dados;
  const municipio = d.obra.municipio.trim() || e.caso.municipio?.trim() || '';
  const munTexto = ou(municipio, 'município');
  const metros = metrosDaRede(e.rede);
  const totalRede = soma(metros);
  const figuras = planoDeFiguras(e);
  const figIntervencao = (i: number) => figuras.find((f) => f.intervencao === i);
  const b: Bloco[] = [];

  // 1. título e mês e ano
  b.push({ t: 'titulo', textos: marcar(troca(T.titulo, { interessado: d.interessado.nome.trim() ? d.interessado.nome.trim().toUpperCase() : preencher('interessado'), municipio: municipio ? municipio.toUpperCase() : preencher('município') }), true) });
  b.push({ t: 'paragrafo', textos: [{ texto: mesAno(e.data) }], centro: true });

  // 2. dados do interessado
  b.push(secao(T.secaoInteressado));
  b.push(campo('Interessado', d.interessado.nome, 'nome do interessado'));
  b.push(campo('Endereço', d.interessado.endereco, 'endereço do interessado'));
  b.push(campo('Bairro', d.interessado.bairro, 'bairro ou zona'));
  b.push(campo('CEP', d.interessado.cep, 'CEP'));
  b.push(campo('Cidade', municipio ? `${municipio}-CE` : '', 'município'));

  // 3. dados da obra
  b.push(secao(T.secaoObra));
  b.push(campo('Nº da SOB', e.os, 'número da SOB'));
  b.push(campo('Endereço da obra', d.obra.endereco, 'endereço da obra'));
  b.push(campo('Cidade', municipio ? `${municipio}-CE` : '', 'município'));
  b.push(campo('Zona', d.obra.zona === 'RURAL' ? 'Rural' : d.obra.zona === 'URBANA' ? 'Urbana' : '', 'zona rural ou urbana'));
  b.push(campo('Subestação', d.obra.sed, 'subestação'));
  b.push(campo('Alimentador', d.obra.alimentador, 'alimentador'));
  b.push(campo('C.S.I. anterior', d.obra.csi, 'C.S.I. anterior'));
  b.push(campo('Data da SOB na GOM.net', dataBr(d.obra.dataSob), 'data da SOB'));

  // 4. responsável pelo projeto
  b.push(secao(T.secaoResponsavel));
  b.push(campo('Empresa', e.empresa.nome, 'empresa'));
  b.push(campo('CNPJ', e.empresa.cnpj, 'CNPJ'));
  b.push(campo('Endereço da empresa', e.empresa.endereco, 'endereço da empresa'));
  b.push(campo('Cidade', e.empresa.municipio, 'município da empresa'));
  b.push(campo('Telefone', e.empresa.telefone, 'telefone'));
  b.push(campo('E-mail', e.empresa.email, 'e-mail da empresa'));
  b.push(campo('Responsável técnico', e.rt.nome, 'responsável técnico'));
  b.push(campo('Registro profissional', e.rt.registro, 'registro profissional'));
  b.push(campo('RNP', e.rt.rnp, 'RNP'));
  b.push(campo('E-mail do responsável', e.rt.email, 'e-mail do responsável técnico'));

  // 5. localização
  b.push(secao(T.secaoLocalizacao));
  b.push(par(troca(T.localObra, { endereco: ou(d.obra.endereco, 'endereço da obra'), municipio: munTexto })));
  if (e.uc) {
    b.push(par(troca(T.ucCoord, { coord: coordTexto(e.uc.ponto) })));
    b.push(par(e.uc.dentro.length ? troca(T.ucDentro, { areas: lista(e.uc.dentro.map((a) => a.nome)) }) : T.ucFora));
  } else b.push(par(T.ucSemCoord));
  if (e.caso.intervencoes.length === 0) b.push(par(T.redeFora));
  for (const iv of e.caso.intervencoes) {
    const area = iv.area.nome;
    if (iv.trechos.length === 0) b.push(par(troca(T.soPosteEm, { area })));
    else b.push(par(troca(metrosDosTrechos(iv) >= totalRede - TOL_INTEIRA ? T.redeInteira : T.redeParte, { area })));
  }
  for (const p of e.caso.proximas) b.push(par(troca(T.proxima, { area: p.area.nome, distancia: String(Math.round(p.distancia)) })));
  b.push(par(T.figurasLocal));
  b.push(figura(figuras[0], e), figura(figuras[1], e));

  // 6. finalidade
  b.push(secao(T.secaoFinalidade));
  b.push(par(finalidadePadrao(d) || T.finalidadeVazia));

  // 7. características: a implantar
  b.push(secao(T.secaoCaracteristicas));
  b.push({ t: 'paragrafo', textos: [{ texto: T.subImplantar, negrito: true }] });
  const caboMT = ou(d.rede.caboMT, 'cabo da MT');
  const caboBT = ou(d.rede.caboBT, 'cabo da BT');
  const trechosRede = TIPOS.filter((t) => Math.round(metros[t]) > 0).map((t) => {
    const m = metrosTexto(metros[t]);
    if (t === 'MT') return troca(T.metrosMT, { m, cabo: caboMT });
    if (t === 'BT') return troca(T.metrosBT, { m, cabo: caboBT });
    return troca(T.metrosCONJ, { m, caboMT, caboBT });
  });
  b.push(par(trechosRede.length ? troca(T.construidos, { lista: lista(trechosRede) }) : T.semExtensao));
  const tiposPoste = d.rede.postes.filter((p) => p.quantidade > 0)
    .map((p) => troca(T.posteTipo, { q: String(p.quantidade), altura: String(p.altura).replace('.', ','), daN: String(p.daN) }));
  // sem poste novo, não se escreve frase de 0 postes
  const nPostes = postesNovos(e.rede);
  if (nPostes > 0) b.push(par(troca(T.postes, { n: String(nPostes), lista: tiposPoste.length ? lista(tiposPoste) : preencher('postes por altura e daN') })));
  const numerados = e.rede.postes.filter((p) => p.novo && p.numero?.trim())
    .sort((a, c) => a.numero!.trim().localeCompare(c.numero!.trim(), 'pt-BR', { numeric: true }));
  // início e fim só existem com vão novo (obra só de poste não tem "rede" para começar e terminar)
  if (redeNova(e.rede).length > 0) {
    if (numerados.length) {
      const ini = numerados[0];
      const fim = numerados[numerados.length - 1];
      b.push(par(troca(T.inicioFim, { ini: ini.numero!.trim(), coordIni: coordTexto(ini.ponto), fim: fim.numero!.trim(), coordFim: coordTexto(fim.ponto) })));
    } else b.push(par(T.inicioFimVazio));
  }

  // vegetação, limpeza, APP e vias: o que tem e o que não tem, sempre escrito
  const podas = e.arvores.filter((a) => a.intervencao === 'poda');
  const supressoes = e.arvores.filter((a) => a.intervencao === 'supressao');
  b.push(par(troca(T.vegetacao, {
    poda: podas.length ? troca(T.comPoda, { n: quantos(podas.length, 'árvore', 'árvores') }) : T.semPoda,
    supressao: supressoes.length ? troca(T.comSupressao, { n: quantos(supressoes.length, 'árvore', 'árvores') }) : T.semSupressao,
  })));
  for (const a of e.arvores) {
    b.push(par(troca(a.intervencao === 'poda' ? T.arvorePoda : T.arvoreSupressao, {
      especie: ou(a.especie, 'espécie da árvore'), coord: a.ponto ? coordTexto(a.ponto) : preencher('coordenada da árvore'),
    })));
  }
  if (e.arvores.some((a) => semAcento(a.especie).includes('CARNAUBA'))) b.push(par(T.carnauba));
  const limpezas = e.limpeza.filter((l) => l.length >= 3);
  const m2Limpeza = limpezas.reduce((s, l) => s + G.area(G.poligono([fechado(l)])), 0);
  if (limpezas.length) {
    const pred = { arbustiva: 'arbustiva', arborea: 'arbórea', 'mista-arbustiva': 'mista, com mais arbustos', 'mista-arborea': 'mista, com mais árvores' };
    b.push(par(troca(T.comLimpeza, {
      predominancia: d.predominancia ? pred[d.predominancia] : preencher('predominância da vegetação'),
      m2: Math.round(m2Limpeza).toLocaleString('pt-BR'), ha: haTexto(m2Limpeza / 10000),
    })));
  } else b.push(par(T.semLimpeza));
  b.push(par(e.caso.intervencoes.some(ehApp) ? T.comApp : T.semApp));
  b.push(par(T.semVias));
  b.push(par(T.faixaServidao));
  b.push(par(T.alturaMinima));

  // uma frase por intervenção (e a figura dela), depois as árvores
  e.caso.intervencoes.forEach((iv, i) => {
    for (const f of frasesIntervencao(iv, totalRede)) b.push(par(f));
    const fig = figIntervencao(i);
    if (fig) b.push(figura(fig, e));
  });
  const figArvores = figuras.find((f) => f.intervencao === null && f.numero > 2);
  if (figArvores) b.push(figura(figArvores, e));

  // 8. a retirar
  b.push(secao(T.secaoRetirar));
  if (d.retirada.nenhuma) b.push(par(T.semRetirada));
  else {
    const itens = TIPOS.filter((t) => (d.retirada.metros[t] ?? 0) > 0)
      .map((t) => `${metrosTexto(d.retirada.metros[t]!)} metros de rede de ${NOME_TIPO[t]}`);
    if (d.retirada.postes > 0) itens.push(quantos(d.retirada.postes, 'poste', 'postes'));
    b.push(par(itens.length ? troca(T.retirados, { lista: lista(itens) }) : T.retiradaVazia));
  }

  // 9. extensão total (só rede aérea)
  b.push(secao(T.secaoExtensao));
  b.push(par(T.extensaoNota));
  const linhaExt = (nome: string, m: number): Texto[][] => [[{ texto: nome }], [{ texto: String(m) }]];
  b.push({
    t: 'tabela', cabecalho: ['Tipo de rede', 'Extensão (metros)'],
    linhas: [
      linhaExt('Média tensão', Math.round(metros.MT)), linhaExt('Conjugada', Math.round(metros.CONJ)),
      linhaExt('Baixa tensão', Math.round(metros.BT)), linhaExt('Total', totalRede),
    ],
  });

  // 10. relação de materiais: 4 tabelas para colar do GOM
  b.push(secao(T.secaoMateriais));
  b.push({ t: 'paragrafo', textos: [{ texto: T.materiaisNota, amarelo: true }] });
  for (const titulo of ['Estruturas a implantar', 'Materiais a implantar', 'Estruturas a retirar', 'Materiais a retirar']) {
    b.push({ t: 'paragrafo', textos: [{ texto: titulo, negrito: true }] });
    b.push({ t: 'tabela', cabecalho: ['Código', 'Descrição', 'Quantidade'], linhas: [[[{ texto: T.colarGom, amarelo: true }], [], []]] });
  }

  // 11. Fortaleza (SEUMA)
  if (ehSeuma(e, municipio)) {
    b.push(secao(T.secaoMetodo), par(T.metodo));
    b.push(secao(T.secaoVidaUtil), par(T.vidaUtil));
    b.push(secao(T.secaoCronograma));
    b.push({ t: 'tabela', cabecalho: ['Etapa', 'Prazo', 'Valor (R$)'], linhas: [[[{ texto: T.cronogramaVazio, amarelo: true }], [], []]] });
  }

  // fecho e assinatura
  b.push({ t: 'paragrafo', textos: marcar(troca(T.localData, { municipio: ou(e.empresa.municipio, 'município da empresa'), mesAno: mesAno(e.data) })), centro: true });
  const imagem = e.assinar ? e.rt.assinatura : null;
  b.push({
    t: 'assinatura', nome: ou(e.rt.nome, 'responsável técnico'), registro: `Registro profissional: ${ou(e.rt.registro, 'registro profissional')}`,
    rnp: `RNP: ${ou(e.rt.rnp, 'RNP')}`, imagem, nota: imagem ? null : e.assinar ? T.semAssinatura : T.naoAssinado,
  });

  return { cabecalho: { linhas: [e.empresa.nome.trim(), T.cabecalhoEnel].filter((x) => x !== ''), logo: e.empresa.logo }, blocos: b };
}
