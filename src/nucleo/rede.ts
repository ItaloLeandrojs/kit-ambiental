// Proposta da rede nova e dos postes, a partir do DXF (ou do KML).
// As medidas são as linhas como estão desenhadas: o site não emenda a folga do símbolo do poste.
// Ids: vão = v<n>, n = ordem do lado no arquivo, contando todas as camadas (o id não muda ao incluir uma camada);
// poste = p<n>, n = ordem do INSERT de poste no arquivo.
import type { CotaDxf, DxfGeo, TextoDxf } from './dxf.ts';
import { G } from './geom.ts';
import type { Feicao, Poste, Pt, Rede, Situacao, TipoRede, Vao } from './tipos.ts';

// Três regras decididas pelo Italo em 14/11/2026, depois de ver os DXFs reais:
// (1) azul solto e sem etiqueta é legenda, não rede nova; (2) cota sem pontas casando acha o vão pelo meio e pelo comprimento;
// (3) poste novo nasce do próprio texto (1)xxx/yy quando não há símbolo de poste perto.
const TOL_PONTA_COTA = 2; // m: pontas da cota até o vão
const TOL_TOCA_VAO = 1; // m: ponta de vão azul encostando em outro vão
const TOL_TOCA_POSTE = 2; // m: ponta de vão azul perto de um poste
const TOL_MEIO_COTA = 15; // m: meio da cota até o meio do vão (cota sem pontas casando)
const TOL_MEDIDA_COTA = 0.5; // m: |medida da cota - comprimento do vão|
const RAIO_TEXTO_POSTE = 30; // m: texto (1)xxx/yy até o símbolo do poste, ou até o vão onde nasce o poste

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '').toUpperCase();
const RE_CAMADA_REDE = /^(LINHA|REDE)?[-_]?(MT|BT)$/;
const RE_ETIQUETA_CABO = /^(\(\d\)|\/\d\/)?\s*\d?[A-Z]{1,3}\d{3}/;
const RE_PREFIXO = /^\s*(?:\((\d)\)|\/(\d)\/)/;
const RE_POSTE_NOVO = /^\(1\)\s*\d{3,4}\/\d{1,2}/;
const RE_COORD = /\(\s*(\d+)\s*,\s*(\d+)\s*\)/;
const SITUACAO: Record<string, Situacao> = { '1': 'novo', '2': 'realocado', '3': 'retirado' };

const tipoDaCamada = (camada: string): TipoRede | null => {
  const m = RE_CAMADA_REDE.exec(sem(camada));
  return m ? (m[2] as TipoRede) : null;
};

const prefixo = (s: string): Situacao | null => {
  const m = RE_PREFIXO.exec(s);
  return m ? (SITUACAO[m[1] ?? m[2]] ?? 'existente') : null;
};

interface Lado { id: string; camada: string; cor: number | null; pts: [Pt, Pt] }

// todos os lados de todas as linhas, com id estável
function lados(d: DxfGeo): Lado[] {
  const r: Lado[] = [];
  let n = 0;
  for (const l of d.linhas) {
    for (let i = 0; i + 1 < l.pts.length; i++) r.push({ id: `v${++n}`, camada: l.camada, cor: l.cor, pts: [l.pts[i], l.pts[i + 1]] });
  }
  return r;
}

// distância do ponto ao segmento e se a projeção cai dentro dele
function noSegmento(p: Pt, [a, b]: [Pt, Pt]): { dist: number; dentro: boolean } {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const c = dx * dx + dy * dy;
  const t = c === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / c;
  const u = Math.max(0, Math.min(1, t));
  return { dist: Math.hypot(p[0] - (a[0] + u * dx), p[1] - (a[1] + u * dy)), dentro: t >= 0 && t <= 1 };
}

const distP = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function prefixoDaCota(c: CotaDxf): Situacao | null {
  const m = prefixo(c.modelo);
  if (m) return m;
  const e = /^\s*([123])\./.exec(c.estilo);
  return e ? SITUACAO[e[1]] : null;
}

