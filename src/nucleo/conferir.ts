import type { Feicao, Geometria, Nivel, Pt } from './tipos.ts';
import { abrirZip, type ArquivoZip } from './zip.ts';
import { lerKml } from './kml.ts';
import { lerShp, type TipoCamada } from './shp.ts';
import { paraUtm } from './utm.ts';
import { G } from './geom.ts';
import { lerDxfGeometria } from './dxf.ts';
import { proporRedeDxf, redeNova } from './rede.ts';
import { TEXTOS } from '../regras/textos.ts';

export interface ItemConferencia {
  nivel: Nivel;
  codigo: string;
  titulo: string;
  porque: string;
  comoCorrigir: string;
  arquivos: string[];
}

const TOL_PAR = 5; // m: caixa igual para parear pela geometria, e "no lugar" até aqui
const TOL_AMARELO = 20; // m
const EXTS_SHP = ['shp', 'shx', 'dbf', 'prj', 'cpg'] as const;
type ExtShp = (typeof EXTS_SHP)[number];
const EXTS_ESPACIAIS = new Set<string>(['kml', 'kmz', ...EXTS_SHP]);
const NOME_TIPO: Record<TipoCamada, string> = { ponto: 'ponto', linha: 'linha', poligono: 'polígono' };

const semAcento = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const nomeDoCaminho = (c: string): string => c.slice(c.lastIndexOf('/') + 1);
const pastaDoCaminho = (c: string): string => c.slice(0, Math.max(0, c.lastIndexOf('/')));
const extensao = (nome: string): string => {
  const i = nome.lastIndexOf('.');
  return i < 0 ? '' : nome.slice(i + 1).toLowerCase();
};
const semExtensao = (nome: string): string => {
  const i = nome.lastIndexOf('.');
  return i < 0 ? nome : nome.slice(0, i);
};

/**
 * Nome para parear KML e SHP: sem acento, minúsculo, sem o prefixo de 8 a 10 dígitos,
 * `_` e `-` viram espaço, sem as palavras KML, SHP e SHAPEFILE nem o que está entre parênteses.
 * Recebe o nome do arquivo já sem a extensão.
 */
export function nomeNormalizado(base: string): string {
  return semAcento(base)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^\s*\d{8,10}(?![0-9])/, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(kml|shp|shapefile)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type Caixa = [number, number, number, number];

function pontosDe(g: Geometria): Pt[] {
  if (g.t === 'ponto') return [g.p];
  if (g.t === 'linha') return g.pts;
  return g.aneis.flat();
}
function caixaDe(gs: Geometria[]): Caixa | null {
  const c: Caixa = [Infinity, Infinity, -Infinity, -Infinity];
  for (const g of gs) {
    for (const [x, y] of pontosDe(g)) {
      if (x < c[0]) c[0] = x;
      if (y < c[1]) c[1] = y;
      if (x > c[2]) c[2] = x;
      if (y > c[3]) c[3] = y;
    }
  }
  return c[0] === Infinity ? null : c;
}
const caixasIguais = (a: Caixa | null, b: Caixa | null): boolean => !!a && !!b && a.every((v, i) => Math.abs(v - b[i]) <= TOL_PAR);
const nVertices = (gs: Geometria[]): number => gs.reduce((s, g) => s + pontosDe(g).length, 0);

// distância de um ponto a um segmento
function distSegmento(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const q = dx * dx + dy * dy;
  const t = q === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / q));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function segmentosDe(gs: Geometria[]): [Pt, Pt][] {
  const s: [Pt, Pt][] = [];
  for (const g of gs) {
    if (g.t === 'ponto') s.push([g.p, g.p]);
    else if (g.t === 'linha') for (let i = 0; i + 1 < g.pts.length; i++) s.push([g.pts[i], g.pts[i + 1]]);
    else for (const a of g.aneis) for (let i = 0; i + 1 < a.length; i++) s.push([a[i], a[i + 1]]);
  }
  return s;
}
/** Pior distância (m) de um vértice de `de` até a geometria `ate`. */
function piorDistancia(de: Geometria[], ate: Geometria[]): number {
  const segs = segmentosDe(ate);
  if (segs.length === 0) return 0;
  let pior = 0;
  for (const g of de) {
    for (const p of pontosDe(g)) {
      let min = Infinity;
      for (const [a, b] of segs) {
        const d = distSegmento(p, a, b);
        if (d < min) min = d;
        if (min === 0) break;
      }
      if (min > pior) pior = min;
    }
  }
  return pior;
}
const comprimentoDe = (gs: Geometria[]): number => gs.reduce((s, g) => s + (g.t === 'linha' && g.pts.length >= 2 ? G.comprimento(G.linha(g.pts)) : 0), 0);

