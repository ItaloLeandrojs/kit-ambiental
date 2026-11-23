// Conferência do texto do memorial (desenho §6.7 e §8.1): lê o texto do PDF (ou do .docx) e confere contra o caso.
// Trabalha sobre normalizar(texto), sem acento e em minúsculas para procurar, e guarda o original para citar na tela.
// Nunca vermelho falso: o que não dá para ler com segurança sai amarelo, nunca verde e nunca vermelho.
// Textos de tela desta conferência: provisório: texto a confirmar com o Italo
// (menos o aviso dos passos 1 a 5, copiado do desenho §8.1).
import type { Nivel, Pt, Rede, TipoRede } from './tipos.ts';
import type { Caso } from './caso.ts';
import type { Arvore } from './arvores.ts';
import type { Responsavel } from './obra.ts';
import type { ItemConferencia } from './conferir.ts';
import type { SituacaoUc } from './uc.ts';
import type { Campo } from '../regras/planilha.ts';
import { metrosDaRede } from './obra.ts';
import { assuntoTexto, partesDoAssunto, type ParteAssunto } from './assunto.ts';
import { ROTULO_ASSUNTO } from '../regras/assunto.ts';
import { normalizar } from './pdf-texto.ts';
import { coordTexto, haTexto } from './formato.ts';
import { ehApp } from './figuras.ts';
import { FAIXA } from '../regras/faixas.ts';
import { ERROS_COMUNS } from '../regras/erros-comuns.ts';

export interface ContextoTexto {
  os: string;
  caso: Caso | null;                 // null = zip feito fora do site sem os passos 1 a 5 (§8.1)
  rede: Rede | null;
  nomesDaBase: string[];             // nomes das áreas do KMZ, para "área no texto que a rede não cruza"
  arvores: Arvore[]; limpeza: Pt[][];
  municipioKmz: string | null;
  rt: Responsavel | null;
  metrosZip: Partial<Record<TipoRede, number>> | null; // metros do KML/SHP do zip, quando houver
  cepVazio?: boolean;
  uc?: SituacaoUc | null;            // para o assunto da planilha: null = sem UC; undefined = o site não sabe onde está a UC
}
// metros NaN: trecho de intervenção com hectare, mas sem metros legíveis (sai amarelo TRECHO_ILEGIVEL)
export interface TrechoLido { metros: number; tipo: TipoRede | null; ha: number | null; frase: string }

const TOL_HA = 0.00005; // ha: |ha − metros × faixa ÷ 10.000| até isto confere
const TOL_COORD = 5; // m: coordenada do texto igual à do caso até aqui
const TOL_ARVORE = 20; // m: acima disso, a coordenada do texto não é desta árvore
// decisão do Italo (20/11): metros diferentes do caso até max(2 m, 3%) saem amarelo (o KML e o CAD diferem um pouco)
const folgaMetros = (esperado: number): number => Math.max(2, 0.03 * esperado);
// provisório: texto a confirmar com o Italo
const TEXTO_FOLGA = 'O KML e o CAD costumam diferir um pouco.';
const TIPOS: TipoRede[] = ['MT', 'BT', 'CONJ'];
const NOME_TIPO: Record<TipoRede, string> = { MT: 'média tensão', BT: 'baixa tensão', CONJ: 'conjugada' };
const AVISO_PASSOS = 'Para conferir as áreas e o órgão, faça os passos 1 a 5 com o KML da rede deste zip.'; // desenho §8.1

// Uma frase do texto: o original (para citar) e a versão de busca, sem acento e minúscula, com o mesmo comprimento.
interface Frase { o: string; b: string }

/** Sem acento e em minúsculas, letra por letra, sem mudar o comprimento (as posições valem no original). */
function paraBusca(s: string): string {
  let r = '';
  for (let i = 0; i < s.length; i++) {
    const x = s[i].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    r += x.length === 1 ? x : x.length === 0 ? ' ' : x[0];
  }
  return r;
}
const nomeBusca = (s: string): string => paraBusca(s.normalize('NFC')).replace(/\s+/g, ' ').trim();