function marcaCota(r: Map<string, { situacao: Situacao; motivo: string }>, id: string, c: CotaDxf) {
  const s = prefixoDaCota(c);
  r.set(id, s ? { situacao: s, motivo: `cota ${c.modelo}` } : { situacao: 'existente', motivo: 'cota sem prefixo' });
}

function etiquetar(d: DxfGeo, ls: Lado[]): Map<string, { situacao: Situacao; motivo: string }> {
  const r = new Map<string, { situacao: Situacao; motivo: string }>();
  // cota: primeiro pelas pontas (vão mais perto, até TOL_PONTA_COTA); vence a etiqueta de texto
  const semPontas: CotaDxf[] = [];
  for (const c of d.cotas) {
    let alvo: { l: Lado; dist: number } | null = null;
    for (const l of ls) {
      const direto = Math.max(distP(c.p1, l.pts[0]), distP(c.p2, l.pts[1]));
      const trocado = Math.max(distP(c.p1, l.pts[1]), distP(c.p2, l.pts[0]));
      const dist = Math.min(direto, trocado);
      if (dist <= TOL_PONTA_COTA && (!alvo || dist < alvo.dist)) alvo = { l, dist };
    }
    if (!alvo) { semPontas.push(c); continue; }
    if (r.has(alvo.l.id)) continue;
    marcaCota(r, alvo.l.id, c);
  }
  // sem pontas casando: o vão livre de meio mais perto do meio da cota, com o mesmo comprimento
  for (const c of semPontas) {
    const meio: Pt = [(c.p1[0] + c.p2[0]) / 2, (c.p1[1] + c.p2[1]) / 2];
    let alvo: { l: Lado; dist: number } | null = null;
    for (const l of ls) {
      if (r.has(l.id)) continue;
      const m: Pt = [(l.pts[0][0] + l.pts[1][0]) / 2, (l.pts[0][1] + l.pts[1][1]) / 2];
      const dist = distP(meio, m);
      if (dist <= TOL_MEIO_COTA && Math.abs(c.medida - distP(l.pts[0], l.pts[1])) <= TOL_MEDIDA_COTA && (!alvo || dist < alvo.dist)) alvo = { l, dist };
    }
    if (alvo) marcaCota(r, alvo.l.id, c);
  }
  // texto de cabo: vai para o vão mais perto (até 8 m, projeção dentro do segmento); cada vão guarda o texto mais perto
  const melhor = new Map<string, { dist: number; t: TextoDxf }>();
  for (const t of d.textos) {
    const primeira = t.linhas[0] ?? '';
    if (!RE_ETIQUETA_CABO.test(primeira)) continue;
    let alvo: { l: Lado; dist: number } | null = null;
    for (const l of ls) {
      const { dist, dentro } = noSegmento(t.ponto, l.pts);
      if (dentro && dist <= 8 && (!alvo || dist < alvo.dist)) alvo = { l, dist };
    }
    if (!alvo) continue;
    const atual = melhor.get(alvo.l.id);
    if (!atual || alvo.dist < atual.dist) melhor.set(alvo.l.id, { dist: alvo.dist, t });
  }
  for (const [id, { t }] of melhor) {
    if (r.has(id)) continue;
    const s = prefixo(t.linhas[0]);
    r.set(id, s ? { situacao: s, motivo: `etiqueta ${t.linhas[0]}` } : { situacao: 'existente', motivo: 'etiqueta sem prefixo' });
  }
  return r;
}

