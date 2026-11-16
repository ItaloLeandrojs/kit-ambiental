// Mapa SVG em coordenada UTM (y invertido), com arrastar e roda do mouse para zoom.
// Mostra os vãos (cor por tipo e situação), os postes, os contornos das áreas a até 1 km e as estradas da base.
// Tamanhos de traço são em pixels (vector-effect), nunca em metros.
import { ehAgua } from '../nucleo/areas.ts';
import type { Aresta, Janela } from '../nucleo/base.ts';
import type { Poste, Pt, Rede, Vao } from '../nucleo/tipos.ts';
import type { Retrato } from './estado.ts';

export interface AcoesMapa {
  marcarVao(id: string): void;
  /** Clique no mapa com um modo ativo (árvore sem GPS ou limpeza de faixa), em UTM. */
  clicarNoMapa?(p: Pt): void;
  /** Duplo clique: fecha a limpeza de faixa. */
  fecharLimpeza?(): void;
}
export type EntradaMapa = Pick<Retrato, 'base' | 'rede'> & Partial<Pick<Retrato, 'apps' | 'arvores' | 'limpeza' | 'modoMapa'>>;
export interface Mapa {
  elemento: SVGSVGElement;
  atualizar(r: EntradaMapa): void;
  definirEstradas(arestas: Aresta[]): void;
  ajustar(): void;
}

const NS = 'http://www.w3.org/2000/svg';
const RAIO_AREAS = 1000; // m: áreas com a caixa a até isso da rede entram no mapa
const PASSO_MIN = 2; // m: vértices mais perto que isso saem do desenho (contornos enormes)
const LIMITE_ARRASTO = 4; // px: menos que isso ainda é clique
const ASPECTO_PADRAO = 0.7;

type Caixa = [number, number, number, number];

function el(tag: string, attrs: Record<string, string | number> = {}, filhos: (Node | string)[] = []): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  for (const f of filhos) e.append(f);
  return e as SVGElement;
}
const titulo = (t: string) => el('title', {}, [t]);

// y vai negado: o SVG cresce para baixo e o norte fica em cima
const ponto = (p: Pt): string => `${p[0].toFixed(2)},${(-p[1]).toFixed(2)}`;
const pontos = (ps: Pt[]): string => ps.map(ponto).join(' ');

function alivia(anel: Pt[]): Pt[] {
  const r: Pt[] = [];
  for (const p of anel) {
    const u = r[r.length - 1];
    if (!u || Math.hypot(p[0] - u[0], p[1] - u[1]) >= PASSO_MIN) r.push(p);
  }
  return r.length >= 3 ? r : anel;
}

// Só os vãos enquadram a obra; poste novo entra se não houver vão. Poste existente solto no desenho
// (o DXF traz postes do Ceará inteiro) nunca entra: abriria o mapa em centenas de km.
export function caixaDaRede(rede: Rede): Caixa | null {
  const c: Caixa = [Infinity, Infinity, -Infinity, -Infinity];
  const ve = (p: Pt) => {
    if (p[0] < c[0]) c[0] = p[0];
    if (p[1] < c[1]) c[1] = p[1];
    if (p[0] > c[2]) c[2] = p[0];
    if (p[1] > c[3]) c[3] = p[1];
  };
  for (const v of rede.vaos) v.pts.forEach(ve);
  if (!Number.isFinite(c[0])) {
    const novos = rede.postes.filter((p) => p.novo);
    (novos.length ? novos : rede.postes).forEach((p) => ve(p.ponto));
  }
  return Number.isFinite(c[0]) ? c : null;
}

const cruza = (a: Caixa, b: Caixa, folga = 0): boolean => a[0] <= b[2] + folga && a[2] >= b[0] - folga && a[1] <= b[3] + folga && a[3] >= b[1] - folga;

export const SITUACAO_TEXTO: Record<Vao['situacao'], string> = {
  novo: 'Nova (1)', existente: 'Existente', realocado: 'Realocada (2)', retirado: 'Retirada (3)',
};
export const TIPO_TEXTO: Record<string, string> = { MT: 'MT', BT: 'BT', CONJ: 'Conjugada' };