// Frases: corta depois de ".", "!" ou "?" seguido de espaço e maiúscula (o "." de "1.036" e de "13.8kV" não corta),
// e antes de "Figura N:" (a legenda não termina com ponto e grudaria na frase seguinte).
// A linha da legenda ("Figura N: ...") também termina a frase: sem ponto, ela grudaria na frase seguinte, e uma
// intervenção de outra área passaria a "citar" a área da legenda (o TOTAL somaria trechos das duas).
function frasesDe(texto: string): Frase[] {
  const n = normalizar(texto.normalize('NFC').replace(/^([ \t]*Figura \d+\s*:[^\n]*?[^.!?\s])[ \t]*$/gm, '$1.'));
  return n.split(/(?<=[.!?])\s+(?=[\p{Lu}(["“])|\s+(?=Figura \d+\s*:)/u).filter((o) => o.trim() !== '').map((o) => ({ o, b: paraBusca(o) }));
}

const corta = (s: string, max = 180): string => (s.length <= max ? s : `${s.slice(0, max - 3).trimEnd()}...`);
const aspas = (s: string): string => `"${corta(s.trim())}"`;
// trecho do original em volta de uma posição da busca
const recorte = (f: Frase, ini: number, fim: number, folga = 40): string => aspas(f.o.slice(Math.max(0, ini - folga), Math.min(f.o.length, fim + folga)));

// "1.036" = 1036; "308,5" = 308,5
const numeroBr = (inteiro: string, fracao?: string): number => Number(`${inteiro.replace(/\./g, '')}${fracao ? `.${fracao}` : ''}`);
// hectare: vírgula ou ponto decimal ("0,1848", "0.1848")
const numeroHa = (s: string): number => Number(s.replace(',', '.'));

const RE_METROS = /(?<![\d.,])(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\s*metros?\b/g;
const RE_HA = /(?<![\d.,])(\d+[.,]\d+)\s*(?:hectares?|ha)\b/g;
const TEM_HA = /(?<![\d.,])\d+[.,]\d+\s*(?:hectares?|ha)\b/;
const RE_COORD =/\(\s*(\d{6,7})\s*,\s*(\d{7})\s*\)/g;
const RE_INTERVENCAO = /interven|entre (?:o|os) postes?\b/;
const RE_FRASE_TOTAL = /\bao todo\b|possui [\d.]+ metros de extensao/;

interface Token { ini: number; fim: number; valor: number; total?: boolean }
const tokens = (b: string, re: RegExp, valor: (m: RegExpExecArray) => number): Token[] =>
  [...b.matchAll(re)].map((m) => ({ ini: m.index!, fim: m.index! + m[0].length, valor: valor(m as RegExpExecArray) }));

/** Tipo da rede pela expressão perto dos metros: "conjugada" ganha de "média" e de "baixa". */
function tipoDe(seg: string): TipoRede | null {
  if (/conjugad/.test(seg) || /media e baixa tensao|\bmt\s*\/\s*bt\b|\bbt\s*\/\s*mt\b/.test(seg)) return 'CONJ';
  const mt = seg.search(/media tensao|\bmt\b/);
  const bt = seg.search(/baixa tensao|\bbt\b/);
  if (mt < 0 && bt < 0) return null;
  if (bt < 0) return 'MT';
  if (mt < 0) return 'BT';
  return mt < bt ? 'MT' : 'BT';
}

interface TrechoInterno extends TrechoLido { f: number; ini: number; fim: number }

function trechosDasFrases(fs: Frase[]): { trechos: TrechoInterno[]; totaisDaFrase: { f: number; ha: Token }[] } {
  const trechos: TrechoInterno[] = [];
  const totaisDaFrase: { f: number; ha: Token }[] = [];
  fs.forEach((f, fi) => {
    if (RE_FRASE_TOTAL.test(f.b)) return; // o total da área é conferido à parte
    const ms = tokens(f.b, RE_METROS, (m) => numeroBr(m[1], m[2]));
    const has = tokens(f.b, RE_HA, (m) => numeroHa(m[1])).map((h) => ({ ...h, total: /total/.test(f.b.slice(Math.max(0, h.ini - 30), h.ini)) }));
    const ehIntervencao = RE_INTERVENCAO.test(f.b);
    const usados = new Set<Token>();
    if (ehIntervencao || has.some((h) => !h.total)) {
      ms.forEach((m, i) => {
        const fimSeg = i + 1 < ms.length ? ms[i + 1].ini : f.b.length;
        const ha = has.find((h) => !h.total && h.ini >= m.fim && h.ini < fimSeg) ?? null;
        const seg = f.b.slice(m.ini, fimSeg);
        // metros sem hectare só contam como trecho numa frase de intervenção e quando falam da rede ("308 metros da rede"),
        // para a altura ("6 metros onde possa haver trânsito") e o vão não virarem trecho
        if (!ha && (!ehIntervencao || !/\bredes?\b/.test(seg))) return;
        if (ha) usados.add(ha);
        trechos.push({ metros: m.valor, tipo: tipoDe(seg), ha: ha ? ha.valor : null, frase: f.o.trim(), f: fi, ini: m.ini, fim: ha ? ha.fim : m.fim });
      });
    }
    // numa frase de intervenção, hectare de trecho que nenhum metros usou ("308 m etros ... (0,0924 ha)"), antes ou entre
    // trechos legíveis, vira trecho ilegível: não some sem aviso (e o total da área não sai vermelho falso).
    // Hectare de m² ("2,856 m² (0,0002856 ha)") não conta.
    if (ehIntervencao) {
      for (const h of has) {
        if (h.total || usados.has(h) || /m[²2]\s*\(?\s*$/.test(f.b.slice(Math.max(0, h.ini - 15), h.ini))) continue;
        trechos.push({ metros: NaN, tipo: tipoDe(f.b.slice(Math.max(0, h.ini - 60), h.ini)), ha: null, frase: f.o.trim(), f: fi, ini: Math.max(0, h.ini - 60), fim: h.fim });
      }
    }
    for (const h of has) if (h.total) totaisDaFrase.push({ f: fi, ha: h });
  });
  return { trechos, totaisDaFrase };
}

/** Trechos de intervenção lidos do texto: metros, tipo da rede e hectares (null quando não dá para ler). */
export function lerTrechos(texto: string): TrechoLido[] {
  return trechosDasFrases(frasesDe(texto)).trechos.map(({ metros, tipo, ha, frase }) => ({ metros, tipo, ha, frase }));
}

const haEsperado = (metros: number, tipo: TipoRede): number => (Math.round(metros) * FAIXA[tipo]) / 10000;
const confereHa = (t: TrechoLido & { tipo: TipoRede; ha: number }): boolean =>
  Math.abs(t.ha - haEsperado(t.metros, t.tipo)) <= TOL_HA || Math.abs(t.ha - (t.metros * FAIXA[t.tipo]) / 10000) <= TOL_HA;
const somaHa = (xs: number[]): number => xs.reduce((s, x) => s + x, 0);
const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const numeroPoste = (s: string | null): string => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^p(?=\d)/, '').replace(/^0+(?=\d)/, '');
const temNome = (b: string, nome: string): boolean => {
  const n = nomeBusca(nome);
  if (n.length < 3) return false;
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\d])${esc}(?![\\p{L}\\d])`, 'u').test(b.replace(/\s+/g, ' '));
};

// negação colada ao assunto: "não haverá [a/nenhuma] poda", "não será necessária limpeza", "sem poda",
// ou na mesma lista de assuntos negados ("não será necessário poda, supressão vegetal e nem limpeza de faixa").
// Um "não" de outro assunto na mesma frase ("não haverá supressão e haverá poda") não vale.
const ASSUNTO = '(?:podas?(?: simples)?|supressao(?: vegetal)?(?: de arvores?)?|limpeza(?: de faixa)?(?: de servidao)?|abertura de (?:novas? )?(?:vias|acessos|caminhos)(?: e caminhos)?|intervencao em app)';
// verbos: "não haverá", "não será/serão necessária(s)/realizada(s)/feita(s)", "não está/estão prevista(s)"...;
// ligação até o assunto: "a", "nenhuma", "qualquer", "necessidade de", "realização de"...
const NEGACAO = '(?:\\bnao (?:havera|serao? (?:necessari[ao]s?|realizad[ao]s?|feit[ao]s?|previst[ao]s?)|estao? previst[ao]s?|irao|ira|ocorrera|tera|existira)'
  + '(?: (?:a|o|as|os|uma|um|realizar|realizacao de|nenhuma?|qualquer|necessidade de|interferir em|intervir em|intervencao em|interferencia em|areas? de))*'
  + '|\\bsem(?: a| nenhuma?| qualquer)?|\\bnem(?: a)?)\\s+'
  + `(?:${ASSUNTO}(?:,| e nem| nem| ou| e)\\s+)*`;
// afirmação colada ao assunto, sem "não" logo antes do verbo: "haverá poda", "será feita poda", "será realizada uma poda",
// "será necessário realizar podas"
const AFIRMACAO = '(?<!\\bnao )\\b(?:havera|serao? (?:necessari[ao]s?(?: (?:a )?realizacao de| realizar)?|realizad[ao]s?|feit[ao]s?))(?: (?:a|o|as|os|uma|um))?\\s+';

const item = (nivel: Nivel, codigo: string, titulo: string, porque: string, comoCorrigir: string): ItemConferencia =>
  ({ nivel, codigo, titulo, porque, comoCorrigir, arquivos: [] });
const verde = (codigo: string, titulo: string, porque: string): ItemConferencia => item('verde', codigo, titulo, porque, 'Nada a corrigir.');

/** Confere o texto do memorial. Vermelhos primeiro, depois amarelos, depois verdes. */
export function conferirTexto(texto: string, ctx: ContextoTexto): ItemConferencia[] {
  const fs = frasesDe(texto);
  const B = fs.map((f) => f.b).join(' ');
  const itens: ItemConferencia[] = [];
  const { trechos, totaisDaFrase } = trechosDasFrases(fs);
  const caso = ctx.caso;

  if (!caso) itens.push(item('amarelo', 'SEM_CASO', 'Áreas e órgão não conferidos', AVISO_PASSOS, AVISO_PASSOS));

  // ---- HA_TRECHO: hectares de cada trecho = metros × faixa ÷ 10.000 ----
  let haRuins = 0;
  let ilegiveis = 0;
  for (const t of trechos) {
    const cita = recorte(fs[t.f], t.ini, t.fim, 30);
    if (t.ha === null || t.tipo === null) {
      ilegiveis++;
      const semMetros = Number.isNaN(t.metros);
      const falta = semMetros ? 'os metros' : t.ha === null ? 'os hectares' : 'o tipo da rede (média, baixa ou conjugada)';
      const titulo = semMetros ? 'Trecho sem metros legíveis' : `Trecho de ${t.metros} metros sem ${t.ha === null ? 'hectares legíveis' : 'tipo de rede legível'}`;
      itens.push(item('amarelo', 'TRECHO_ILEGIVEL', titulo,
        `Não deu para ler ${falta} no trecho ${cita}, então os hectares dele não foram conferidos.`,
        `Confira à mão no trecho ${cita}: hectares = metros × faixa (6 m na média tensão e na conjugada, 3 m na baixa) ÷ 10.000.`));
      continue;
    }
    if (!confereHa(t as TrechoLido & { tipo: TipoRede; ha: number })) {
      haRuins++;
      const certo = haTexto(haEsperado(t.metros, t.tipo));
      itens.push(item('vermelho', 'HA_TRECHO', `Hectares errados num trecho de ${Math.round(t.metros)} metros de ${NOME_TIPO[t.tipo]}`,
        `O trecho ${cita} diz ${haTexto(t.ha)} ha, mas ${Math.round(t.metros)} metros × ${FAIXA[t.tipo]} m de faixa ÷ 10.000 dá ${certo} ha. O órgão refaz a conta e devolve.`,
        `No trecho ${cita}, troque ${haTexto(t.ha)} ha por ${certo} ha.`));
    }
  }
  if (trechos.length > 0 && haRuins === 0 && ilegiveis === 0) itens.push(verde('HA_TRECHO', 'Hectares dos trechos conferem', `Os ${trechos.length} trechos têm hectares = metros × faixa ÷ 10.000.`));

  // ---- TOTAL: total da área = soma dos trechos dela ----
  let totaisRuins = 0;
  let totaisOk = 0;
  const RE_TOTAL_AREA = /possui ([\d.]+) metros de extensao; destes, ([\d.]+) metros \((\d+[.,]\d+) ?(?:hectares?|ha)\) estao inseridos em ([^.]+?)\s*(?:\.|$)/;
  fs.forEach((f, fi) => {
    const m = RE_TOTAL_AREA.exec(f.b);
    if (!m) return;
    const nomeArea = m[4].trim();
    const doTotal = trechos.filter((t) => t.f !== fi && temNome(fs[t.f].b, nomeArea));
    const cita = aspas(f.o);
    if (doTotal.length === 0 || doTotal.some((t) => t.ha === null)) {
      itens.push(item('amarelo', 'TOTAL', 'Total da área não conferido',
        `Não deu para ler os trechos que somam o total ${cita}.`, `Confira à mão: o total tem que ser a soma dos metros e dos hectares dos trechos da área.`));
      return;
    }
    const mTotal = numeroBr(m[2]);
    const haTotal = numeroHa(m[3]);
    const mSoma = doTotal.reduce((s, t) => s + Math.round(t.metros), 0);
    const haSoma = somaHa(doTotal.map((t) => t.ha!));
    if (mTotal !== mSoma || Math.abs(haTotal - haSoma) > TOL_HA) {
      totaisRuins++;
      itens.push(item('vermelho', 'TOTAL', 'O total da área não fecha com a soma dos trechos',
        `O texto diz ${cita}, mas os ${doTotal.length} trechos da área somam ${mSoma} metros e ${haTexto(haSoma)} ha.`,
        `No total ${cita}, escreva ${mSoma} metros (${haTexto(haSoma)} ha), a soma dos trechos.`));
    } else totaisOk++;
  });
  for (const { f, ha } of totaisDaFrase) {
    const daFrase = trechos.filter((t) => t.f === f);
    const cita = recorte(fs[f], ha.ini, ha.fim);
    if (daFrase.some((t) => t.ha === null)) continue; // o trecho ilegível já saiu amarelo
    const haSoma = somaHa(daFrase.map((t) => t.ha!));
    if (Math.abs(ha.valor - haSoma) > TOL_HA) {
      totaisRuins++;
      itens.push(item('vermelho', 'TOTAL', 'A área total não fecha com a soma dos trechos',
        `O texto diz ${cita}, mas os trechos da mesma frase somam ${haTexto(haSoma)} ha.`, `Troque ${haTexto(ha.valor)} ha por ${haTexto(haSoma)} ha.`));
    } else totaisOk++;
  }
  if (totaisOk > 0 && totaisRuins === 0) itens.push(verde('TOTAL', 'Totais fecham com os trechos', 'O total de cada área é a soma dos trechos dela.'));

  // ---- METROS: metros por tipo iguais aos do caso (ou aos do KML/SHP do zip, sem caso) ----
  const esperado: Record<TipoRede, number> | null = caso && ctx.rede
    ? (() => { const m = metrosDaRede(ctx.rede!); return { MT: Math.round(m.MT), BT: Math.round(m.BT), CONJ: Math.round(m.CONJ) }; })()
    : ctx.metrosZip ? { MT: Math.round(ctx.metrosZip.MT ?? 0), BT: Math.round(ctx.metrosZip.BT ?? 0), CONJ: Math.round(ctx.metrosZip.CONJ ?? 0) } : null;
  if (esperado) {
    const de = caso ? 'do caso' : 'do KML/SHP do zip';
    const total = esperado.MT + esperado.BT + esperado.CONJ;
    const fala = (m: Record<TipoRede, number>): string => TIPOS.map((t) => `${NOME_TIPO[t]} ${m[t]}`).join(', ');
    let fontes = 0;
    let ruins = 0;
    let pertos = 0;
    let duvidas = 0;
    const naFolga =(lido: number, alvo: number): boolean => Math.abs(lido - alvo) <= folgaMetros(alvo);
    const avisoFolga = (cita: string, dif: TipoRede[]): void => {
      pertos++;
      // provisório: texto a confirmar com o Italo
      itens.push(item('amarelo', 'METROS', `Metros de ${dif.map((t) => NOME_TIPO[t]).join(' e ')} um pouco diferentes ${de}`,
        `O texto diz ${cita}, e ${de} saem ${fala(esperado)} metros: a diferença fica dentro de 2 m ou 3%. ${TEXTO_FOLGA}`,
        `Confira qual medida vale e deixe o memorial, o KML e a planilha com os mesmos metros (${de}: ${fala(esperado)}).`));
    };
    const compara = (lido: Partial<Record<TipoRede, number>>, cita: string): void => {
      fontes++;
      const dif = TIPOS.filter((t) => lido[t] !== undefined && lido[t] !== esperado[t]);
      if (dif.length === 0) return;
      if (dif.every((t) => naFolga(lido[t]!, esperado[t]))) { avisoFolga(cita, dif); return; }
      ruins++;
      itens.push(item('vermelho', 'METROS', `Metros de ${dif.map((t) => NOME_TIPO[t]).join(' e ')} diferentes ${de}`,
        `O texto diz ${cita}, mas ${de} saem ${fala(esperado)} metros. O órgão soma os metros nos arquivos e devolve quando não batem.`,
        `Escreva os metros ${de} (${fala(esperado)}) no Word e gere o PDF de novo.`));
    };
    // quadro da extensão total
    const q = /media tensao (\d[\d.]*) conjugada (\d[\d.]*) baixa tensao (\d[\d.]*) total (\d[\d.]*)/.exec(B);
    if (q) compara({ MT: numeroBr(q[1]), CONJ: numeroBr(q[2]), BT: numeroBr(q[3]) }, `"Média tensão ${q[1]}, Conjugada ${q[2]}, Baixa tensão ${q[3]}"`);
    // frase do que será construído
    let ambigua: string | null = null;
    const porTipo: Record<TipoRede, { v: number; cita: string }[]> = { MT: [], BT: [], CONJ: [] };
    for (const f of fs) {
      if (!/\b(?:serao construidos|sera construid[ao]s?|implantacao de|contempla)\b/.test(f.b) || TEM_HA.test(f.b)) continue;
      const ms = tokens(f.b, RE_METROS, (m) => numeroBr(m[1], m[2]));
      if (ms.length === 0) continue;
      const lido: Partial<Record<TipoRede, number>> = {};
      let duvida = /\bdestes\b|\bdos quais\b/.test(f.b);
      ms.forEach((m, i) => {
        const seg = f.b.slice(m.ini, i + 1 < ms.length ? ms[i + 1].ini : f.b.length);
        // decisão de 20/11: a rede subterrânea soma com a aérea do mesmo tipo, porque a Tarefa 2 conta a subterrânea como MT
        const t = tipoDe(seg);
        if (!t) { duvida = true; return; }
        lido[t] = (lido[t] ?? 0) + Math.round(m.valor);
      });
      if (duvida) { ambigua = aspas(f.o); continue; }
      for (const t of TIPOS) if (lido[t] !== undefined) porTipo[t].push({ v: lido[t]!, cita: aspas(f.o) });
    }
    // cada frase confere só os tipos que cita (uma frase pode falar só da média e outra só da baixa).
    // Um tipo citado em mais de uma frase: todas dizem o mesmo, ou são trechos e a soma delas bate; frases com metros
    // diferentes que não somam o caso são um memorial que se contradiz: vermelho com os valores (revisão final, I5)
    for (const t of TIPOS) {
      const xs = porTipo[t];
      if (xs.length === 0) continue;
      const valores = [...new Set(xs.map((x) => x.v))];
      const citas = xs.map((x) => x.cita).join(' e ');
      if (valores.length === 1) {
        if (valores[0] === esperado[t]) { fontes++; continue; }
        if (naFolga(valores[0], esperado[t])) { fontes++; avisoFolga(xs[0].cita, [t]); continue; }
      }
      const soma = xs.reduce((s, x) => s + x.v, 0);
      // M2 (decisão do Italo de 22/11): o mesmo valor em várias frases que, somado, bate com o caso pode ser trechos
      // iguais ou a mesma medida errada repetida; o site não sabe qual: amarelo, nunca verde
      if (xs.length > 1 && valores.length === 1 && (soma === esperado[t] || naFolga(soma, esperado[t]))) {
        fontes++;
        duvidas++;
        // provisório: texto a confirmar com o Italo
        itens.push(item('amarelo', 'METROS', `Metros de ${NOME_TIPO[t]} repetidos em mais de uma frase`,
          `O texto diz ${valores[0]} metros de ${NOME_TIPO[t]} em ${citas}, e ${de} saem ${esperado[t]} metros. Somadas, as frases batem; se for a mesma rede dita duas vezes, o texto está errado. O site não sabe qual dos dois é.`,
          `Confira à mão: se for a mesma rede, escreva ${esperado[t]} metros; se forem trechos, deixe claro no texto que são trechos.`));
        continue;
      }
      if (xs.length > 1 && soma === esperado[t]) { fontes++; continue; }
      if (xs.length > 1 && naFolga(soma, esperado[t])) { fontes++; avisoFolga(citas, [t]); continue; }
      // M1 (decisão do Italo de 22/11): uma frase do total e as outras dos trechos que somam esse total.
      // Se o total bate com o caso, o memorial pode estar certo, mas o site não tem certeza da leitura: amarelo.
      // Se o total não bate, a diferença é real e cai no vermelho comum logo abaixo.
      if (xs.length > 2) {
        const maior = xs.reduce((m, x) => (x.v > m.v ? x : m), xs[0]);
        if (soma - maior.v === maior.v) {
          if (maior.v === esperado[t]) {
            fontes++;
            duvidas++;
            // provisório: texto a confirmar com o Italo
            itens.push(item('amarelo', 'METROS', `Metros de ${NOME_TIPO[t]} em total e trechos`,
              `O texto diz ${maior.v} metros de ${NOME_TIPO[t]} em ${maior.cita}, e as outras frases (${xs.filter((x) => x !== maior).map((x) => `${x.v} metros`).join(' e ')}) somam esse total. ${de[0].toUpperCase()}${de.slice(1)} saem ${esperado[t]} metros. Parece certo, mas o site não tem certeza de que leu como total e trechos.`,
              `Confira à mão que ${maior.v} metros é o total da ${NOME_TIPO[t]} e as outras frases são os trechos dele.`));
            continue;
          }
          if (naFolga(maior.v, esperado[t])) { fontes++; avisoFolga(citas, [t]); continue; }
          compara({ [t]: maior.v }, maior.cita);
          continue;
        }
      }
      if (valores.length > 1) {
        fontes++;
        ruins++;
        // provisório: texto a confirmar com o Italo
        itens.push(item('vermelho', 'METROS', `Frases com metros de ${NOME_TIPO[t]} diferentes`,
          `O texto diz ${xs.map((x) => `${x.v} metros em ${x.cita}`).join(' e ')}, e ${de} saem ${esperado[t]} metros de ${NOME_TIPO[t]}. O órgão lê um memorial que se contradiz e devolve.`,
          `Deixe uma medida só para a ${NOME_TIPO[t]}, a ${de} (${esperado[t]} metros), em todas as frases, e gere o PDF de novo.`));
        continue;
      }
      compara({ [t]: valores[0] }, citas);
    }
    if (/nao havera extensao de rede/.test(B)) compara({ MT: 0, BT: 0, CONJ: 0 }, '"não haverá extensão de rede"');
    // extensão do projeto no total de cada área
    for (const f of fs) {
      const m = /possui ([\d.]+) metros de extensao/.exec(f.b);
      if (!m) continue;
      fontes++;
      const n = numeroBr(m[1]);
      if (n !== total && naFolga(n, total)) {
        pertos++;
        // provisório: texto a confirmar com o Italo
        itens.push(item('amarelo', 'METROS', `Extensão do projeto um pouco diferente ${de}`,
          `O texto diz ${aspas(f.o)}, e ${de} a rede nova tem ${total} metros: a diferença fica dentro de 2 m ou 3%. ${TEXTO_FOLGA}`,
          `Confira qual medida vale e deixe o memorial, o KML e a planilha com os mesmos metros (${total}).`));
      } else if (n !== total) {
        ruins++;
        itens.push(item('vermelho', 'METROS', `Extensão do projeto diferente ${de}`,
          `O texto diz ${aspas(f.o)}, mas ${de} a rede nova tem ${total} metros.`, `Troque ${numeroBr(m[1])} por ${total} metros.`));
      }
    }
    if (ambigua) itens.push(item('amarelo', 'METROS', 'Metros por tipo não conferidos numa frase',
      `Não deu para separar os metros por tipo em ${ambigua}.`, `Confira à mão: ${de} saem ${fala(esperado)} metros.`));
    if (fontes === 0 && !ambigua) itens.push(item('amarelo', 'METROS', 'Metros da rede não achados no texto',
      'O texto não tem o quadro da extensão total nem a frase do que será construído, então os metros não foram conferidos.',
      `Confira à mão: ${de} saem ${fala(esperado)} metros.`));
    if (fontes > 0 && ruins === 0 && pertos === 0 && duvidas === 0) itens.push(verde('METROS', 'Metros da rede batem', `${fala(esperado)} metros, iguais ${de}.`));
  } else {
    // provisório: texto a confirmar com o Italo
    itens.push(item('amarelo', 'METROS', 'Metros do texto não conferidos', `Sem o caso e sem os metros por tipo do KML/SHP do zip, os metros do texto não foram conferidos. ${AVISO_PASSOS}`, AVISO_PASSOS));
  }

  // ---- AREA_FALTA, AREA_A_MAIS e PROXIMA (só com o caso) ----
  if (caso) {
    const nomes = caso.intervencoes.map((iv) => iv.area.nome);
    let faltas = 0;
    let avisos = 0;
    // decisão do Italo (20/11): a APP não é conferida pelo nome, só pela menção de "APP"/"preservação permanente" e pelo
    // tipo de água; a área do KMZ é conferida pelas palavras-chave do nome, e sem elas sai amarelo, nunca vermelho
    const apps = appsDoTexto(fs);
    const ehDoKmz = caso.intervencoes.map((iv) => !('largura' in iv.area));
    caso.intervencoes.forEach((iv, i) => {
      const nome = iv.area.nome;
      if (!ehDoKmz[i]) {
        const agua = [...aguasDe(nomeBusca(nome))];
        if (apps.mencoes === 0) {
          faltas++;
          // provisório: texto a confirmar com o Italo
          itens.push(item('vermelho', 'AREA_FALTA', `APP cruzada que não aparece no texto: ${nome}`,
            `A rede nova cruza a APP "${nome}", mas o texto não fala de intervenção em APP (área de preservação permanente).`,
            'Escreva a intervenção na APP, com o tipo de água (rio, lagoa ou açude), os trechos e os hectares.'));
        } else if (agua.length > 0 && !agua.some((t) => apps.tipos.has(t))) {
          avisos++;
          // provisório: texto a confirmar com o Italo
          itens.push(item('amarelo', 'AREA_FALTA', `Tipo de água da APP não achado no texto: ${nome}`,
            `A APP "${nome}" é de ${agua.map((t) => NOME_AGUA[t]).join(' ou ')}, e o texto fala de APP ${apps.tipos.size ? `de ${[...apps.tipos.keys()].map((t) => NOME_AGUA[t]).join(' e ')}` : 'sem dizer o tipo de água'}.`,
            `Confira se o memorial diz que a APP é de ${agua.map((t) => NOME_AGUA[t]).join(' ou ')}.`));
        }
        return;
      }
      const citacao = citacaoDaArea(fs, nome, ctx.municipioKmz);
      if (citacao === 'nome' || citacao === 'palavras') return;
      avisos++;
      const procurado = palavrasChave(nome).length ? ` (procurado: ${palavrasChave(nome).join(', ').toUpperCase()})` : '';
      // provisório: texto a confirmar com o Italo
      itens.push(citacao === 'confira'
        ? item('amarelo', 'AREA_FALTA', `Confira a área cruzada no texto: ${nome}`,
          `A rede nova cruza "${nome}", e o texto só a cita por palavras${procurado} que também podem ser do município ou de outra coisa.`,
          `Confira se o memorial cita a área "${nome}" na intervenção.`)
        : item('amarelo', 'AREA_FALTA', `Área cruzada não achada no texto: ${nome}`,
          `A rede nova cruza "${nome}", e nenhuma frase de intervenção do texto cita o nome dela${procurado}.`,
          `Confira se o memorial cita a área "${nome}".`));
    });
    const cruzadas = new Set(nomes.map(nomeBusca));
    const positivas = fs.filter((f) => /interven|inserid|ocorrera/.test(f.b) && !/\bnao\b|\buc\b|unidade consumidora/.test(f.b));
    const aMais = new Set<string>();
    for (const nome of ctx.nomesDaBase) {
      const n = nomeBusca(nome);
      if (n.length < 4 || cruzadas.has(n) || aMais.has(n)) continue;
      const f = positivas.find((p) => {
        let b = p.b;
        for (const c of nomes) b = b.split(nomeBusca(c)).join(' ');
        // a área cruzada escrita de outro jeito ("Poligonal Serra Exemplo"): as palavras-chave dela saem da frase
        caso.intervencoes.forEach((iv, i) => {
          const kws = palavrasChave(iv.area.nome);
          if (!ehDoKmz[i] || kws.length === 0 || !kws.every((k) => palavra(k).test(b))) return;
          for (const k of kws) b = b.replace(new RegExp(palavra(k).source, 'g'), ' ');
        });
        return temNome(b, nome);
      });
      if (!f) continue;
      aMais.add(n);
      itens.push(item('vermelho', 'AREA_A_MAIS', `Área no texto que a rede não cruza: ${nome}`,
        `O texto diz ${aspas(f.o)}, mas a rede nova não cruza "${nome}". O órgão pede o processo de uma área que a obra não atinge.`,
        `Tire "${nome}" da frase da intervenção, ou confira no mapa se a rede passa nela.`));
    }
    if (nomes.length > 0 && faltas === 0 && avisos === 0 && aMais.size === 0) itens.push(verde('AREA_FALTA', 'Áreas cruzadas citadas', `O texto cita ${nomes.length === 1 ? 'a área cruzada' : `as ${nomes.length} áreas cruzadas`}.`));
    if (caso.proximas.length > 0 && !/nao (?:intervem|interfere) em (?:nenhuma )?outra area protegida|nao esta inserida em nenhuma outra area protegida/.test(B)) {
      itens.push(item('amarelo', 'PROXIMA', 'Área perto da rede sem a frase "não intervém"',
        `${caso.proximas.map((p) => `"${p.area.nome}" fica a cerca de ${Math.round(p.distancia)} metros da rede nova`).join('; ')}, e o texto não diz que a obra não intervém em outra área protegida.`,
        'Escreva que a obra não intervém em outra área protegida, citando a área e a distância.'));
    }
  }

  // ---- ARVORE: cada árvore do KML com a coordenada e a intervenção no texto ----
  const RE_OU = /podad[ao]s? ou suprimid[ao]s?|suprimid[ao]s? ou podad[ao]s?|poda ou supressao|supressao ou poda/;
  let arvoresRuins = 0;
  for (const f of fs) {
    const m = RE_OU.exec(f.b);
    if (!m) continue;
    arvoresRuins++;
    itens.push(item('vermelho', 'ARVORE', 'Árvore "podada ou suprimida"',
      `O texto diz ${recorte(f, m.index, m.index + m[0].length)}: o órgão precisa saber se cada árvore é poda simples ou supressão.`,
      'Escreva uma só intervenção para cada árvore: "poda simples" ou "supressão".'));
  }
  const frasesArvore = fs.map((f, i) => ({ f, i })).filter(({ f }) => /poda|supress|suprimid/.test(f.b) && !/\bposte/.test(f.b));
  const coordsArvore = frasesArvore.flatMap(({ f }) => [...f.b.matchAll(RE_COORD)].map((m) => ({ f, p: [Number(m[1]), Number(m[2])] as Pt, ini: m.index!, fim: m.index! + m[0].length })));
  const comPonto = ctx.arvores.filter((a) => a.ponto);
  for (const a of comPonto) {
    const perto = coordsArvore.map((c) => ({ c, d: dist(c.p, a.ponto!) })).sort((x, y) => x.d - y.d)[0];
    const nome = `${a.especie.trim() || 'árvore'} em ${coordTexto(a.ponto!)}`;
    if (!perto || perto.d > TOL_ARVORE) {
      arvoresRuins++;
      // decisão do Italo (20/11): árvore do KML sem coordenada no texto é amarelo (coordenada que não bate segue vermelho)
      itens.push(item('amarelo', 'ARVORE', `Árvore sem coordenada no texto: ${nome}`,
        `A ${a.intervencao === 'poda' ? 'poda simples' : 'supressão'} da ${nome} está no KML, mas o texto não tem esta coordenada. O órgão confere árvore por árvore.`,
        `Escreva a ${a.intervencao === 'poda' ? 'poda simples' : 'supressão'} da ${nome}, com a espécie e a coordenada.`));
      continue;
    }
    if (perto.d > TOL_COORD) {
      itens.push(item('amarelo', 'COORD', `Coordenada da árvore a ${Math.round(perto.d)} m da do KML: ${nome}`,
        `O texto diz ${recorte(perto.c.f, perto.c.ini, perto.c.fim)}, a ${Math.round(perto.d)} metros da árvore do KML.`, `Troque pela coordenada do KML: ${coordTexto(a.ponto!)}.`));
    }
    const b = perto.c.f.b;
    if (RE_OU.test(b)) continue; // já saiu vermelho acima
    const ok = a.intervencao === 'poda' ? /poda/.test(b) : /supress|suprimid/.test(b);
    if (!ok) {
      arvoresRuins++;
      itens.push(item('vermelho', 'ARVORE', `Intervenção trocada na árvore: ${nome}`,
        `No KML a árvore é ${a.intervencao === 'poda' ? 'poda simples' : 'supressão'}, mas o texto diz ${aspas(perto.c.f.o)}.`,
        `Escreva "${a.intervencao === 'poda' ? 'poda simples' : 'supressão'}" para esta árvore, igual ao KML.`));
    }
  }
  if (caso) {
    for (const c of coordsArvore) {
      if (comPonto.some((a) => dist(c.p, a.ponto!) <= TOL_ARVORE)) continue;
      arvoresRuins++;
      itens.push(item('vermelho', 'ARVORE', 'Árvore no texto que não está no KML',
        `O texto diz ${recorte(c.f, c.ini, c.fim)}, mas nenhuma árvore do KML fica nesta coordenada.`,
        'Ponha a árvore no KML (foto e intervenção no passo das árvores) ou tire a frase do texto.'));
    }
  }
  if (comPonto.length > 0 && arvoresRuins === 0) itens.push(verde('ARVORE', 'Árvores conferem', `As ${comPonto.length} árvores do KML estão no texto com a coordenada e a intervenção.`));
  // sem caso e sem as árvores do KML do zip, o site não sabe se tem poda: nada de verde (provisório: texto a confirmar com o Italo)
  const semArvores = !caso && ctx.arvores.length === 0;
  const semLimpeza = !caso && ctx.limpeza.length === 0;
  if (semArvores) {
    itens.push(item('amarelo', 'ARVORE', 'Árvores e poda não conferidas',
      `Sem o caso, o site não sabe se a obra tem poda, supressão ou limpeza de faixa, então o que o texto diz disso não foi conferido. ${AVISO_PASSOS}`, AVISO_PASSOS));
  }

  // ---- CONTRADICAO ----
  const temPoda = ctx.arvores.some((a) => a.intervencao === 'poda');
  const temSupressao = ctx.arvores.some((a) => a.intervencao === 'supressao');
  const temLimpeza = ctx.limpeza.some((l) => l.length >= 3);
  const VERBO = '(?:havera|sera (?:necessaria|realizada|feita))(?: a| uma)?(?: realizacao de)?(?: nenhuma)?';
  const assuntos: { nome: string; kw: string; existe: boolean }[] = [
    { nome: 'limpeza de faixa', kw: 'limpeza', existe: temLimpeza },
    { nome: 'poda', kw: 'poda', existe: temPoda },
    { nome: 'supressão', kw: 'supressao', existe: temSupressao },
  ];
  let contradicoes = 0;
  // frase em dúvida ("supressão, se necessário"): não é afirmação nem negação; o NAO_TEM dá o amarelo
  const RE_DUVIDA = /se necessari|caso necessari|quando necessari|se houver|caso haja|eventua|possivel|podera/;
  const afirmadasSemCaso = new Set<string>(); // poda ou supressão que o texto diz que haverá e o caso não tem
  const achar = (re: RegExp): { f: Frase; m: RegExpExecArray } | null => {
    for (const f of fs) { const m = re.exec(f.b); if (m) return { f, m }; }
    return null;
  };
  for (const a of assuntos) {
    const neg = achar(new RegExp(`\\bnao ${VERBO} ${a.kw}`));
    const pos = achar(new RegExp(`(?<!\\bnao )\\b${VERBO} ${a.kw}`));
    const citaNeg = neg ? recorte(neg.f, neg.m.index, neg.m.index + neg.m[0].length, 10) : '';
    if (neg && pos) {
      contradicoes++;
      itens.push(item('vermelho', 'CONTRADICAO', `O texto diz que tem e que não tem ${a.nome}`,
        `O texto diz ${recorte(pos.f, pos.m.index, pos.m.index + pos.m[0].length, 10)} e também ${citaNeg}.`,
        `Deixe uma frase só sobre ${a.nome}, igual ao caso.`));
    } else if (neg && a.existe) {
      contradicoes++;
      itens.push(item('vermelho', 'CONTRADICAO', `O texto diz que não tem ${a.nome}, mas o caso tem`,
        `O texto diz ${citaNeg}, mas o KML tem ${a.nome}.`, `Troque a frase para dizer que haverá ${a.nome}, como no KML.`));
    } else if (pos && !a.existe && RE_DUVIDA.test(pos.f.b.slice(Math.max(0, pos.m.index - 50), pos.m.index + pos.m[0].length + 50))) {
      contradicoes++; // em dúvida: sem item aqui (o NAO_TEM diz), mas a CONTRADICAO também não sai verde
    } else if (pos && !a.existe && !semArvores && a.kw !== 'limpeza') {
      // §6.7 "árvore no KML/SHP sem poda ou supressão no texto, ou o contrário": o texto afirma, o caso não tem
      // (sem o caso e sem as árvores do KML do zip, o amarelo "Árvores e poda não conferidas" acima já diz)
      contradicoes++;
      afirmadasSemCaso.add(a.nome);
      const nome = a.kw === 'poda' ? 'poda simples' : a.nome;
      // provisório: texto a confirmar com o Italo
      itens.push(item('vermelho', 'ARVORE', `O texto diz que haverá ${nome}, mas o caso não tem`,
        `O texto diz ${recorte(pos.f, pos.m.index, pos.m.index + pos.m[0].length, 10)}, mas o KML/SHP das árvores não tem nenhuma árvore de ${nome}. O órgão confere árvore por árvore.`,
        `Ponha as árvores de ${nome} no passo das árvores, ou troque a frase para "não haverá ${nome}".`));
    } else if (pos && !a.existe && caso && a.kw === 'limpeza') {
      // limpeza de faixa afirmada sem limpeza no caso: o §6.7 não diz a cor; amarelo, nunca verde
      contradicoes++;
      // provisório: texto a confirmar com o Italo
      itens.push(item('amarelo', 'CONTRADICAO', 'O texto diz que haverá limpeza de faixa, e o caso não tem',
        `O texto diz ${recorte(pos.f, pos.m.index, pos.m.index + pos.m[0].length, 10)}, mas o caso não tem limpeza de faixa marcada.`,
        'Marque a limpeza de faixa no passo das árvores, ou troque a frase para "não haverá limpeza de faixa".'));
    }
  }
  if (contradicoes === 0 && caso) itens.push(verde('CONTRADICAO', 'Sem contradição', 'Poda, supressão e limpeza de faixa aparecem de um jeito só, igual ao caso.'));

  // ---- MARCA: amarelo do Word esquecido ----
  const marcas = fs.flatMap((f) => [...f.o.matchAll(/\[\s*preencher[^\]]*\]?|\[\s*colar do gom\s*\]|x{4,}/gi)].map((m) => recorte(f, m.index!, m.index! + m[0].length, 20)));
  if (marcas.length) {
    itens.push(item('vermelho', 'MARCA', `Marca amarela esquecida no texto (${marcas.length})`,
      `O texto ainda tem ${marcas.slice(0, 3).join(', ')}${marcas.length > 3 ? ' e outras' : ''}. O órgão devolve memorial com campo por preencher.`,
      'Preencha cada marca [PREENCHER: ...], [COLAR DO GOM] e XXXX no Word e gere o PDF de novo.'));
  } else itens.push(verde('MARCA', 'Nenhuma marca esquecida', 'O texto não tem [PREENCHER], [COLAR DO GOM] nem XXXX.'));

  // ---- OS ----
  const os = ctx.os.trim();
  const osCurta = os.replace(/^0+/, '');
  const citaOs = new RegExp(`(?<!\\d)${osCurta.length >= 6 ? `0*${osCurta}` : os}(?!\\d)`).test(B);
  const outras = [...new Set(fs.flatMap((f) => [...f.b.matchAll(/(?<!\d)\d{10}(?!\d)/g)]
    .filter((m) => !/\b(?:rnp|registro|crea|cnpj|cpf|telefone|fone|celular|art|cep|uc|instalacao|conta|cliente)\b[^\d]{0,15}$/.test(f.b.slice(Math.max(0, m.index! - 25), m.index!)))
    .map((m) => m[0])))].filter((n) => n.replace(/^0+/, '') !== osCurta && n !== ctx.rt?.rnp.trim());
  if (os === '') {
    // sem a OS do kit não há o que procurar (provisório: texto a confirmar com o Italo)
    itens.push(item('amarelo', 'OS', 'OS do kit não conferida', 'O site não achou a OS do kit (nem projeto aberto, nem a pasta "<OS>_PROCESSO DOCUMENTAL_..." no zip), então a OS do texto não foi conferida.',
      'Abra o projeto desta obra nos passos 1 e 2, ou monte o zip com a pasta "<OS>_PROCESSO DOCUMENTAL_<REGIONAL>".'));
  } else if (citaOs) itens.push(verde('OS', 'OS do kit no texto', `O texto cita a OS ${os}.`));
  else if (outras.length) {
    itens.push(item('vermelho', 'OS', 'O texto cita outra OS',
      `O texto cita ${outras.slice(0, 3).map((n) => `"${n}"`).join(', ')} e não cita a OS do kit, ${os}. Memorial de outra obra é devolvido.`,
      `Confira se o memorial é desta obra e escreva a OS ${os}.`));
  } else itens.push(item('amarelo', 'OS', 'OS não achada no texto', `O texto não cita a OS ${os}.`, `Escreva a OS ${os} nos dados da obra.`));

  // ---- NAO_TEM: o que não tem também é dito (WorkShop) ----
  const naoTem: { nome: string; kw: string; existe: boolean | null }[] = [
    { nome: 'poda simples', kw: '\\bpoda', existe: semArvores ? null : temPoda },
    { nome: 'supressão', kw: 'supress|suprimi', existe: semArvores ? null : temSupressao },
    { nome: 'limpeza de faixa', kw: 'limpeza', existe: semLimpeza ? null : temLimpeza },
    { nome: 'intervenção em APP', kw: '\\bapp\\b|preservacao permanente', existe: caso ? caso.intervencoes.some(ehApp) : null },
    { nome: 'abertura de vias', kw: 'abertura de (?:novas? )?(?:vias?|acessos?|caminhos?|estradas?)', existe: false },
  ];
  let naoTemRuins = 0;
  for (const n of naoTem) {
    if (n.existe !== false) continue;
    // o texto diz que haverá e o caso não tem: o vermelho ARVORE acima já diz; aqui só não sai verde
    if (afirmadasSemCaso.has(n.nome === 'poda simples' ? 'poda' : n.nome)) { naoTemRuins++; continue; }
    const kw = new RegExp(n.kw);
    const neg = fs.some((f) => new RegExp(`${NEGACAO}(?:${n.kw})`).test(f.b));
    let duvida: string | null = null;
    for (const f of fs) {
      for (const m of f.b.matchAll(new RegExp(n.kw, 'g'))) {
        const janela = f.b.slice(Math.max(0, m.index! - 50), m.index! + m[0].length + 50);
        if (RE_DUVIDA.test(janela)) { duvida = recorte(f, m.index!, m.index! + m[0].length, 50); break; }
      }
      if (duvida) break;
    }
    const fala = fs.find((f) => kw.test(f.b));
    if (duvida) {
      naoTemRuins++;
      itens.push(item('amarelo', 'NAO_TEM', `Frase ambígua sobre ${n.nome}`,
        `O caso não tem ${n.nome}, e o texto diz ${duvida}. O órgão quer saber com certeza o que não haverá.`,
        `Escreva "não haverá ${n.nome}".`));
    } else if (neg) continue;
    else if (fala) {
      naoTemRuins++;
      itens.push(item('amarelo', 'NAO_TEM', `O texto fala de ${n.nome} sem dizer que não haverá`,
        `O caso não tem ${n.nome}, e o texto diz ${aspas(fala.o)}.`, `Confira e escreva "não haverá ${n.nome}".`));
    } else {
      naoTemRuins++;
      // decisão do Italo (19/11): texto que não fala nada da intervenção é amarelo, não vermelho
      itens.push(item('amarelo', 'NAO_TEM', `O texto não diz que não haverá ${n.nome}`,
        `O caso não tem ${n.nome}, e o texto não fala nada disso. O WorkShop pede escrever que não haverá ${n.nome}.`,
        `Escreva "não haverá ${n.nome}" nas características da obra.`));
    }
  }
  if (naoTemRuins === 0) itens.push(verde('NAO_TEM', 'O que não tem está dito', 'O texto diz o que a obra não tem.'));

  // ---- CEP, MUNICIPIO, RT ----
  if (ctx.cepVazio || !/\bcep\b\s*:?\s*\d{2}\.?\d{3}\s*-?\s*\d{3}\b/.test(B)) {
    itens.push(item('amarelo', 'CEP', 'CEP ausente', 'O texto não tem o CEP do interessado.', 'Digite o CEP. Em zona rural, use o CEP da sede do município.'));
  } else itens.push(verde('CEP', 'CEP no texto', 'O texto tem o CEP.'));
  if (ctx.municipioKmz?.trim()) {
    if (temNome(B, ctx.municipioKmz)) itens.push(verde('MUNICIPIO', 'Município igual ao do KMZ', `O texto cita ${ctx.municipioKmz.trim()}.`));
    else itens.push(item('amarelo', 'MUNICIPIO', 'Município do texto diferente do KMZ',
      `O KMZ põe a obra em ${ctx.municipioKmz.trim()}, e o texto não cita este município.`, 'Confira o município: as áreas e os órgãos foram vistos com o do KMZ.'));
  }
  if (ctx.rt?.nome.trim()) {
    if (temNome(B, ctx.rt.nome)) itens.push(verde('RT', 'Responsável técnico igual ao guardado', `O texto cita ${ctx.rt.nome.trim()}.`));
    else itens.push(item('amarelo', 'RT', 'Responsável técnico diferente do guardado',
      `O texto não cita ${ctx.rt.nome.trim()}, o responsável técnico guardado no site. Pode ser outro RT.`, 'Confirme o nome do RT com a ART.'));
  }

  // ---- POSTE e COORD: postes citados com número e coordenada ----
  if (ctx.rede && ctx.rede.postes.length) {
    const vistos = new Set<string>();
    let postesRuins = 0;
    for (const f of fs) {
      for (const m of f.b.matchAll(/\bn\s*[º°o]?\.?\s*((?:p\s*)?\d+[a-z]?)\s*(?:de coordenadas\s*)?\(\s*(\d{6,7})\s*,\s*(\d{7})\s*\)/g)) {
        const chave = m[0].replace(/\s+/g, '');
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        const p: Pt = [Number(m[2]), Number(m[3])];
        const num = numeroPoste(m[1]);
        const cita = recorte(f, m.index!, m.index! + m[0].length, 10);
        const perto = ctx.rede.postes.map((x) => ({ x, d: dist(x.ponto, p) })).sort((a, b) => a.d - b.d)[0];
        if (perto.d <= TOL_COORD) {
          if (perto.x.numero?.trim() && numeroPoste(perto.x.numero) !== num) {
            postesRuins++;
            itens.push(item('amarelo', 'POSTE', `Poste Nº ${m[1].toUpperCase()} no texto é o Nº ${perto.x.numero.trim()} no DXF`,
              `O texto diz ${cita}, mas o poste do DXF nesta coordenada é o Nº ${perto.x.numero.trim()}.`, `Confira e escreva o número do DXF: poste Nº ${perto.x.numero.trim()}.`));
          }
          continue;
        }
        postesRuins++;
        const mesmo = ctx.rede.postes.find((x) => x.numero && numeroPoste(x.numero) === num);
        itens.push(item('amarelo', 'COORD', `Coordenada do poste Nº ${m[1].toUpperCase()} a ${Math.round(perto.d)} m do DXF`,
          `O texto diz ${cita}, e o poste mais perto do DXF fica a ${Math.round(perto.d)} metros.`,
          mesmo ? `Confira: no DXF o poste Nº ${mesmo.numero!.trim()} fica em ${coordTexto(mesmo.ponto)}.` : 'Confira a coordenada do poste no DXF.'));
      }
    }
    if (vistos.size > 0 && postesRuins === 0) itens.push(verde('POSTE', 'Postes citados conferem', `Os ${vistos.size} postes citados têm o número e a coordenada do DXF.`));
  }

  // ---- DIGITACAO: lista curta de erros comuns ----
  let digitacao = 0;
  for (const e of ERROS_COMUNS) {
    const re = new RegExp(e.padrao.source, e.padrao.flags.replace('g', ''));
    const f = fs.find((x) => re.test(x.b));
    if (!f) continue;
    const m = re.exec(f.b)!;
    digitacao++;
    itens.push(item('amarelo', 'DIGITACAO', e.titulo, `O texto diz ${recorte(f, m.index, m.index + m[0].length, 25)}.`, e.comoCorrigir));
  }
  if (digitacao === 0) itens.push(verde('DIGITACAO', 'Sem os erros comuns de digitação', 'Nenhum erro da lista curta foi achado.'));

  return emOrdem(itens);
}

const ORDEM: Record<Nivel, number> = { vermelho: 0, amarelo: 1, verde: 2 };
const emOrdem = (itens: ItemConferencia[]): ItemConferencia[] =>
  itens.map((x, i) => ({ x, i })).sort((a, b) => ORDEM[a.x.nivel] - ORDEM[b.x.nivel] || a.i - b.i).map((e) => e.x);

// ---------- Planilha Padrão contra o caso e o memorial (desenho §6.7, "Planilha") ----------

const CAMPO_METROS: Record<TipoRede, Campo> = { MT: 'metrosMT', BT: 'metrosBT', CONJ: 'metrosCONJ' };
type Agua = 'rio' | 'lagoa' | 'reservatorio';
const AGUAS: Agua[] = ['rio', 'lagoa', 'reservatorio'];
const NOME_AGUA: Record<Agua, string> = { rio: 'rio ou riacho', lagoa: 'lagoa natural', reservatorio: 'açude ou reservatório' };
const SEM_ASSUNTO = 'sem área cruzada: confirme com o P&M o assunto do e-mail'; // desenho §6.6 (o mesmo da planilha)

/** Tipos de água citados num trecho de texto de busca (sem acento, minúsculo). */
function aguasDe(b: string): Set<Agua> {
  const r = new Set<Agua>();
  if (/acudes?\b|reservatorios?\b|barragens?\b|barramento|represas?\b/.test(b)) r.add('reservatorio');
  if (/\blagoas?\b|\blagos?\b/.test(b)) r.add('lagoa');
  if (/\brios?\b|\briachos?\b|\bcorregos?\b/.test(b)) r.add('rio');
  return r;
}

/** A APP de que o texto fala: cada menção de "APP"/"preservação permanente" sem "não" nem "fora da" antes, na mesma
 *  oração; o tipo de água vem das palavras logo depois. `mencoes` conta as menções positivas, com ou sem tipo. */
function appsDoTexto(fs: Frase[]): { tipos: Map<Agua, string>; semTipo: string | null; mencoes: number } {
  const tipos = new Map<Agua, string>();
  let semTipo: string | null = null;
  let mencoes = 0;
  for (const f of fs) {
    for (const m of f.b.matchAll(/\bapps?\b|preservacao permanente/g)) {
      const oracao = f.b.slice(0, m.index).split(/[,;:]|\bporem\b|\bentretanto\b|\bno entanto\b/).pop()!;
      if (/\bnao\b|\bfora d/.test(oracao)) continue;
      mencoes++;
      const fim = m.index! + m[0].length;
      const achados = aguasDe(f.b.slice(fim, fim + 50));
      if (achados.size === 0) semTipo ??= recorte(f, m.index!, fim, 30);
      for (const t of achados) if (!tipos.has(t)) tipos.set(t, recorte(f, m.index!, fim + 30, 15));
    }
  }
  return { tipos, semTipo, mencoes };
}

// Nome de uma área sem o que é genérico (tipo, esfera, órgão e ligação), sem acento e em minúsculas: o que sobra é o
// que identifica a área ("POLIGONAL_SERRA EXEMPLO" -> serra, exemplo). Decisão do Italo (20/11).
// Palavras que também identificam área ("vida", "terra", "parque", "natural", "reserva", "floresta", "projeto",
// "território", "estação", "refúgio") só são genéricas dentro das expressões fixas do tipo da área.
const EXPRESSOES_GENERICAS = [
  'area de protecao ambiental', 'area de relevante interesse ecologico', 'refugio de vida silvestre', 'refugio da vida silvestre',
  'reserva particular do patrimonio natural', 'reserva extrativista', 'reserva biologica', 'floresta nacional', 'floresta estadual',
  'parque natural municipal', 'parque estadual', 'parque nacional', 'parque natural', 'estacao ecologica', 'monumento natural',
  'terras indigenas', 'terra indigena', 'territorios quilombolas', 'territorio quilombola', 'projetos de assentamento',
  'projeto de assentamento', 'unidade de conservacao', 'perimetro irrigado',
];
const GENERICAS = new Set([
  'pa', 'poligonal', 'poligono', 'apa', 'arie', 'rppn', 'esec', 'revis', 'mona', 'flona', 'resex', 'parna', 'rebio',
  'area', 'areas', 'protecao', 'ambiental', 'perimetro', 'perimetros', 'irrigado', 'irrigados', 'assentamento', 'assentamentos',
  'rural', 'rurais', 'quilombola', 'quilombolas', 'indigena', 'indigenas', 'conservacao', 'estadual', 'municipal', 'federal',
  'dnocs', 'incra', 'sem', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'o', 'a',
]);
/** Palavras-chave do nome de uma área ("_" vale espaço), sem as expressões e palavras genéricas e sem repetir. */
function palavrasChave(nome: string): string[] {
  let n = ` ${nomeBusca(nome).replace(/[^a-z0-9]+/g, ' ')} `;
  for (const e of EXPRESSOES_GENERICAS) n = n.split(` ${e} `).join(' ');
  return [...new Set(n.split(' ').filter((w) => w.length >= 2 && !GENERICAS.has(w)))];
}
const palavra = (k: string): RegExp => new RegExp(`(?<![a-z0-9])${k}(?![a-z0-9])`);
// frase em que a área pode estar citada como intervenção: fala de intervenção ou de estar dentro, e não é a do
// endereço, a do município nem a do "não intervém"
const ehFraseDeIntervencao = (b: string): boolean =>
  /inserid|interven|ocorre|denominad|dentro d/.test(b)
  && !/\bendereco\b|\bcep\b|\bbairro\b|\bmunicipio\b|\bnao (?:intervem|interfere|esta|estao|se encontra|ira|irao|havera|ocorrera)\b|\bfora d/.test(b);
/**
 * Como o texto cita a área: 'nome' = nome inteiro numa frase de intervenção; 'palavras' = todas as palavras-chave numa
 * frase de intervenção, com palavras que bastam para identificar; 'confira' = achou só por uma palavra curta ou por
 * palavras do nome do município; null = não achou.
 */
function citacaoDaArea(fs: Frase[], nome: string, municipio: string | null): 'nome' | 'palavras' | 'confira' | null {
  const frases = fs.filter((f) => ehFraseDeIntervencao(f.b));
  if (frases.some((f) => temNome(f.b, nome))) return 'nome';
  const kws = palavrasChave(nome);
  if (kws.length === 0 || !frases.some((f) => kws.every((k) => palavra(k).test(f.b)))) return null;
  const doMunicipio = new Set(municipio ? palavrasChave(municipio) : []);
  return (kws.length === 1 && kws[0].length <= 4) || kws.some((k) => doMunicipio.has(k)) ? 'confira' : 'palavras';
}

/** Tipos de água marcados na célula da APP ("NÃO" = nenhum); null se alguma opção não é conhecida. */
function aguasDaCelula(celula: string): Set<Agua> | null {
  const r = new Set<Agua>();
  for (const parte of celula.split(', ')) {
    const b = nomeBusca(parte);
    if (b === '' || b.startsWith('nao')) continue;
    if (/reservat/.test(b)) r.add('reservatorio');
    else if (/\blagos?\b|\blagoas?\b/.test(b)) r.add('lagoa');
    else if (/\brio\b|riacho/.test(b)) r.add('rio');
    else return null;
  }
  return r;
}

// "SIM", "NÃO", "NÃO SE APLICA", "SIM - LIMPEZA ...": o começo diz
const simOuNao = (celula: string | undefined): 'SIM' | 'NÃO' | null => {
  const b = nomeBusca(celula ?? '');
  return b.startsWith('sim') ? 'SIM' : b.startsWith('nao') ? 'NÃO' : null;
};

// prefixos do assunto do e-mail, do mais comprido para o mais curto (o "UC EM" fica por último)
const PREFIXOS_ASSUNTO: { t: string; uc: boolean; rede: ParteAssunto['rede'] }[] = [
  { t: 'uc e parte da rede em', uc: true, rede: 'parte' },
  { t: 'uc e rede em', uc: true, rede: 'inteira' },
  { t: 'parte da rede em', uc: false, rede: 'parte' },
  { t: 'rede em', uc: false, rede: 'inteira' },
  { t: 'uc em', uc: true, rede: null },
];
// rótulos da aba de modelos, na forma dos kits e na forma da aba, do mais comprido para o mais curto
const ROTULOS_BUSCA = ROTULO_ASSUNTO
  .flatMap((r) => [r.rotulo, ...(r.modelo ? [r.modelo] : [])].map((f) => ({ f: nomeBusca(f), rotulo: r.rotulo })))
  .sort((a, b) => b.f.length - a.f.length);

/** "SOB <OS>_PROCESSO DOCUMENTAL_<partes>": a OS e as partes; partes null quando não dá para ler o resto. */
function lerAssunto(s: string): { os: string; partes: ParteAssunto[] | null } | null {
  const m = /^sob\s*([^_\s]+)\s*_\s*processo documental\s*_\s*(.+)$/.exec(nomeBusca(s).replace(/[.\s]+$/, ''));
  if (!m) return null;
  // alguns modelos da aba escrevem "PARTE REDE" sem o "DA"
  let resto = m[2].replace(/\bparte rede\b/g, 'parte da rede');
  const partes: ParteAssunto[] = [];
  let prefixo: (typeof PREFIXOS_ASSUNTO)[number] | null = null;
  while (resto !== '') {
    const p = PREFIXOS_ASSUNTO.find((x) => resto.startsWith(`${x.t} `));
    if (p) { prefixo = p; resto = resto.slice(p.t.length + 1); }
    if (!prefixo) return { os: m[1], partes: null };
    const r = ROTULOS_BUSCA.find((x) => resto === x.f || resto.startsWith(`${x.f} e `));
    if (!r) return { os: m[1], partes: null };
    partes.push({ rotulo: r.rotulo, uc: prefixo.uc, rede: prefixo.rede });
    resto = resto.slice(r.f.length).replace(/^ e /, '');
  }
  return { os: m[1], partes };
}

/**
 * Confere a linha da obra da Planilha Padrão (desenho §6.7): metros iguais aos do caso, poda e supressão iguais ao
 * memorial, tipo de APP igual ao do memorial e assunto da A1 coerente com a UC e a rede. Nunca vermelho falso: o que
 * não dá para ler, ou o que falta só de um lado, sai amarelo. Vermelhos primeiro, depois amarelos, depois verdes.
 */
export function conferirPlanilha(
  linha: Partial<Record<Campo, string>>,
  ctx: ContextoTexto & { textoMemorial: string | null; assunto: string | null },
): ItemConferencia[] {
  const itens: ItemConferencia[] = [];
  const fs = ctx.textoMemorial === null ? null : frasesDe(ctx.textoMemorial);
  const semMemorial = 'O memorial não foi lido, então a planilha não foi conferida contra ele.';
  const comoSemMemorial = 'Solte o PDF do memorial para conferir a planilha contra ele.';
  const achar = (re: RegExp): { f: Frase; m: RegExpExecArray } | null => {
    for (const f of fs ?? []) { const m = re.exec(f.b); if (m) return { f, m }; }
    return null;
  };
  const cita = (a: { f: Frase; m: RegExpExecArray }): string => recorte(a.f, a.m.index, a.m.index + a.m[0].length, 15);

  // ---- PLANILHA_METROS: metros da linha iguais aos do caso (ou aos do KML/SHP do zip, sem caso) ----
  const esperado: Record<TipoRede, number> | null = ctx.caso && ctx.rede
    ? (() => { const m = metrosDaRede(ctx.rede!); return { MT: Math.round(m.MT), BT: Math.round(m.BT), CONJ: Math.round(m.CONJ) }; })()
    : ctx.metrosZip ? { MT: Math.round(ctx.metrosZip.MT ?? 0), BT: Math.round(ctx.metrosZip.BT ?? 0), CONJ: Math.round(ctx.metrosZip.CONJ ?? 0) } : null;
  if (!esperado) {
    itens.push(item('amarelo', 'PLANILHA_METROS', 'Metros da planilha não conferidos', `Sem o caso e sem o KML da rede no zip, os metros da planilha não foram conferidos. ${AVISO_PASSOS}`, AVISO_PASSOS));
  } else {
    const de = ctx.caso ? 'do caso' : 'do KML/SHP do zip';
    const lidos = TIPOS.map((t) => ({ t, c: linha[CAMPO_METROS[t]], v: Number((linha[CAMPO_METROS[t]] ?? '').trim().replace(',', '.')) }));
    const ilegiveis = lidos.filter((x) => x.c === undefined || x.c.trim() === '' || Number.isNaN(x.v));
    const diferentes = lidos.filter((x) => !ilegiveis.includes(x) && Math.round(x.v) !== esperado[x.t]);
    const difs = diferentes.filter((x) => Math.abs(Math.round(x.v) - esperado[x.t]) > folgaMetros(esperado[x.t]));
    const pertos = diferentes.filter((x) => !difs.includes(x));
    const fala = (m: Record<TipoRede, number>): string => TIPOS.map((t) => `${NOME_TIPO[t]} ${m[t]}`).join(', ');
    if (pertos.length) {
      // provisório: texto a confirmar com o Italo
      itens.push(item('amarelo', 'PLANILHA_METROS', `Metros de ${pertos.map((x) => NOME_TIPO[x.t]).join(' e ')} na planilha um pouco diferentes ${de}`,
        `A planilha diz ${pertos.map((x) => `${NOME_TIPO[x.t]} ${x.c!.trim()}`).join(', ')} metros, e ${de} saem ${fala(esperado)} metros: a diferença fica dentro de 2 m ou 3%. ${TEXTO_FOLGA}`,
        `Confira qual medida vale e deixe a planilha, o memorial e o KML com os mesmos metros (${de}: ${fala(esperado)}).`));
    }
    if (difs.length) {
      itens.push(item('vermelho', 'PLANILHA_METROS', `Metros de ${difs.map((x) => NOME_TIPO[x.t]).join(' e ')} na planilha diferentes ${de}`,
        `A planilha diz ${difs.map((x) => `${NOME_TIPO[x.t]} ${x.c!.trim()}`).join(', ')} metros, mas ${de} saem ${fala(esperado)} metros. O órgão confere a planilha com o memorial e o KML.`,
        `Escreva na planilha os metros ${de}: ${fala(esperado)}.`));
    }
    if (ilegiveis.length) {
      itens.push(item('amarelo', 'PLANILHA_METROS', 'Metros da planilha não lidos',
        `Não deu para ler os metros de ${ilegiveis.map((x) => NOME_TIPO[x.t]).join(' e ')} na linha da obra.`, `Confira à mão: ${de} saem ${fala(esperado)} metros.`));
    }
    if (!diferentes.length && !ilegiveis.length) itens.push(verde('PLANILHA_METROS', 'Metros da planilha batem', `${fala(esperado)} metros, iguais ${de}.`));
  }

  // ---- PLANILHA_PODA e PLANILHA_SUPRESSAO: SIM ou NÃO iguais ao memorial ----
  // na Rev.06 em diante a coluna da supressão também traz a limpeza de faixa ("SIM - LIMPEZA DE FAIXA ...")
  const supressaoEhLimpeza = /limpeza/.test(nomeBusca(linha.supressao ?? ''));
  const vegetacao: { codigo: string; nome: string; celula: string | undefined; kw: string }[] = [
    { codigo: 'PLANILHA_PODA', nome: 'poda simples', celula: linha.poda, kw: 'podas?\\b' },
    supressaoEhLimpeza
      ? { codigo: 'PLANILHA_SUPRESSAO', nome: 'limpeza de faixa', celula: linha.supressao, kw: 'limpeza' }
      : { codigo: 'PLANILHA_SUPRESSAO', nome: 'supressão', celula: linha.supressao, kw: '(?:supressao|suprimi)' },
  ];
  for (const v of vegetacao) {
    const sn = simOuNao(v.celula);
    if (sn === null) {
      itens.push(item('amarelo', v.codigo, `Coluna de ${v.nome} da planilha não lida`, `A linha da obra não tem SIM ou NÃO na coluna de ${v.nome}.`, 'Escolha SIM ou NÃO na lista da célula, igual ao memorial.'));
      continue;
    }
    if (!fs) { itens.push(item('amarelo', v.codigo, `${v.nome[0].toUpperCase()}${v.nome.slice(1)} da planilha não conferida`, semMemorial, comoSemMemorial)); continue; }
    const neg = achar(new RegExp(`${NEGACAO}${v.kw}`));
    const pos = achar(new RegExp(`${AFIRMACAO}${v.kw}`));
    const celula = `"${v.celula!.trim()}"`;
    if (sn === 'SIM' && pos && !neg) itens.push(verde(v.codigo, `${v.nome[0].toUpperCase()}${v.nome.slice(1)}: planilha igual ao memorial`, `A planilha marca ${celula} e o memorial diz ${cita(pos)}.`));
    else if (sn === 'NÃO' && neg && !pos) itens.push(verde(v.codigo, `${v.nome[0].toUpperCase()}${v.nome.slice(1)}: planilha igual ao memorial`, `A planilha marca ${celula} e o memorial diz ${cita(neg)}.`));
    else if (sn === 'SIM' && neg && !pos) {
      itens.push(item('vermelho', v.codigo, `A planilha marca ${v.nome} e o memorial diz que não haverá`,
        `A planilha marca ${celula} na coluna de ${v.nome}, mas o memorial diz ${cita(neg)}. O órgão devolve quando a planilha e o memorial não dizem o mesmo.`,
        `Deixe a planilha e o memorial iguais ao caso: marque "NÃO" na planilha ou corrija o memorial.`));
    } else if (sn === 'NÃO' && pos && !neg) {
      itens.push(item('vermelho', v.codigo, `A planilha diz que não haverá ${v.nome} e o memorial diz que haverá`,
        `A planilha marca ${celula} na coluna de ${v.nome}, mas o memorial diz ${cita(pos)}. O órgão devolve quando a planilha e o memorial não dizem o mesmo.`,
        `Deixe a planilha e o memorial iguais ao caso: marque "SIM" na planilha ou corrija o memorial.`));
    } else {
      itens.push(item('amarelo', v.codigo, `${v.nome[0].toUpperCase()}${v.nome.slice(1)}: o memorial não diz com certeza`,
        `A planilha marca ${celula}, e o memorial ${pos && neg ? `diz ${cita(pos)} e também ${cita(neg)}` : `não diz com certeza se haverá ${v.nome}`}.`,
        `Confira à mão e escreva no memorial "haverá ${v.nome}" ou "não haverá ${v.nome}", igual à planilha.`));
    }
  }

  // ---- PLANILHA_APP: tipo de água da APP da rede igual ao do memorial ----
  const celulaApp = linha.appRede;
  const naCelula = celulaApp === undefined ? null : aguasDaCelula(celulaApp);
  if (celulaApp === undefined || naCelula === null) {
    itens.push(item('amarelo', 'PLANILHA_APP', 'Coluna da APP da rede não lida',
      celulaApp === undefined ? 'A linha da obra não tem a coluna da APP da rede preenchida.' : `A opção "${celulaApp.trim()}" da coluna da APP da rede não é conhecida.`,
      'Escolha na lista da célula o tipo de água da APP, igual ao memorial.'));
  } else if (!fs) {
    itens.push(item('amarelo', 'PLANILHA_APP', 'APP da planilha não conferida', semMemorial, comoSemMemorial));
  } else {
    const { tipos: noMemorial, semTipo } = appsDoTexto(fs);
    const celula = `"${celulaApp.trim()}"`;
    const doMemorial = AGUAS.filter((t) => noMemorial.has(t));
    const aMais = AGUAS.filter((t) => naCelula.has(t) && !noMemorial.has(t));
    const aMenos = doMemorial.filter((t) => !naCelula.has(t));
    const citaMemorial = doMemorial.map((t) => noMemorial.get(t)!).join(' e ');
    if (naCelula.size === 0 && doMemorial.length > 0) {
      itens.push(item('vermelho', 'PLANILHA_APP', 'A planilha diz que não há APP e o memorial fala de APP',
        `A planilha marca ${celula} na APP da rede, mas o memorial diz ${citaMemorial}. O órgão devolve quando a planilha e o memorial não dizem o mesmo.`,
        `Marque na planilha a APP de ${doMemorial.map((t) => NOME_AGUA[t]).join(' e ')}, igual ao memorial.`));
    } else if (naCelula.size > 0 && doMemorial.length > 0 && aMais.length > 0) {
      itens.push(item('vermelho', 'PLANILHA_APP', 'Tipo de APP da planilha diferente do memorial',
        `A planilha marca ${celula} (${aMais.map((t) => NOME_AGUA[t]).join(' e ')}), mas o memorial fala em ${citaMemorial}. O órgão devolve quando a planilha e o memorial não dizem o mesmo.`,
        `Deixe iguais: marque na planilha a APP de ${doMemorial.map((t) => NOME_AGUA[t]).join(' e ')}, ou corrija o memorial.`));
    } else if (naCelula.size > 0 && doMemorial.length === 0) {
      itens.push(item('amarelo', 'PLANILHA_APP', 'O memorial não diz o tipo de água da APP',
        `A planilha marca ${celula}, e o memorial não diz de que água é a APP${semTipo ? ` (${semTipo})` : ''}.`, 'Confira à mão e escreva no memorial o tipo de água da APP (rio, lagoa ou açude), igual à planilha.'));
    } else if (aMenos.length > 0) {
      itens.push(item('amarelo', 'PLANILHA_APP', 'O memorial cita mais APP do que a planilha marca',
        `O memorial fala em ${aMenos.map((t) => noMemorial.get(t)!).join(' e ')}, e a planilha marca só ${celula}.`,
        `Confira e marque na planilha também a APP de ${aMenos.map((t) => NOME_AGUA[t]).join(' e ')}.`));
    } else if (naCelula.size === 0 && semTipo) {
      itens.push(item('amarelo', 'PLANILHA_APP', 'O memorial cita APP e a planilha marca que não há',
        `A planilha marca ${celula}, e o memorial diz ${semTipo}.`, 'Confira se a rede passa em APP e deixe a planilha e o memorial iguais.'));
    } else {
      itens.push(verde('PLANILHA_APP', 'APP da planilha igual ao memorial', naCelula.size === 0 ? `A planilha marca ${celula} e o memorial não fala de intervenção em APP.` : `A planilha marca ${celula} e o memorial fala em ${citaMemorial}.`));
    }
  }

  // ---- PLANILHA_ASSUNTO: assunto da A1 coerente com a UC e a rede ----
  const lido = ctx.assunto?.trim() ? lerAssunto(ctx.assunto) : null;
  const citaAssunto = `"${corta((ctx.assunto ?? '').trim())}"`;
  const osCurta = ctx.os.trim().replace(/^0+/, '');
  if (ctx.os.trim() === '') {
    // provisório: texto a confirmar com o Italo
    itens.push(item('amarelo', 'PLANILHA_ASSUNTO', 'Assunto da A1 não conferido', 'O site não achou a OS do kit, então a OS e as áreas do assunto da A1 não foram conferidas.',
      'Abra o projeto desta obra nos passos 1 e 2, ou monte o zip com a pasta "<OS>_PROCESSO DOCUMENTAL_<REGIONAL>".'));
  } else if (!lido) {
    itens.push(item('amarelo', 'PLANILHA_ASSUNTO', 'Assunto da A1 não lido',
      ctx.assunto?.trim() ? `A linha do assunto ${citaAssunto} não segue o modelo "SOB <OS>_PROCESSO DOCUMENTAL_...".` : 'A célula A1 não tem a linha do assunto "SOB <OS>_PROCESSO DOCUMENTAL_...".',
      'Escreva na A1 o assunto da aba "Modelos Assunto E-mail", com a OS da obra.'));
  } else if (/^x+$/.test(lido.os)) {
    itens.push(item('amarelo', 'PLANILHA_ASSUNTO', 'Assunto da A1 sem a OS', `A A1 ainda tem o modelo ${citaAssunto}, sem a OS da obra.`, `Troque o XXXXXXXXXX pela OS ${ctx.os.trim()}.`));
  } else if (!/^\d+$/.test(lido.os) || lido.os.replace(/^0+/, '') !== osCurta) {
    itens.push(item('vermelho', 'PLANILHA_ASSUNTO', 'O assunto da A1 cita outra OS',
      `A A1 diz ${citaAssunto}, mas a OS do kit é ${ctx.os.trim()}. O e-mail com o assunto de outra obra é devolvido.`, `Escreva a OS ${ctx.os.trim()} no assunto da A1.`));
  } else if (!ctx.caso || !ctx.rede) {
    itens.push(item('amarelo', 'PLANILHA_ASSUNTO', 'Assunto da A1 não conferido', AVISO_PASSOS, AVISO_PASSOS));
  } else {
    const esperadas = partesDoAssunto(ctx.caso, ctx.uc ?? null, metrosDaRede(ctx.rede));
    if (esperadas.length === 0 || esperadas.some((p) => p.rotulo === '')) {
      itens.push(item('amarelo', 'PLANILHA_ASSUNTO', 'Assunto da A1 sem modelo para conferir',
        esperadas.length === 0 ? `A A1 diz ${citaAssunto}; ${SEM_ASSUNTO}.` : `A A1 diz ${citaAssunto}, e a área da obra não tem modelo de assunto na aba "Modelos Assunto E-mail".`,
        'Pergunte ao P&M qual modelo da aba "Modelos Assunto E-mail" vale para esta obra.'));
    } else if (lido.partes === null) {
      itens.push(item('amarelo', 'PLANILHA_ASSUNTO', 'Assunto da A1 não lido', `Não deu para ler as áreas do assunto ${citaAssunto}.`, 'Confira o assunto à mão com a aba "Modelos Assunto E-mail".'));
    } else {
      // sem saber onde está a UC, só a parte da rede é conferida
      const ucSabida = ctx.uc !== undefined;
      const chaves = (ps: ParteAssunto[]): string[] => [...new Set(ps.filter((p) => ucSabida || p.rede !== null).map((p) => `${p.rotulo}|${ucSabida ? p.uc : ''}|${p.rede}`))].sort();
      const certo = assuntoTexto(ctx.os.trim(), esperadas)!;
      if (chaves(lido.partes).join(';') === chaves(esperadas).join(';')) {
        // sem a UC, a parte dela não foi conferida: amarelo, nunca verde (provisório: texto a confirmar com o Italo)
        if (ucSabida) itens.push(verde('PLANILHA_ASSUNTO', 'Assunto da A1 coerente com a UC e a rede', `A A1 diz ${citaAssunto}.`));
        else {
          itens.push(item('amarelo', 'PLANILHA_ASSUNTO', 'Assunto da A1: a posição da UC não foi conferida',
            `A A1 diz ${citaAssunto}; a parte da rede confere, mas a UC não foi marcada no passo 5a, então o site não sabe se o assunto leva a parte da UC.`,
            'Marque a UC no passo 5a e confira o kit de novo.'));
        }
      } else {
        itens.push(item('vermelho', 'PLANILHA_ASSUNTO', 'O assunto da A1 não combina com a UC e a rede',
          `A A1 diz ${citaAssunto}, mas pelo caso o assunto é "${certo}"${ucSabida ? '' : ' (sem contar a UC)'}. O P&M devolve o e-mail com o assunto errado.`,
          ucSabida ? `Escreva na A1: ${certo}` : `Confira o assunto: pelo caso, a rede fica como em "${certo}"; acrescente a UC se ela estiver na área.`));
      }
    }
  }

  return emOrdem(itens);
}