// ---- tipo esperado pelo nome da camada (o nome já vem normalizado) ----
function tipoEsperado(norm: string): TipoCamada | null {
  if (/poligono/.test(norm)) return 'poligono';
  if (/\brede\b/.test(norm)) return 'linha';
  if (/poste|\bpoda|supress|\buc\b|trafo/.test(norm)) return 'ponto';
  if (/\bapp\b|limpeza/.test(norm)) return 'poligono';
  return null;
}
const ehRede = (norm: string): boolean => tipoEsperado(norm) === 'linha';
const ehUnificado = (norm: string): boolean => /unificado/.test(norm);

interface CamadaKml { caminho: string; base: string; norm: string; geo: Geometria[]; ilegivel: boolean }
interface CamadaShp {
  base: string;
  norm: string;
  arquivos: Partial<Record<ExtShp, ArquivoZip>>;
  caminhos: string[];
  geo: Geometria[] | null;
  tipo: TipoCamada | null;
  ilegivel: boolean;
}

const iguais = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

function lerCamadaKml(a: ArquivoZip): CamadaKml {
  const base = semExtensao(nomeDoCaminho(a.caminho));
  let feicoes: Feicao[] = [];
  let ilegivel = false;
  try {
    feicoes = lerKml(a.bytes);
  } catch {
    ilegivel = true;
  }
  return { caminho: a.caminho, base, norm: nomeNormalizado(base), geo: feicoes.flatMap((f) => f.geometrias), ilegivel };
}

const prjSirgas24S = (prj: string): boolean => /SIRGAS/i.test(prj) && prj.includes('-39') && prj.includes('10000000');

const emGraus = (g: Geometria): Geometria =>
  g.t === 'ponto'
    ? { t: 'ponto', p: paraUtm(g.p[0], g.p[1]) }
    : g.t === 'linha'
      ? { t: 'linha', pts: g.pts.map(([x, y]) => paraUtm(x, y)) }
      : { t: 'poligono', aneis: g.aneis.map((an) => an.map(([x, y]) => paraUtm(x, y))) };

function lerCamadaShp(arquivos: ArquivoZip[]): CamadaShp {
  const por: CamadaShp['arquivos'] = {};
  for (const a of arquivos) por[extensao(a.caminho) as ExtShp] = a;
  const base = semExtensao(nomeDoCaminho(arquivos[0].caminho));
  const c: CamadaShp = { base, norm: nomeNormalizado(base), arquivos: por, caminhos: arquivos.map((a) => a.caminho), geo: null, tipo: null, ilegivel: false };
  if (!por.shp) return c;
  try {
    const cpg = por.cpg ? new TextDecoder().decode(por.cpg.bytes) : null;
    const lido = lerShp(por.shp.bytes, por.dbf?.bytes ?? null, cpg);
    c.tipo = lido.tipo;
    let geo = lido.feicoes.flatMap((f) => f.geometrias);
    const prj = por.prj ? new TextDecoder().decode(por.prj.bytes) : null;
    const todos = geo.flatMap(pontosDe);
    // com .prj: graus só se for geográfico (sem PROJCS); sem .prj: pelo tamanho dos números
    const graus = prj !== null ? /GEOGCS/i.test(prj) && !/PROJCS/i.test(prj) : todos.length > 0 && todos.every(([x, y]) => Math.abs(x) <= 180 && Math.abs(y) <= 90);
    if (graus) geo = geo.map(emGraus);
    c.geo = geo;
  } catch {
    c.ilegivel = true;
  }
  return c;
}

const item = (nivel: Nivel, codigo: string, titulo: string, porque: string, comoCorrigir: string, arquivos: string[] = []): ItemConferencia => ({ nivel, codigo, titulo, porque, comoCorrigir, arquivos });
const verde = (codigo: string, titulo: string, porque: string): ItemConferencia => item('verde', codigo, titulo, porque, 'Nada a corrigir.');