// `todos`: os lados da rede (para ver se um vão azul encosta em outro); `postes`: pontos dos símbolos de poste
function paraVaos(d: DxfGeo, ls: Lado[], tipoDe: (l: Lado) => TipoRede | null, todos: { id: string; pts: Pt[] }[], postes: Pt[]): Vao[] {
  const et = etiquetar(d, ls);
  const solto = (l: Lado) =>
    l.pts.every((e) =>
      !todos.some((o) => o.id !== l.id && o.pts.some((q) => distP(e, q) <= TOL_TOCA_VAO)) &&
      !postes.some((q) => distP(e, q) <= TOL_TOCA_POSTE));
  return ls.map((l) => {
    const e = et.get(l.id);
    let situacao: Situacao, motivo: string;
    if (e) ({ situacao, motivo } = e);
    else if (l.cor === 5 && solto(l)) { situacao = 'existente'; motivo = 'azul solto, sem etiqueta (parece legenda)'; }
    else if (l.cor === 5) { situacao = 'novo'; motivo = 'azul, sem etiqueta'; }
    else { situacao = 'existente'; motivo = 'sem etiqueta'; }
    return { id: l.id, pts: [l.pts[0], l.pts[1]], camada: l.camada, tipo: tipoDe(l), situacao, motivo };
  });
}

// fração de `a` que fica a até 1,5 m de `b`
function fracaoJunto(a: Pt[], b: Pt[]): number {
  const c = G.comprimento(G.linha(a));
  if (c === 0) return 0;
  const dentro = G.dentro(a, G.engrossa(G.linha(b), 1.5)).reduce((s, p) => s + G.comprimento(G.linha(p)), 0);
  return dentro / c;
}

// MT novo e BT novo correndo juntos (1,5 m em 90% do comprimento, nos dois sentidos) viram um vão CONJ com a geometria do MT.
// Cada vão entra em no máximo um par.
function juntarConjugadas(vaos: Vao[]): Vao[] {
  const novo = (v: Vao, t: TipoRede) => v.situacao === 'novo' && v.tipo === t;
  const bts = vaos.filter((v) => novo(v, 'BT'));
  const usados = new Set<string>();
  const conj = new Map<string, Vao>();
  for (const mt of vaos.filter((v) => novo(v, 'MT'))) {
    let melhor: { bt: Vao; f: number } | null = null;
    for (const bt of bts) {
      if (usados.has(bt.id)) continue;
      const f = Math.min(fracaoJunto(bt.pts, mt.pts), fracaoJunto(mt.pts, bt.pts));
      if (f >= 0.9 && (!melhor || f > melhor.f)) melhor = { bt, f };
    }
    if (!melhor) continue;
    usados.add(melhor.bt.id);
    conj.set(mt.id, { ...mt, tipo: 'CONJ', motivo: `${mt.motivo}; conjugada com ${melhor.bt.id}` });
  }
  return vaos.filter((v) => !usados.has(v.id)).map((v) => conj.get(v.id) ?? v);
}

function postesDoDxf(d: DxfGeo, ls: Lado[]): Poste[] {
  const postes: Poste[] = d.blocos
    .filter((b) => sem(b.camada).includes('POSTE'))
    .map((b, i) => ({ id: `p${i + 1}`, ponto: b.ponto, numero: null, novo: false, coordEscrita: null, etiqueta: null }));
  const simbolos = postes.length;
  let n = simbolos;
  for (const t of d.textos) {
    if (!t.linhas.some((l) => RE_POSTE_NOVO.test(l))) continue;
    let p: Poste | null = null;
    let dmin = Infinity;
    for (const q of postes.slice(0, simbolos)) {
      const dist = distP(q.ponto, t.ponto);
      if (dist <= RAIO_TEXTO_POSTE && dist < dmin) { p = q; dmin = dist; }
    }
    if (!p) {
      // sem símbolo perto: nasce na ponta mais perto do vão mais perto (até 30 m), senão no ponto do texto
      let ponto: Pt = t.ponto;
      let vmin = Infinity;
      for (const l of ls) {
        const { dist } = noSegmento(t.ponto, l.pts);
        if (dist <= RAIO_TEXTO_POSTE && dist < vmin) {
          vmin = dist;
          ponto = distP(t.ponto, l.pts[0]) <= distP(t.ponto, l.pts[1]) ? l.pts[0] : l.pts[1];
        }
      }
      p = { id: `p${++n}`, ponto, numero: null, novo: false, coordEscrita: null, etiqueta: null };
      postes.push(p);
    }
    p.novo = true;
    p.etiqueta = t.ponto;
    const ultima = /^P?(\d+)$/i.exec((t.linhas[t.linhas.length - 1] ?? '').trim());
    p.numero = ultima ? ultima[1] : null;
    for (const l of t.linhas) {
      const m = RE_COORD.exec(l);
      if (m) { p.coordEscrita = [Number(m[1]), Number(m[2])]; break; }
    }
  }
  return postes;
}

