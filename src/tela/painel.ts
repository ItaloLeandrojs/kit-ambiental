// Painel de passos. Fica aberto só o passo atual; os passos feitos viram uma linha de resumo,
// e clicar no resumo reabre o passo. O passo 4 (árvores) vem na próxima tarefa.
import type { Aviso, Poste, Pt, TipoRede, Vao } from '../nucleo/tipos.ts';
import type { Caso, Intervencao } from '../nucleo/caso.ts';
import { ehAgua } from '../nucleo/areas.ts';
import type { ItemConferencia } from '../nucleo/conferir.ts';
import { coordTexto, haTexto, metrosTexto } from '../nucleo/formato.ts';
import { resumoTexto } from '../nucleo/resumo.ts';
import { LARGURA_APP, M2_POSTE_SEM_REDE } from '../regras/faixas.ts';
import { PORQUE_AVISO } from '../regras/textos.ts';
import { contaNaRede, ERRO_APP_PENDENTE, osValida, type AppDoCaso, type Estado, type Retrato } from './estado.ts';
import { SITUACAO_TEXTO, TIPO_TEXTO } from './mapa.ts';

type Filho = Node | string | null | false | undefined;
type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

// monta DOM sem innerHTML: nome de arquivo e de área são texto, nunca HTML
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...filhos: Filho[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') e.addEventListener(k.replace(/^on/, ''), v);
    else if (v === true) e.setAttribute(k, '');
    else if (k === 'value') (e as unknown as HTMLInputElement).value = String(v);
    else e.setAttribute(k, String(v));
  }
  for (const f of filhos) if (f) e.append(f);
  return e;
}

const PASSOS = [
  { n: 1, titulo: 'KMZ de Áreas Protegidas' },
  { n: 2, titulo: 'Projeto' },
  { n: 3, titulo: 'Confirmar a rede' },
  { n: 4, titulo: 'Árvores' },
  { n: 5, titulo: 'O caso' },
  { n: 6, titulo: 'Baixar' },
  { n: 7, titulo: 'Conferir um zip' },
] as const;
const EM_BREVE = new Set([4]);
const AVISOS_DA_REDE = new Set(['POSTE_A_CONFIRMAR', 'SEM_REDE_NOVA']); // aparecem no passo 3, não no 5
const ERRO_M2_TELA = 'Os m² do poste precisam ser um número, zero ou maior.';
const PRAZO_POSTE = 5; // m: poste que dá nome à ponta do vão

const milhar = (n: number): string => n.toLocaleString('pt-BR');
const comprimento = (p: Pt[]): number => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);

function posteDa(postes: Poste[], p: Pt): Poste | null {
  let m: Poste | null = null;
  let d = PRAZO_POSTE;
  for (const q of postes) {
    const x = Math.hypot(q.ponto[0] - p[0], q.ponto[1] - p[1]);
    if (x <= d) { m = q; d = x; }
  }
  return m;
}

export function nomeDoVao(v: Vao, postes: Poste[]): string {
  const a = posteDa(postes, v.pts[0]);
  const b = posteDa(postes, v.pts[v.pts.length - 1]);
  return a?.numero && b?.numero ? `P-${a.numero} a P-${b.numero}` : v.id;
}

export function totaisDaRede(vaos: Vao[]): Record<TipoRede, number> & { semTipo: number } {
  const t = { MT: 0, BT: 0, CONJ: 0, semTipo: 0 };
  for (const v of vaos) {
    if (v.situacao !== 'novo') continue;
    if (v.tipo === null) t.semTipo++;
    else t[v.tipo] += comprimento(v.pts);
  }
  return t;
}

const lerBytes = async (f: File): Promise<Uint8Array> => new Uint8Array(await f.arrayBuffer());

// zona de soltar arquivo; o input escondido também abre pelo teclado
function zona(texto: string, accept: string, aoEscolher: (f: File) => void, rotulo: string): HTMLElement {
  const entrada = h('input', { type: 'file', accept, 'aria-label': rotulo, onchange: (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) aoEscolher(f);
  } });
  const z = h('label', {
    class: 'soltar',
    ondragover: (e) => { e.preventDefault(); z.classList.add('sobre'); },
    ondragleave: () => z.classList.remove('sobre'),
    ondrop: (e) => {
      e.preventDefault();
      z.classList.remove('sobre');
      const f = (e as DragEvent).dataTransfer?.files?.[0];
      if (f) aoEscolher(f);
    },
  }, texto, entrada);
  return z;
}