const fm = (n: number): string => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** Confere o zip espacial de um kit já pronto. Vermelhos primeiro, depois amarelos, depois verdes. */
export function conferirZip(bytes: Uint8Array, dxf?: Uint8Array): ItemConferencia[] {
  let todos: ArquivoZip[];
  try {
    todos = abrirZip(bytes);
  } catch {
    return [item('vermelho', 'ZIP', 'Este arquivo não é um zip', 'O órgão não consegue abrir o arquivo, então o kit não é analisado.', 'Baixe o kit de novo, ou refaça o zip no site, e envie o arquivo .zip inteiro.')];
  }
  const arquivos = todos.filter((a) => !/(^|\/)__MACOSX\//.test(a.caminho) && !nomeDoCaminho(a.caminho).startsWith('._') && nomeDoCaminho(a.caminho).toLowerCase() !== 'thumbs.db');
  const itens: ItemConferencia[] = [];

  // ---- separa KMLs e grupos de SHP (mesma pasta, mesmo nome), sem repetir cópia idêntica de KML ----
  const kmls: CamadaKml[] = [];
  const grupos = new Map<string, ArquivoZip[]>();
  const vistosKml: { norm: string; bytes: Uint8Array }[] = [];
  for (const a of arquivos) {
    const ext = extensao(a.caminho);
    if (ext === 'kml' || ext === 'kmz') {
      const c = lerCamadaKml(a);
      if (vistosKml.some((v) => v.norm === c.norm && iguais(v.bytes, a.bytes))) continue;
      vistosKml.push({ norm: c.norm, bytes: a.bytes });
      kmls.push(c);
    } else if ((EXTS_SHP as readonly string[]).includes(ext)) {
      const chave = `${pastaDoCaminho(a.caminho)}/${semExtensao(nomeDoCaminho(a.caminho))}`.toLowerCase();
      grupos.set(chave, [...(grupos.get(chave) ?? []), a]);
    }
  }
  const shps = [...grupos.values()].map(lerCamadaShp);
  if (kmls.length === 0 && shps.length === 0) {
    return [item('vermelho', 'ZIP', 'O zip não tem nenhuma camada', 'Sem KML e sem shapefile o órgão não tem o que analisar.', 'Envie o zip do kit com as pastas KML e SHAPEFILE.')];
  }

  for (const k of kmls) if (k.ilegivel) itens.push(item('vermelho', 'KML', `KML que não abre: ${k.base}`, 'O órgão não consegue abrir este KML.', 'Grave o KML de novo.', [k.caminho]));
  for (const s of shps) if (s.ilegivel) itens.push(item('vermelho', 'SHP_INCOMPLETO', `Shapefile que não abre: ${s.base}`, 'O órgão não consegue ler este shapefile.', 'Grave o shapefile de novo.', s.caminhos));

  // ---- SHP_INCOMPLETO ----
  let incompletos = 0;
  for (const s of shps) {
    const faltam = EXTS_SHP.filter((e) => !s.arquivos[e]);
    const graves = faltam.filter((e) => e !== 'cpg');
    if (graves.length) {
      incompletos++;
      const lista = graves.map((e) => '.' + e).join(', ');
      itens.push(item('vermelho', 'SHP_INCOMPLETO', `Shapefile incompleto: ${s.base} (falta ${lista})`,
        'O órgão devolve o shapefile que não tem os arquivos juntos: sem eles o programa dele não abre a camada ou a abre sem lugar.',
        `Grave o shapefile de novo e envie ${lista} junto com os outros, na mesma pasta e com o mesmo nome.`, s.caminhos));
    } else if (faltam.length) {
      incompletos++;
      itens.push(item('amarelo', 'SHP_INCOMPLETO', `Falta o .cpg: ${s.base}`,
        'Sem o .cpg o órgão pode ler os acentos dos nomes errado, mas o desenho abre.', 'Inclua o arquivo .cpg (com o texto UTF-8) junto do shapefile.', s.caminhos));
    }
  }
  if (incompletos === 0 && shps.length) itens.push(verde('SHP_INCOMPLETO', 'Shapefiles completos', `Os ${shps.length} shapefiles têm .shp, .shx, .dbf, .prj e .cpg.`));

  // ---- PAR: primeiro pelo nome, depois pela geometria ----
  const pares: { k: CamadaKml; s: CamadaShp }[] = [];
  const kLivres = [...kmls];
  const sLivres: CamadaShp[] = [];
  for (const s of shps) {
    const i = kLivres.findIndex((k) => k.norm === s.norm);
    if (i >= 0) pares.push({ k: kLivres.splice(i, 1)[0], s });
    else sLivres.push(s);
  }
  const sSemPar: CamadaShp[] = [];
  for (const s of sLivres) {
    const cs = s.geo ? caixaDe(s.geo) : null;
    const i = cs ? kLivres.findIndex((k) => caixasIguais(caixaDe(k.geo), cs)) : -1;
    if (i >= 0) pares.push({ k: kLivres.splice(i, 1)[0], s });
    else sSemPar.push(s);
  }
  let problemasPar = 0;
  for (const k of kLivres) {
    problemasPar++;
    itens.push(item('vermelho', 'PAR', `Camada só no KML, sem shapefile: ${k.base}`,
      'O órgão confere o KML contra o shapefile; camada sem o outro lado ele devolve.', 'Grave o shapefile dessa camada (com o mesmo nome do KML) ou tire o KML que sobrou.', [k.caminho]));
  }
  for (const s of sSemPar) {
    if (!s.arquivos.shp) continue; // sem .shp não há camada: a falta já saiu em SHP_INCOMPLETO
    const cs = s.geo ? caixaDe(s.geo) : null;
    const repetido = !!cs && shps.some((o) => o !== s && o.geo !== null && s.geo !== null && caixasIguais(caixaDe(o.geo), cs) && nVertices(o.geo) === nVertices(s.geo) && o.tipo === s.tipo);
    problemasPar++;
    if (repetido) {
      itens.push(item('amarelo', 'PAR', `Arquivo repetido: ${s.base}`,
        'Este shapefile tem o mesmo desenho de outro do kit e não tem KML. O órgão pode estranhar a cópia.', 'Apague o shapefile repetido do zip.', s.caminhos));
    } else {
      itens.push(item('vermelho', 'PAR', `Camada só no shapefile, sem KML: ${s.base}`,
        'O órgão confere o shapefile contra o KML; camada sem o outro lado ele devolve.', 'Grave o KML dessa camada (com o mesmo nome do shapefile) ou tire o shapefile que sobrou.', s.caminhos));
    }
  }
  if (problemasPar === 0) itens.push(verde('PAR', 'Cada camada tem KML e shapefile', `As ${pares.length} camadas fazem par.`));

  // ---- UNIFICADO ----
  const unifKml = kmls.some((k) => ehUnificado(k.norm));
  const unifShp = shps.some((s) => ehUnificado(s.norm));
  if (!unifKml) itens.push(item('vermelho', 'UNIFICADO', 'Falta o KML unificado', 'O órgão pede um arquivo com todas as camadas juntas, chamado UNIFICADO.', 'Junte todas as camadas num KML com UNIFICADO no nome, na pasta KML.'));
  if (!unifShp) itens.push(item('vermelho', 'UNIFICADO', 'Falta o shapefile unificado', 'O órgão pede um shapefile com todas as camadas juntas, chamado UNIFICADO.', 'Junte as camadas num shapefile com UNIFICADO no nome, na pasta SHAPEFILE.'));
  if (unifKml && unifShp) itens.push(verde('UNIFICADO', 'Unificado nos dois formatos', 'Tem o KML e o shapefile UNIFICADO.'));

  // ---- PRJ ----
  let prjRuins = 0;
  for (const s of shps) {
    if (!s.arquivos.prj) continue; // a falta já saiu em SHP_INCOMPLETO
    if (!prjSirgas24S(new TextDecoder().decode(s.arquivos.prj.bytes))) {
      prjRuins++;
      itens.push(item('amarelo', 'PRJ', `Sistema de coordenadas diferente: ${s.base}`,
        'O padrão do órgão é SIRGAS 2000 UTM 24 Sul. Em outro sistema o shapefile pode cair em outro lugar no mapa deles.',
        'Grave o shapefile em SIRGAS 2000 UTM zona 24 Sul (EPSG:31984), ou troque o .prj pelo de um kit aprovado.', [s.arquivos.prj.caminho]));
    }
  }
  if (prjRuins === 0 && shps.some((s) => s.arquivos.prj)) itens.push(verde('PRJ', 'Sistema de coordenadas certo', 'Os .prj são SIRGAS 2000 UTM 24 Sul.'));

  // ---- NO_LUGAR ----
  let piorGeral = 0;
  let foraDoLugar = 0;
  let conferidos = 0;
  for (const { k, s } of pares) {
    if (!s.geo || s.geo.length === 0 || k.geo.length === 0) continue;
    conferidos++;
    const d = piorDistancia(s.geo, k.geo);
    piorGeral = Math.max(piorGeral, d);
    const arqs = [k.caminho, ...s.caminhos];
    if (d > TOL_AMARELO) {
      foraDoLugar++;
      itens.push(item('vermelho', 'NO_LUGAR', `Shapefile fora do lugar: ${s.base} (${fm(d)} m)`, TEXTOS.shpDeslocado,
        'Grave o shapefile de novo a partir do mesmo desenho do KML, em SIRGAS 2000 UTM 24 Sul, sem mover nada.', arqs));
    } else if (d > TOL_PAR) {
      foraDoLugar++;
      itens.push(item('amarelo', 'NO_LUGAR', `Shapefile um pouco deslocado: ${s.base} (${fm(d)} m)`,
        'O shapefile está a mais de 5 m do KML. O órgão tolera pouco, e acima de 20 m ele devolve.', 'Grave o shapefile de novo a partir do mesmo desenho do KML.', arqs));
    }
  }
  if (conferidos > 0 && foraDoLugar === 0) itens.push(verde('NO_LUGAR', 'Shapefiles no lugar do KML', `O pior vértice fica a ${fm(piorGeral)} m do KML (limite 5 m).`));

  // ---- TIPO (o unificado fica fora) ----
  let tiposRuins = 0;
  let tiposConferidos = 0;
  const checaTipo = (nome: string, norm: string, real: TipoCamada | null, caminhos: string[]): void => {
    if (ehUnificado(norm)) return;
    const esperado = tipoEsperado(norm);
    if (!esperado || !real) return;
    tiposConferidos++;
    if (real === esperado) return;
    tiposRuins++;
    const rotulo = nome.replace(/^\s*\d{8,10}[\s_-]*/, '');
    itens.push(item('vermelho', 'TIPO', `${rotulo} desenhada como ${NOME_TIPO[real]}, devia ser ${NOME_TIPO[esperado]}`,
      'O órgão lê cada camada pelo tipo de desenho: rede é linha; poste, poda, supressão, UC e trafo são ponto; APP, limpeza e polígono são área. Com o tipo trocado ele não calcula o que precisa.',
      `Desenhe a camada como ${NOME_TIPO[esperado]} e grave o KML e o shapefile de novo.`, caminhos));
  };
  for (const k of kmls) {
    const ts = [...new Set(k.geo.map((g) => g.t))];
    const esperado = tipoEsperado(k.norm);
    checaTipo(k.base, k.norm, ts.length === 0 ? null : ts.find((t) => t !== esperado) ?? ts[0], [k.caminho]);
  }
  for (const s of shps) checaTipo(s.base, s.norm, s.tipo, s.caminhos);
  if (tiposRuins === 0 && tiposConferidos > 0) itens.push(verde('TIPO', 'Tipos de desenho certos', `As ${tiposConferidos} camadas conferidas estão como ponto, linha ou polígono, conforme o nome.`));

  // ---- COMPRIMENTO (rede nova) ----
  const redesKml = kmls.filter((k) => ehRede(k.norm) && !ehUnificado(k.norm));
  const redesShp = shps.filter((s) => ehRede(s.norm) && !ehUnificado(s.norm) && s.geo !== null);
  const cKml = redesKml.reduce((s, k) => s + comprimentoDe(k.geo), 0);
  const cShp = redesShp.reduce((s, x) => s + comprimentoDe(x.geo ?? []), 0);
  let cDxf: number | null = null;
  if (dxf) {
    try {
      cDxf = redeNova(proporRedeDxf(lerDxfGeometria(dxf))).reduce((s, v) => s + comprimentoDe([{ t: 'linha', pts: v.pts }]), 0);
    } catch {
      itens.push(item('vermelho', 'DXF', 'O DXF não abre', 'Sem o DXF não dá para conferir os metros do kit contra o projeto.', 'Envie o DXF do projeto, gravado de novo pelo CAD.'));
    }
  }
  const medidas: { nome: string; v: number }[] = [];
  if (redesKml.length) medidas.push({ nome: 'KML', v: cKml });
  if (redesShp.length) medidas.push({ nome: 'shapefile', v: cShp });
  if (cDxf !== null) medidas.push({ nome: 'DXF', v: cDxf });
  if (medidas.length >= 2) {
    const [ref, ...outras] = medidas;
    let ruim = false;
    for (const o of outras) {
      const tol = Math.max(1, 0.005 * Math.max(ref.v, o.v));
      if (Math.abs(ref.v - o.v) > tol) {
        ruim = true;
        itens.push(item('vermelho', 'COMPRIMENTO', `Metros da rede diferentes: ${ref.nome} ${fm(ref.v)} m, ${o.nome} ${fm(o.v)} m`,
          'O órgão soma os metros da rede em cada arquivo e devolve o kit quando os números não batem (aceita até 1 m ou 0,5%).',
          'Veja qual arquivo tem vão a mais ou a menos e grave o kit de novo a partir do mesmo desenho.', [...redesKml.map((k) => k.caminho), ...redesShp.flatMap((s) => s.caminhos)]));
      }
    }
    if (!ruim) itens.push(verde('COMPRIMENTO', 'Metros da rede batem', medidas.map((x) => `${x.nome} ${fm(x.v)} m`).join(', ') + '.'));
  }

  // ---- DOCUMENTOS (pelo nome do arquivo, em qualquer pasta) ----
  const lista = arquivos
    .filter((a) => !EXTS_ESPACIAIS.has(extensao(a.caminho)))
    .map((a) => ({ texto: semAcento(nomeDoCaminho(a.caminho)).toUpperCase().replace(/[_-]+/g, ' '), ext: extensao(a.caminho) }));
  const tem = (re: RegExp, exts?: string[]): boolean => lista.some((d) => re.test(d.texto) && (!exts || exts.includes(d.ext)));
  const exigidos: { nome: string; ok: boolean; nivel: Nivel; porque: string; como: string }[] = [
    { nome: 'Memorial descritivo', ok: tem(/MEMORIAL/), nivel: 'vermelho', porque: 'O memorial descreve a intervenção que o órgão avalia; sem ele o processo não anda.', como: 'Inclua o memorial no zip, com MEMORIAL no nome do arquivo.' },
    { nome: 'ART', ok: tem(/\bART\b/), nivel: 'vermelho', porque: 'O órgão exige a ART do responsável técnico.', como: 'Inclua a ART no zip, com ART no nome do arquivo.' },
    { nome: 'CVT', ok: tem(/\bCVT\b/), nivel: 'vermelho', porque: 'O órgão exige a CVT junto do pedido.', como: 'Inclua a CVT no zip, com CVT no nome do arquivo.' },
    { nome: 'Planta em DWG', ok: tem(/PLANTA/, ['dwg']), nivel: 'vermelho', porque: 'O órgão pede a planta nos dois formatos, DWG e PDF.', como: 'Inclua a planta em DWG, com PLANTA no nome.' },
    { nome: 'Planta em PDF', ok: tem(/PLANTA/, ['pdf']), nivel: 'vermelho', porque: 'O órgão pede a planta nos dois formatos, DWG e PDF.', como: 'Inclua a planta em PDF, com PLANTA no nome.' },
    { nome: 'Projeto (CAD) em DWG', ok: tem(/CAD(?!ASTR)/, ['dwg']), nivel: 'vermelho', porque: 'O órgão pede o projeto nos dois formatos, DWG e PDF.', como: 'Inclua o projeto em DWG, com CAD no nome.' },
    { nome: 'Projeto (CAD) em PDF', ok: tem(/CAD(?!ASTR)/, ['pdf']), nivel: 'vermelho', porque: 'O órgão pede o projeto nos dois formatos, DWG e PDF.', como: 'Inclua o projeto em PDF, com CAD no nome.' },
    { nome: 'Planilha Padrão', ok: tem(/PLANILHA/), nivel: 'amarelo', porque: 'O órgão costuma pedir a Planilha Padrão com os números da intervenção.', como: 'Inclua a Planilha Padrão, com PLANILHA no nome.' },
    { nome: 'Documento de regularidade do cliente', ok: tem(/REGULARIDADE|CCU|TITULO|ESCRITURA|CONTRATO DE CONCESS/), nivel: 'amarelo', porque: 'O órgão pede o documento que prova a regularidade do terreno ou do cliente (CCU, título, escritura ou contrato de concessão).', como: 'Inclua o documento, com REGULARIDADE, CCU, TÍTULO, ESCRITURA ou CONTRATO DE CONCESSÃO no nome.' },
  ];
  const faltas = exigidos.filter((o) => !o.ok);
  for (const o of faltas) itens.push(item(o.nivel, 'DOCUMENTOS', `Falta: ${o.nome}`, o.porque, o.como));
  if (faltas.length === 0) itens.push(verde('DOCUMENTOS', 'Documentos todos no zip', 'Memorial, ART, CVT, planta, projeto, planilha e documento de regularidade foram achados.'));

  const ordem: Record<Nivel, number> = { vermelho: 0, amarelo: 1, verde: 2 };
  return itens.map((x, i) => ({ x, i })).sort((a, b) => ordem[a.x.nivel] - ordem[b.x.nivel] || a.i - b.i).map((e) => e.x);
}