export function proporRedeDxf(d: DxfGeo): Rede {
  const ls = lados(d).filter((l) => tipoDaCamada(l.camada) !== null);
  const postes = postesDoDxf(d, ls);
  const simbolos = d.blocos.filter((b) => sem(b.camada).includes('POSTE')).map((b) => b.ponto);
  return { origem: 'dxf', vaos: juntarConjugadas(paraVaos(d, ls, (l) => tipoDaCamada(l.camada), ls, simbolos)), postes };
}

// camadas com linhas que não são de rede: o projetista pode incluí-las
export function camadasCandidatas(d: DxfGeo): string[] {
  return [...new Set(d.linhas.filter((l) => l.pts.length > 1 && tipoDaCamada(l.camada) === null).map((l) => l.camada))].sort();
}

export function incluirCamada(r: Rede, d: DxfGeo, camada: string, tipo: TipoRede): Rede {
  const ls = lados(d).filter((l) => l.camada === camada);
  const ids = new Set(r.vaos.map((v) => v.id));
  const simbolos = d.blocos.filter((b) => sem(b.camada).includes('POSTE')).map((b) => b.ponto);
  const novos = paraVaos(d, ls, () => tipo, [...r.vaos, ...ls], simbolos).filter((v) => !ids.has(v.id));
  return { ...r, vaos: juntarConjugadas([...r.vaos, ...novos]) };
}

export function marcarVao(r: Rede, id: string, mudanca: { tipo?: TipoRede | null; situacao?: Situacao }): Rede {
  return {
    ...r,
    vaos: r.vaos.map((v) => {
      if (v.id !== id) return v;
      const n: Vao = { ...v, pts: v.pts.map((p) => [...p] as Pt), motivo: 'definido pelo projetista' };
      if (mudanca.tipo !== undefined) n.tipo = mudanca.tipo;
      if (mudanca.situacao !== undefined) n.situacao = mudanca.situacao;
      return n;
    }),
    postes: r.postes,
  };
}

export const redeNova = (r: Rede): Vao[] => r.vaos.filter((v) => v.situacao === 'novo' && v.tipo !== null);

export function proporRedeKml(f: Feicao[]): Rede {
  const vaos: Vao[] = [];
  const postes: Poste[] = [];
  let nv = 0, np = 0;
  for (const x of f) {
    const rotulo = [...x.pasta, x.nome].join(' ');
    for (const g of x.geometrias) {
      if (g.t === 'linha') {
        const tipo: TipoRede | null = /CONJUG|MT ?BT|MT-BT/i.test(rotulo) ? 'CONJ' : /\bMT\b/i.test(rotulo) ? 'MT' : /\bBT\b/i.test(rotulo) ? 'BT' : null;
        vaos.push({ id: `v${++nv}`, pts: g.pts, camada: x.pasta.concat(x.nome).join('/'), tipo, situacao: 'novo', motivo: 'linha do KML' });
      } else if (g.t === 'ponto' && /POSTE/i.test(x.nome)) {
        postes.push({ id: `p${++np}`, ponto: g.p, numero: null, novo: true, coordEscrita: null, etiqueta: null });
      }
    }
  }
  return { origem: 'kml', vaos, postes };
}