function botaoTrocar(accept: string, aoEscolher: (f: File) => void, rotulo: string): HTMLElement {
  const entrada = h('input', { type: 'file', accept, 'aria-label': rotulo, class: 'so-leitor', tabindex: -1, style: 'display:none', onchange: (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) aoEscolher(f);
  } });
  return h('span', {}, h('button', { type: 'button', class: 'link', onclick: () => entrada.click() }, 'trocar'), entrada);
}

const TITULO_AVISO: Record<string, string> = {
  CRUZA_LINHA: 'Área só em linha',
  MUNICIPIO_INCERTO: 'Município incerto',
  POSTE_A_CONFIRMAR: 'Poste a confirmar',
  SEM_REDE_NOVA: 'Nenhuma rede nova marcada',
  APP_POSSIVEL: 'Possível APP',
  PROXIMA: 'Perto, sem cruzar',
  LITORAL: 'Município do litoral',
  SEM_ORGAO: 'Órgão não identificado',
  SEM_AREA: 'Sem área protegida no KMZ',
};

function linhasDoAviso(a: Aviso, porque?: string): Filho[] {
  const pq = porque ?? PORQUE_AVISO[a.codigo];
  return [
    h('dt', {}, 'O que é'), h('dd', {}, a.texto),
    pq ? h('dt', {}, 'Por que importa') : null, pq ? h('dd', {}, pq) : null,
    h('dt', {}, 'O que fazer'), h('dd', {}, a.comoCorrigir),
  ];
}

function blocoAviso(a: Aviso): HTMLElement {
  const titulo = a.nivel === 'vermelho' ? 'Pare e confira' : (TITULO_AVISO[a.codigo] ?? 'Confira');
  return h('div', { class: `aviso ${a.nivel}`, role: a.nivel === 'vermelho' ? 'alert' : undefined },
    h('h3', {}, titulo, h('span', { class: 'cod' }, a.codigo)),
    h('dl', {}, ...linhasDoAviso(a)));
}

const nomeDoPoste = (p: Poste | null, ponta: Pt): string => (p?.numero ? `P-${p.numero}` : `o ponto ${coordTexto(ponta)}`);
const entreTexto = (iv: Intervencao): string =>
  iv.trechos.map((t) => `entre ${nomeDoPoste(t.de, t.pts[0])} e ${nomeDoPoste(t.ate, t.pts[t.pts.length - 1])}`).join(' e ');
const m2Texto = (m2: number): string => String(m2).replace('.', ',');

function linhaIntervencao(iv: Intervencao, aoMudarM2: (id: string, texto: string) => void): HTMLElement {
  const m = iv.metros;
  const o = iv.orgao;
  const entre = entreTexto(iv);
  return h('article', { class: o && !o.aConfirmar ? 'cartao' : 'cartao atencao' },
    h('h3', {}, iv.area.nome),
    o ? h('div', { class: 'tipo-area' }, `${o.categoria} (${o.esfera})`) : null,
    o
      ? h('div', { class: 'orgaos' },
        h('span', {}, 'Protocolar em: ', h('b', {}, o.licencia), ' · Anuência: ', h('b', {}, o.gestor)),
        o.aConfirmar ? h('span', { class: 'nota' }, `Quem licencia aqui ainda está a confirmar (${o.aConfirmar} a confirmar). Pergunte ao P&M antes de protocolar.`) : null)
      : h('p', { class: 'nota' }, 'Órgão não identificado; consultar o P&M.'),
    h('div', { class: 'nums' },
      h('div', {}, h('b', {}, `${metrosTexto(m.MT)} m`), h('span', {}, 'MT')),
      h('div', {}, h('b', {}, `${metrosTexto(m.BT)} m`), h('span', {}, 'BT')),
      h('div', {}, h('b', {}, `${metrosTexto(m.CONJ)} m`), h('span', {}, 'conjugada'))),
    h('div', { class: 'ha' }, 'Área de intervenção: ', h('b', {}, `${haTexto(iv.hectares)} ha`),
      ' ', h('span', { class: 'nota' }, '(metros × faixa de 6 m na MT e na conjugada e 3 m na BT)')),
    entre ? h('div', { class: 'entre' }, `Trechos ${entre}.`) : null,
    ...iv.postesSemRede.map(({ poste, m2 }) => h('div', { class: 'ha' },
      `Poste novo ${poste.numero ? `P-${poste.numero} ` : ''}sem rede nova na área: `,
      h('label', { class: 'larg' }, h('input', {
        type: 'text', inputmode: 'decimal', value: m2Texto(m2), 'aria-label': `m² do poste ${poste.numero ?? poste.id}`,
        onchange: (e) => aoMudarM2(poste.id, (e.target as HTMLInputElement).value),
      }), ' m²'))),
    h('p', { class: 'nota' }, 'Use o nome exatamente assim no memorial.'));
}