export function classeDoVao(v: Vao): string {
  if (v.situacao !== 'novo') return 'vao fora';
  if (v.tipo === null) return 'vao sem-tipo';
  return `vao ${v.tipo.toLowerCase()}`;
}

export function criarMapa(raiz: HTMLElement, acoes: AcoesMapa, aoMoverMouse: (p: Pt | null) => void = () => {}): Mapa {
  const svg = el('svg', { class: 'mapa', role: 'img', 'aria-label': 'Mapa da rede, das áreas protegidas e das estradas' }) as SVGSVGElement;
  const gEstradas = el('g', { class: 'estradas' });
  const gAreas = el('g', { class: 'areas' });
  const gApps = el('g', { class: 'apps' });
  const gVaos = el('g', { class: 'vaos' });
  const gPostes = el('g', { class: 'postes' });
  const gArvores = el('g', { class: 'arvores' });
  svg.append(gEstradas, gAreas, gApps, gVaos, gPostes, gArvores);
  raiz.append(svg);

  let vb = { x: 0, y: -1000, w: 2000 }; // viewBox: canto, largura; a altura vem do formato da tela
  let chaveAjuste = '';
  let chaveAreas = '';
  let ultimaBase: EntradaMapa['base'] = null;
  let modoAtivo = false; // há um modo de clique: o clique no mapa não troca a marca do vão

  const aspecto = (): number => {
    const r = svg.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r.height / r.width : ASPECTO_PADRAO;
  };
  const aplicar = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.w * aspecto()}`);
  const metrosPorPx = (): number => {
    const r = svg.getBoundingClientRect();
    return r.width > 0 ? vb.w / r.width : 1;
  };
  const deTela = (cx: number, cy: number): Pt => {
    const r = svg.getBoundingClientRect();
    const m = metrosPorPx();
    return [vb.x + (cx - r.left) * m, -(vb.y + (cy - r.top) * m)];
  };

  let caixaAtual: Caixa | null = null;
  function ajustar() {
    if (!caixaAtual) return;
    const [x0, y0, x1, y1] = caixaAtual;
    const a = aspecto();
    const w = Math.max(x1 - x0, (y1 - y0) / a, 60) * 1.2;
    const h = w * a;
    vb = { x: (x0 + x1) / 2 - w / 2, y: -((y0 + y1) / 2) - h / 2, w };
    aplicar();
  }

  function desenharAreas(base: NonNullable<EntradaMapa['base']>, caixa: Caixa) {
    gAreas.replaceChildren();
    for (const a of base.areas) {
      if (!cruza(a.caixa, caixa, RAIO_AREAS)) continue;
      const agua = ehAgua(a) !== null;
      const classe = agua ? 'area agua' : 'area';
      const nome = a.nome || 'Área sem nome';
      if (a.poligonos.length) {
        const d = a.poligonos
          .map((aneis) => aneis.map((anel) => `M${pontos(alivia(anel)).replace(/ /g, ' L')}Z`).join(' '))
          .join(' ');
        gAreas.append(el('path', { class: classe, d, 'fill-rule': 'evenodd' }, [titulo(nome)]));
      }
      for (const l of a.linhas) gAreas.append(el('polyline', { class: `${classe} linha`, points: pontos(l) }, [titulo(nome)]));
    }
  }

  // APP proposta (tracejada) ou confirmada (cheia); a recusada não aparece
  function desenharApps(apps: NonNullable<EntradaMapa['apps']>) {
    gApps.replaceChildren();
    for (const a of apps) {
      if (a.resposta === 'recusada') continue;
      const d = a.proposta.poligonos
        .map((aneis) => aneis.map((anel) => `M${pontos(alivia(anel)).replace(/ /g, ' L')}Z`).join(' '))
        .join(' ');
      const rotulo = `APP de ${a.proposta.agua.nome}, ${a.proposta.largura} m (${a.resposta === 'confirmada' ? 'confirmada' : 'proposta'})`;
      gApps.append(el('path', { class: `app ${a.resposta}`, d, 'fill-rule': 'evenodd' }, [titulo(rotulo)]));
    }
  }

  // árvores com ponto, limpezas fechadas e a limpeza que está sendo desenhada
  function desenharArvores(arvores: NonNullable<EntradaMapa['arvores']>, limpeza: Pt[][], modo: EntradaMapa['modoMapa']) {
    gArvores.replaceChildren();
    for (const l of limpeza) {
      gArvores.append(el('polygon', { class: 'limpeza', points: pontos(l) }, [titulo('Limpeza de faixa')]));
    }
    if (modo?.t === 'limpeza' && modo.pts.length > 0) {
      gArvores.append(el('polyline', { class: 'limpeza rascunho', points: pontos(modo.pts) }));
      for (const p of modo.pts) gArvores.append(el('path', { class: 'arvore-ponto rascunho', d: `M${ponto(p).replace(',', ' ')} l0 0` }));
    }
    for (const a of arvores) {
      if (!a.ponto) continue;
      const rotulo = `${a.especie.trim() || 'Árvore'}: ${a.intervencao === 'supressao' ? 'supressão' : 'poda'}`;
      gArvores.append(el('path', { class: `arvore-ponto ${a.intervencao}`, d: `M${ponto(a.ponto).replace(',', ' ')} l0 0` }, [titulo(rotulo)]));
    }
  }

  function desenharRede(rede: Rede) {
    gVaos.replaceChildren();
    gPostes.replaceChildren();
    for (const v of rede.vaos) {
      const rotulo = `${v.id}: ${v.tipo ? TIPO_TEXTO[v.tipo] : 'sem tipo'} · ${SITUACAO_TEXTO[v.situacao]}`;
      gVaos.append(el('polyline', { class: classeDoVao(v), points: pontos(v.pts) }));
      // área de toque larga e transparente: é nela que o clique cai
      gVaos.append(el('polyline', { class: 'toque', 'data-vao': v.id, points: pontos(v.pts) }, [titulo(`${rotulo}. Clique para mudar.`)]));
    }
    for (const p of rede.postes) gPostes.append(poste(p));
  }

  function poste(p: Poste): SVGElement {
    const classe = p.aConfirmar ? 'poste a-confirmar' : p.novo ? 'poste novo' : 'poste';
    const rotulo = `${p.numero ? `Poste ${p.numero}` : `Poste ${p.id}`}${p.aConfirmar ? ' (ponto sem nome, confirmar)' : p.novo ? ' novo' : ''}`;
    return el('path', { class: classe, d: `M${ponto(p.ponto).replace(',', ' ')} l0 0` }, [titulo(rotulo)]);
  }

  // clique x arrasto: o clique só vale se o mouse não andou
  let arrastou = false;
  svg.addEventListener('pointerdown', (e: Event) => {
    const ev = e as MouseEvent;
    if (ev.button > 0) return;
    arrastou = false;
    let x = ev.clientX, y = ev.clientY;
    const mexe = (m: Event) => {
      const me = m as MouseEvent;
      const dx = me.clientX - x, dy = me.clientY - y;
      if (!arrastou && Math.hypot(me.clientX - ev.clientX, me.clientY - ev.clientY) < LIMITE_ARRASTO) return;
      arrastou = true;
      const k = metrosPorPx();
      vb = { ...vb, x: vb.x - dx * k, y: vb.y - dy * k };
      x = me.clientX; y = me.clientY;
      aplicar();
    };
    const solta = () => {
      window.removeEventListener('pointermove', mexe);
      window.removeEventListener('pointerup', solta);
      window.removeEventListener('pointercancel', solta);
    };
    window.addEventListener('pointermove', mexe);
    window.addEventListener('pointerup', solta);
    window.addEventListener('pointercancel', solta);
  });

  svg.addEventListener('click', (e: Event) => {
    if (arrastou) { arrastou = false; return; }
    if (modoAtivo) {
      const ev = e as MouseEvent;
      if (ev.detail >= 2) return; // o segundo clique do duplo clique não é um vértice novo
      acoes.clicarNoMapa?.(deTela(ev.clientX, ev.clientY));
      return;
    }
    const alvo = (e.target as Element | null)?.closest?.('[data-vao]');
    const id = alvo?.getAttribute('data-vao');
    if (id) acoes.marcarVao(id);
  });

  svg.addEventListener('dblclick', (e: Event) => {
    if (!modoAtivo) return;
    e.preventDefault();
    acoes.fecharLimpeza?.();
  });

  svg.addEventListener('pointermove', (e: Event) => {
    const ev = e as MouseEvent;
    aoMoverMouse(deTela(ev.clientX, ev.clientY));
  });
  svg.addEventListener('pointerleave', () => aoMoverMouse(null));

  svg.addEventListener('wheel', (e: Event) => {
    const ev = e as WheelEvent;
    ev.preventDefault();
    const antes = deTela(ev.clientX, ev.clientY);
    const w = Math.min(2_000_000, Math.max(20, vb.w * Math.exp(ev.deltaY * 0.0015)));
    const r = svg.getBoundingClientRect();
    const k = r.width > 0 ? w / r.width : 1;
    // o ponto sob o mouse fica parado
    vb = { x: antes[0] - (ev.clientX - r.left) * k, y: -antes[1] - (ev.clientY - r.top) * k, w };
    aplicar();
  }, { passive: false });

  aplicar();

  return {
    elemento: svg,
    ajustar,
    atualizar({ base, rede, apps, arvores, limpeza, modoMapa }) {
      desenharApps(rede ? (apps ?? []) : []);
      modoAtivo = !!rede && !!modoMapa;
      svg.classList.toggle('clicando', modoAtivo);
      if (!rede) {
        gVaos.replaceChildren(); gPostes.replaceChildren(); gAreas.replaceChildren(); gArvores.replaceChildren();
        caixaAtual = null; chaveAjuste = ''; chaveAreas = '';
        return;
      }
      const caixa = caixaDaRede(rede);
      caixaAtual = caixa;
      desenharRede(rede);
      desenharArvores(arvores ?? [], limpeza ?? [], modoMapa ?? null);
      if (!caixa) return;
      const chave = caixa.map((n) => Math.round(n)).join(',');
      if (base && (base !== ultimaBase || chave !== chaveAreas)) {
        desenharAreas(base, caixa);
        ultimaBase = base;
        chaveAreas = chave;
      }
      // só enquadra quando a obra muda; marcar vão não mexe na tela
      if (chave !== chaveAjuste) {
        chaveAjuste = chave;
        ajustar();
      }
    },
    definirEstradas(arestas) {
      gEstradas.replaceChildren();
      for (const a of arestas) {
        gEstradas.append(el('polyline', { class: `estrada ${a.classe}`, points: pontos(a.pts) }));
      }
    },
  };
}

export const AVISO_SEM_ESTRADAS = 'Sem a base de estradas: o mapa fica sem elas';

/**
 * Estradas: busca de novo só quando a obra muda de lugar. A resposta de uma janela que já não é a atual
 * (a obra mudou de lugar ou saiu) é ignorada: não troca nem apaga as estradas da busca nova.
 * Estrada é só referência: sem ela o mapa segue, com um aviso na barra; sem projeto, o aviso sai.
 */
export function ligarEstradas(
  estado: { ler(): Retrato; aoMudar(f: () => void): () => void },
  mapa: Pick<Mapa, 'atualizar' | 'definirEstradas'>,
  avisar: (texto: string | null) => void,
  carregar: (janela: Janela) => Promise<Aresta[]>,
): void {
  let chave = '';
  let comAviso = false;
  const aviso = (t: string | null) => { comAviso = t !== null; avisar(t); };
  estado.aoMudar(() => {
    const r = estado.ler();
    mapa.atualizar(r);
    const caixa = r.rede ? caixaDaRede(r.rede) : null;
    if (!caixa) {
      chave = '';
      if (comAviso) aviso(null);
      return;
    }
    const janela: Janela = { x0: caixa[0], y0: caixa[1], x1: caixa[2], y1: caixa[3] };
    const nova = [janela.x0, janela.y0, janela.x1, janela.y1].map((n) => Math.round(n / 1000)).join(',');
    if (nova === chave) return;
    chave = nova;
    carregar(janela).then(
      (arestas) => { if (chave !== nova) return; aviso(null); mapa.definirEstradas(arestas); },
      () => { if (chave !== nova) return; mapa.definirEstradas([]); aviso(AVISO_SEM_ESTRADAS); },
    );
  });
}