export interface Painel { desenhar(): void }

export interface OpcoesPainel {
  /** Entrega um arquivo ao usuário; nos testes é trocada por um espião. */
  salvar?: (nome: string, conteudo: Uint8Array | string, tipo: string) => void;
}

function salvarNoNavegador(nome: string, conteudo: Uint8Array | string, tipo: string): void {
  const url = URL.createObjectURL(new Blob([conteudo as BlobPart], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function criarPainel(raiz: HTMLElement, estado: Estado, opcoes: OpcoesPainel = {}): Painel {
  const salvar = opcoes.salvar ?? salvarNoNavegador;
  let os = '';
  let atualAnterior = 0;
  let avanco = 0; // 5 ou 6: a pessoa já seguiu do passo 3 para o caso (ou para o download)
  const larguras = new Map<number, string>(); // o que está escrito no campo de largura de cada APP
  let erroM2: string | null = null;
  let erroBaixar: string | null = null;
  let copia: 'nao' | 'copiado' | 'falhou' = 'nao';
  let conferencia: { arquivo: string; itens: ItemConferencia[] } | null = null;
  let erroConferir: string | null = null;
  let zipLido: { bytes: Uint8Array; nome: string } | null = null;
  let dxfConferir: Uint8Array | null = null;
  const abertura = new Map<number, boolean>(); // o que a pessoa abriu ou fechou à mão
  let projetoLido: { bytes: Uint8Array; nome: string } | null = null;

  const lerProjeto = (f: File) => {
    void lerBytes(f).then((bytes) => {
      projetoLido = { bytes, nome: f.name };
      return estado.carregarProjeto(bytes, f.name, os);
    });
  };

  function passoAtual(r: Retrato): number {
    if (!r.base) return 1;
    if (!r.rede) return 2;
    if (!r.caso) return 3;
    return avanco >= 5 ? avanco : 3;
  }

  function resumoDoPasso(n: number, r: Retrato): string | null {
    if (n === 1 && r.base) {
      const quantas = `${milhar(r.base.areas.length)} áreas`;
      return r.base.revisao === '?' ? `Revisão não identificada · ${quantas}` : `Rev. ${r.base.revisao} · ${r.base.data} · ${quantas}`;
    }
    if (n === 2 && r.projeto) return `OS ${r.projeto.os} · ${r.projeto.nome}`;
    if (n === 3 && r.rede) {
      const novos = r.rede.vaos.filter(contaNaRede).length;
      return `${novos} de ${r.rede.vaos.length} vãos são rede nova`;
    }
    if (n === 5 && r.caso) return `${r.caso.intervencoes.length} áreas cruzadas · ${r.caso.avisos.length} avisos`;
    if (n === 6 && r.caso) return r.appsPendentes > 0 ? 'responda as APPs antes' : 'KML e SHP prontos';
    if (n === 7 && conferencia) {
      const v = conferencia.itens.filter((i) => i.nivel === 'vermelho').length;
      const a = conferencia.itens.filter((i) => i.nivel === 'amarelo').length;
      return `${v} vermelhos · ${a} amarelos`;
    }
    return null;
  }

  function passo1(r: Retrato): Filho[] {
    const base = r.base;
    const lerKmz = (f: File) => void lerBytes(f).then((b) => estado.carregarKmz(b, f.name));
    const avisoRevisao = base?.revisao === '?'
      ? h('p', { class: 'amarelo-txt' }, 'Revisão não identificada no nome do arquivo; confira se é a mais nova.')
      : null;
    return [
      r.erroPasso === 1 && r.erro ? h('p', { class: 'erro', role: 'alert' }, r.erro) : null,
      r.ocupado && r.trabalho ? h('p', { class: 'ajuda', role: 'status' }, r.trabalho) : null,
      base
        ? h('div', { class: 'arquivo' },
          h('div', {}, h('div', { class: 'nome' }, r.kmzNome ?? 'KMZ'),
            h('div', { class: 'det' }, base.revisao === '?' ? 'lido e guardado neste computador' : `Rev. ${base.revisao} · ${base.data} · lido e guardado neste computador`)),
          botaoTrocar('.kmz,.kml', lerKmz, 'Escolher outro KMZ de Áreas Protegidas'))
        : zona('Arraste aqui o KMZ de Áreas Protegidas, ou clique para escolher.', '.kmz,.kml', lerKmz, 'Escolher o KMZ de Áreas Protegidas'),
      avisoRevisao,
      h('p', { class: 'ajuda' }, 'É o mapa de todas as áreas protegidas do Ceará. ', h('strong', {}, 'Só precisa na primeira vez.'), ' Nada sai do seu computador.'),
    ];
  }

  function passo2(r: Retrato): Filho[] {
    const campo = h('input', {
      id: 'os', type: 'text', inputmode: 'numeric', maxlength: 10, value: os, autocomplete: 'off',
      oninput: (e) => {
        os = (e.target as HTMLInputElement).value.trim();
        (e.target as HTMLInputElement).classList.toggle('invalido', os !== '' && !osValida(os));
      },
      onchange: () => {
        // OS que faltava ou mudou: lê o projeto de novo com ela
        if (projetoLido && osValida(os) && os !== r.projeto?.os) void estado.carregarProjeto(projetoLido.bytes, projetoLido.nome, os);
      },
    });
    return [
      r.erroPasso === 2 && r.erro ? h('p', { class: 'erro', role: 'alert' }, r.erro) : null,
      r.ocupado && r.trabalho ? h('p', { class: 'ajuda', role: 'status' }, r.trabalho) : null,
      h('div', { class: 'campo' }, h('label', { for: 'os' }, 'OS'), campo),
      r.projeto
        ? h('div', { class: 'arquivo' },
          h('div', {}, h('div', { class: 'nome' }, r.projeto.nome), h('div', { class: 'det' }, r.projeto.detalhe)),
          botaoTrocar('.dxf,.dwg,.kml,.kmz', lerProjeto, 'Escolher outro projeto'))
        : zona('Arraste aqui o DXF do projeto (ou o KML da rede), ou clique para escolher.', '.dxf,.dwg,.kml,.kmz', lerProjeto, 'Escolher o projeto'),
      r.projeto && !r.bloqueio ? h('p', { class: 'ok' }, 'Desenho dentro do Ceará e em metros (UTM 24S).') : null,
      h('p', { class: 'ajuda' }, 'Se o desenho estiver fora do lugar, o site para aqui e avisa, para o kit não sair deslocado. Trocar a OS lê o projeto de novo e desfaz as marcações dos vãos.'),
    ];
  }

  function avisoDeBloqueio(r: Retrato): Filho {
    const b = r.bloqueio;
    if (b) {
      return h('div', { class: 'bloco-bloqueio' },
        blocoAviso(b),
        b.codigo === 'ETIQUETA_LONGE' ? caixaEtiqueta(false) : null);
    }
    if (r.liberado) {
      return h('div', { class: 'aviso amarelo' },
        h('h3', {}, 'Etiquetas liberadas por você', h('span', { class: 'cod' }, 'ETIQUETA_LONGE')),
        h('p', {}, 'As coordenadas escritas nas etiquetas não batem com o desenho, e você confirmou que o desenho está no lugar certo.'),
        caixaEtiqueta(true));
    }
    return null;
  }

  function caixaEtiqueta(marcada: boolean): HTMLElement {
    const c = h('input', { type: 'checkbox', checked: marcada, onchange: (e) => estado.liberarEtiqueta((e.target as HTMLInputElement).checked) });
    (c as HTMLInputElement).checked = marcada;
    return h('label', { class: 'confirma-solta' }, c, 'O desenho está no lugar certo');
  }

  function passo3(r: Retrato): Filho[] {
    const rede = r.rede!;
    const t = totaisDaRede(rede.vaos);
    const linhas = rede.vaos.map((v) => {
      const novo = v.situacao === 'novo';
      const classe = v.tipo === null ? (novo ? 'sem' : 'fora') : novo ? v.tipo.toLowerCase() : 'fora';
      const nome = nomeDoVao(v, rede.postes);
      const tipoTexto = v.tipo === null ? '?' : TIPO_TEXTO[v.tipo];
      const situacao = SITUACAO_TEXTO[v.situacao];
      return h('tr', { class: `vao-linha${novo && v.tipo !== null ? '' : ' fora-da-conta'}${novo && v.tipo === null ? ' sem-tipo' : ''}` },
        h('td', {}, nome),
        h('td', {}, h('button', {
          type: 'button', class: 'ciclo', 'data-vao': v.id,
          'aria-label': `Vão ${nome}: ${tipoTexto}, ${situacao}. Trocar a marca.`,
          onclick: () => estado.marcarVao(v.id),
        }, h('span', { class: `tipo ${classe}` }, !novo ? 'Fora' : v.tipo === null ? 'Sem tipo' : tipoTexto))),
        h('td', { class: 'sit' }, situacao),
        h('td', { class: 'n' }, metrosTexto(comprimento(v.pts))));
    });
    const doCaso = (r.caso?.avisos ?? []).filter((a) => AVISOS_DA_REDE.has(a.codigo));
    return [
      h('p', { class: 'ajuda' }, 'O site já separou a rede pelo desenho. ', h('strong', {}, 'Só a rede nova entra na conta.'),
        ' Rede existente, realocada e retirada ficam de fora. Clique no vão (no mapa ou na coluna Tipo) para trocar: MT, BT, conjugada, fora.'),
      h('div', { class: 'tabela-rolagem' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Vão'), h('th', {}, 'Tipo'), h('th', {}, 'Situação'), h('th', { class: 'n' }, 'm'))),
        h('tbody', {}, ...linhas))),
      h('table', {}, h('tfoot', {},
        h('tr', {}, h('td', { colspan: 4 }, `Rede nova (${rede.vaos.length} vãos no total)`)),
        h('tr', {}, h('td', { colspan: 4, class: 'sub' },
          `MT ${metrosTexto(t.MT)} m · BT ${metrosTexto(t.BT)} m · conjugada ${metrosTexto(t.CONJ)} m`)))),
      t.semTipo ? h('p', { class: 'amarelo-txt' }, `${t.semTipo} ${t.semTipo === 1 ? 'vão novo está' : 'vãos novos estão'} sem tipo (tracejado amarelo no mapa) e ficam fora da conta. Clique para escolher MT, BT ou conjugada.`) : null,
      h('div', { class: 'legenda', role: 'group', 'aria-label': 'Cores no mapa' },
        h('span', {}, h('i', { class: 'c-mt' }), 'MT (média tensão)'),
        h('span', {}, h('i', { class: 'c-bt' }), 'BT (baixa tensão)'),
        h('span', {}, h('i', { class: 'c-conj' }), 'Conjugada'),
        h('span', {}, h('i', { class: 'c-ex' }), 'Existente ou fora da conta')),
      r.camadas.length ? h('div', { class: 'camadas-extra' },
        h('p', { class: 'ajuda' }, h('strong', {}, 'Camadas do DXF que não parecem rede.'), ' Se alguma for rede, inclua com o tipo certo.'),
        ...r.camadas.map((c) => h('div', { class: 'linha' }, h('code', {}, c),
          h('button', { type: 'button', class: 'botao mini', 'aria-label': `Incluir a camada ${c} como MT`, onclick: () => estado.incluirCamada(c, 'MT') }, 'MT'),
          h('button', { type: 'button', class: 'botao mini', 'aria-label': `Incluir a camada ${c} como BT`, onclick: () => estado.incluirCamada(c, 'BT') }, 'BT')))) : null,
      avisoDeBloqueio(r),
      ...doCaso.map(blocoAviso),
      h('button', {
        type: 'button', class: 'botao forte', disabled: !r.caso,
        onclick: () => { avanco = 5; desenhar(); },
      }, 'Rede confirmada, ver o caso'),
    ];
  }

  function cartaoApp(a: AppDoCaso, i: number): HTMLElement {
    const nome = a.proposta.agua.nome;
    if (a.resposta === 'confirmada') {
      return h('article', { class: 'cartao' },
        h('h3', {}, `APP confirmada: ${nome}`),
        h('p', { class: 'nota' }, `Largura de ${m2Texto(a.proposta.largura)} m. Entrou na conta (metros e hectares) e nas camadas do kit. Confira em campo.`),
        h('button', { type: 'button', class: 'botao mini', onclick: () => estado.reabrirApp(i) }, 'Desfazer'));
    }
    if (a.resposta === 'recusada') {
      return h('article', { class: 'cartao atencao' },
        h('h3', {}, `Sem APP: ${nome}`),
        h('p', { class: 'nota' }, 'Você disse que a margem não é APP. A margem não entra na conta nem no kit.'),
        h('button', { type: 'button', class: 'botao mini', onclick: () => estado.reabrirApp(i) }, 'Voltar atrás'));
    }
    const tipo = ehAgua(a.proposta.agua);
    const padrao = tipo ? LARGURA_APP[tipo] : null;
    const escrito = larguras.get(a.proposta.agua.id) ?? m2Texto(a.proposta.largura);
    const campo = h('input', {
      type: 'text', inputmode: 'decimal', value: escrito, 'aria-label': `Largura da APP de ${nome} em metros`,
      oninput: (e) => { larguras.set(a.proposta.agua.id, (e.target as HTMLInputElement).value); },
    });
    const largura = (): number => Number((campo.value || '').replace(',', '.'));
    return h('div', { class: 'aviso amarelo' },
      h('h3', {}, 'Possível APP', h('span', { class: 'cod' }, 'APP_POSSIVEL')),
      h('dl', {},
        h('dt', {}, 'O que é'), h('dd', {}, `Rede nova a menos de 100 m de ${nome}. APP é a margem protegida em volta da água.`),
        h('dt', {}, 'Por que importa'), h('dd', {}, a.proposta.porque),
        h('dt', {}, 'O que fazer'), h('dd', {}, `Veja a APP proposta (tracejado amarelo no mapa). Confirme a largura de ${m2Texto(a.proposta.largura)} m ou ajuste, e confira em campo.`)),
      padrao !== null ? h('p', { class: 'nota' }, `Largura padrão de ${padrao} m: a confirmar com o P&M.`) : null,
      a.erro ? h('p', { class: 'erro', role: 'alert' }, a.erro) : null,
      h('div', { class: 'acoes' },
        h('button', { type: 'button', class: 'botao mini forte', onclick: () => estado.confirmarApp(i, largura()) }, 'Confirmar APP'),
        h('label', { class: 'larg' }, 'Largura ', campo, ' m'),
        h('button', { type: 'button', class: 'botao mini', onclick: () => estado.refazerApp(i, largura()) }, 'Ver no mapa'),
        h('button', { type: 'button', class: 'botao mini', onclick: () => estado.recusarApp(i) }, 'Não é APP')));
  }

  async function copiarResumo(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      copia = 'copiado';
    } catch {
      copia = 'falhou'; // sem permissão: o texto fica selecionado para Ctrl+C
    }
    desenhar();
  }

  function passo5(r: Retrato, caso: Caso): Filho[] {
    const temApp = r.apps.length >= caso.avisos.filter((a) => a.codigo === 'APP_POSSIVEL').length;
    // o cartão de APP faz o papel do aviso APP_POSSIVEL (com a confirmação ao lado)
    const outros = caso.avisos.filter((a) => !AVISOS_DA_REDE.has(a.codigo) && !(temApp && a.codigo === 'APP_POSSIVEL'));
    const texto = resumoTexto(caso, r.projeto?.os ?? '');
    const paraConferir = outros.length + r.appsPendentes;
    return [
      h('div', { class: 'resumo-topo' },
        h('span', { class: 'pilula' }, `${caso.intervencoes.length} áreas cruzadas`),
        h('span', { class: paraConferir ? 'pilula am' : 'pilula' }, `${paraConferir} avisos para conferir`)),
      caso.municipio ? h('p', { class: 'ajuda' }, 'Município: ', h('strong', {}, caso.municipio)) : null,
      erroM2 ? h('p', { class: 'erro', role: 'alert' }, erroM2) : null,
      ...caso.intervencoes.map((iv) => linhaIntervencao(iv, (id, t) => {
        const n = Number(t.trim().replace(',', '.'));
        if (t.trim() === '' || !Number.isFinite(n) || n < 0) { erroM2 = ERRO_M2_TELA; desenhar(); return; }
        erroM2 = null;
        estado.mudarM2Poste(id, n);
      })),
      ...r.apps.map(cartaoApp),
      ...outros.map(blocoAviso),
      h('button', { type: 'button', class: 'botao', onclick: () => void copiarResumo(texto) }, 'Copiar resumo'),
      copia === 'copiado' ? h('p', { class: 'ok', role: 'status' }, 'Resumo copiado.') : null,
      copia === 'falhou' ? h('p', { class: 'amarelo-txt', role: 'status' }, 'Não consegui copiar sozinho. O texto abaixo está selecionado: use Ctrl+C.') : null,
      h('pre', { class: 'resumo-txt' }, texto),
      h('button', { type: 'button', class: 'botao forte', onclick: () => { avanco = 6; desenhar(); } }, 'Seguir para baixar'),
    ];
  }

  function baixar(fazer: () => void) {
    erroBaixar = null;
    try { fazer(); } catch (e) { erroBaixar = e instanceof Error ? e.message : String(e); }
    desenhar();
  }

  function passo6(r: Retrato): Filho[] {
    const travado = r.appsPendentes > 0;
    return [
      travado ? h('p', { class: 'amarelo-txt', role: 'status' }, ERRO_APP_PENDENTE) : null,
      erroBaixar ? h('p', { class: 'erro', role: 'alert' }, erroBaixar) : null,
      h('button', {
        type: 'button', class: 'botao forte grande', disabled: travado,
        onclick: () => baixar(() => { const k = estado.baixarPacote(); salvar(k.nome, k.bytes, 'application/zip'); }),
      }, 'Baixar KML e SHP'),
      h('p', { class: 'ajuda' }, 'Um zip com duas pastas: ', h('code', {}, 'KML/'), ' e ', h('code', {}, 'SHAPEFILE/'),
        ', cada uma com as camadas separadas e a unificada, com o nome da OS.'),
      h('button', {
        type: 'button', class: 'botao', disabled: travado,
        onclick: () => baixar(() => { const g = estado.baixarGoogleEarth(); salvar(g.nome, g.texto, 'application/vnd.google-earth.kml+xml'); }),
      }, 'Abrir no Google Earth'),
      h('p', { class: 'ajuda' }, 'Baixa o KML para você ver a rede em cima da imagem de satélite. O site não mostra satélite.'),
    ];
  }

  function rodarConferencia() {
    if (!zipLido) return;
    erroConferir = null;
    try {
      conferencia = { arquivo: zipLido.nome, itens: estado.conferir(zipLido.bytes, dxfConferir ?? undefined) };
    } catch (e) {
      conferencia = null;
      erroConferir = e instanceof Error ? e.message : String(e);
    }
    desenhar();
  }

  function itemConferencia(i: ItemConferencia): HTMLElement {
    return h('div', { class: `item ${i.nivel}` },
      h('span', { class: 'b' }),
      h('div', {},
        h('strong', {}, i.titulo),
        h('p', {}, i.porque),
        i.arquivos.length ? h('p', {}, ...i.arquivos.flatMap((a, k) => [k ? ', ' : '', h('code', {}, a)])) : null,
        i.nivel === 'verde' ? null : h('p', { class: 'como' }, `Como corrigir: ${i.comoCorrigir}`)));
  }

  function passo7(): Filho[] {
    const lerZip = (f: File) => void lerBytes(f).then((bytes) => { zipLido = { bytes, nome: f.name }; rodarConferencia(); });
    const lerDxf = (f: File) => void lerBytes(f).then((bytes) => { dxfConferir = bytes; rodarConferencia(); });
    const itens = conferencia?.itens ?? [];
    const v = itens.filter((i) => i.nivel === 'vermelho').length;
    const a = itens.filter((i) => i.nivel === 'amarelo').length;
    return [
      erroConferir ? h('p', { class: 'erro', role: 'alert' }, erroConferir) : null,
      conferencia
        ? h('div', { class: 'arquivo' },
          h('div', {}, h('div', { class: 'nome' }, conferencia.arquivo),
            h('div', { class: 'det' }, `${v} vermelhos · ${a} amarelos · ${itens.length - v - a} verdes`)),
          botaoTrocar('.zip', lerZip, 'Escolher outro zip do kit'))
        : zona('Arraste aqui o zip do kit montado. Ele não sai do seu computador.', '.zip', lerZip, 'Escolher o zip do kit'),
      h('div', { class: 'arquivo' },
        h('div', {}, h('div', { class: 'nome' }, 'DXF do projeto (opcional)'),
          h('div', { class: 'det' }, dxfConferir ? 'lido: os metros do zip são comparados com o desenho' : 'se você soltar o DXF, o site compara os metros')),
        botaoTrocar('.dxf', lerDxf, 'Escolher o DXF do projeto')),
      ...itens.map(itemConferencia),
    ];
  }

  function corpoDoPasso(n: number, r: Retrato): Filho[] {
    if (n === 1) return passo1(r);
    if (n === 2) return passo2(r);
    if (n === 3 && r.rede) return passo3(r);
    if (n === 5 && r.caso) return passo5(r, r.caso);
    if (n === 6 && r.caso) return passo6(r);
    if (n === 7) return passo7();
    return [];
  }

  function legendaDoPasso(n: number, r: Retrato): string {
    const feito = resumoDoPasso(n, r);
    if (EM_BREVE.has(n)) return 'vem nas próximas etapas';
    if (n === 2 && !r.base) return 'abra o KMZ primeiro';
    if (n === 3 && !r.rede) return 'depois do projeto';
    if (n === 5) return r.bloqueio ? 'resolva o aviso vermelho do passo 3' : !r.caso ? 'depois da rede' : (feito ?? '');
    if (n === 6) return !r.caso ? 'depois do caso' : (feito ?? '');
    if (n === 7) return feito ?? 'antes de mandar ao órgão';
    return feito ?? (n === 3 ? 'quais vãos são rede nova' : '');
  }

  function desenhar() {
    const r = estado.ler();
    const atual = passoAtual(r);
    if (atual < 3) avanco = 0;
    if (atual !== atualAnterior) { abertura.clear(); atualAnterior = atual; }

    // foco e rolagem sobrevivem ao redesenho (a tabela muda a cada clique)
    const ativo = document.activeElement as HTMLElement | null;
    const vaoFocado = ativo?.dataset?.vao ?? null;
    const rolagem = raiz.querySelector('.tabela-rolagem')?.scrollTop ?? 0;
    const rolagemPainel = raiz.scrollTop;

    const lista = PASSOS.map(({ n, titulo }) => {
      const emBreve = EM_BREVE.has(n);
      const corpo = corpoDoPasso(n, r);
      const bloqueado = n === 5 || n === 6 ? !r.caso : n === 3 ? !r.rede : n === 2 ? !r.base : false;
      const feito = (n === 1 && !!r.base) || (n === 2 && !!r.rede) || (n === 3 && atual > 3) || (n === 5 && atual > 5) || (n === 7 && !!conferencia);
      const aberto = !emBreve && !bloqueado && (abertura.get(n) ?? n === atual);
      const classe = ['passo', feito ? 'feito' : '', n === atual ? 'atual' : '', bloqueado ? 'bloqueado' : '', emBreve ? 'em-breve' : ''].filter(Boolean).join(' ');
      const sumario = h('summary', {
        'aria-disabled': emBreve || bloqueado ? 'true' : undefined,
        onclick: (e) => {
          e.preventDefault();
          if (emBreve || bloqueado) return;
          abertura.set(n, !aberto);
          desenhar();
        },
      }, h('span', { class: 'num' }, String(n)), h('span', {}, titulo, h('small', {}, legendaDoPasso(n, r))));
      const d = h('details', { class: classe }, sumario, aberto ? h('div', { class: 'corpo' }, ...corpo) : null);
      if (aberto) d.setAttribute('open', '');
      return d;
    });
    raiz.replaceChildren(...lista);
    raiz.scrollTop = rolagemPainel;
    const tab = raiz.querySelector('.tabela-rolagem');
    if (tab) tab.scrollTop = rolagem;
    if (vaoFocado) raiz.querySelector<HTMLElement>(`[data-vao="${CSS.escape(vaoFocado)}"]`)?.focus();
    if (copia === 'falhou') {
      // sem área de transferência: deixa o resumo selecionado para Ctrl+C
      const pre = raiz.querySelector('.resumo-txt');
      if (pre) {
        const faixa = document.createRange();
        faixa.selectNodeContents(pre);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(faixa);
      }
      copia = 'nao'; // o aviso vale só para este desenho
    }
  }

  estado.aoMudar(desenhar);
  desenhar();
  return { desenhar };
}

export interface BarraStatus { cursor(p: Pt | null): void }

export function criarStatus(raiz: HTMLElement, estado: Estado): BarraStatus {
  // o cursor muda a cada movimento do mouse: só o texto dele é trocado, o resto não é redesenhado
  const posicao = h('span', {});
  const escreve = (p: Pt | null) => {
    posicao.textContent = p ? `E ${milhar(Math.round(p[0]))} · N ${milhar(Math.round(p[1]))}` : 'E · · N ·';
  };
  function desenhar() {
    const r = estado.ler();
    const t = r.rede ? totaisDaRede(r.rede.vaos) : null;
    raiz.replaceChildren(...[
      posicao,
      h('span', {}, 'UTM 24S · SIRGAS 2000'),
      t ? h('span', {}, 'Rede nova: ', h('b', {}, `MT ${metrosTexto(t.MT)} m`), ' · ', h('b', {}, `BT ${metrosTexto(t.BT)} m`), ' · ', h('b', {}, `Conj. ${metrosTexto(t.CONJ)} m`)) : null,
      r.trabalho
        ? h('span', { class: 'dir ocupado', role: 'status' }, r.trabalho)
        : h('span', { class: 'dir' }, 'Nada sai do seu computador')].filter((x): x is HTMLElement => !!x));
  }
  escreve(null);
  estado.aoMudar(desenhar);
  desenhar();
  return { cursor: escreve };
}
