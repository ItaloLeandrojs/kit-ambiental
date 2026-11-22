// Painel dos passos da Parte 2: 5a (UC), 5b (dados da obra), 6 (baixar), 6a (figuras), 7 (montar o kit) e 8 (conferir um zip),
// mais "Salvar o caso" e "Abrir caso salvo" no topo. Segue o rascunho aprovado (rascunhos/parte2-passos.html).
// O painel da Parte 1 continua dono da lista de passos (abre só o atual, guarda o foco); este só desenha o corpo dos passos novos.
// Nada sai do navegador: os arquivos que a pessoa solta são lidos aqui e entregues ao estado.
import { assuntoTexto, partesDoAssunto } from '../nucleo/assunto.ts';
import type { ItemConferencia } from '../nucleo/conferir.ts';
import { lerImagem } from '../nucleo/docx.ts';
import { numeroDoNome } from '../nucleo/figuras.ts';
import { coordTexto, metrosTexto } from '../nucleo/formato.ts';
import { nomeNoKit, pastaDoKit, type Papel } from '../nucleo/kit.ts';
import {
  finalidadePadrao, metrosDaRede, postesNovos, regionalSugerida,
  type DadosObra, type Empresa, type Imagem, type Predominancia, type Regional, type Responsavel, type Resposta, type TipoAgua, type TipoAtendimento,
} from '../nucleo/obra.ts';
import { nomeDaPlanilha } from '../nucleo/planilha.ts';
import type { Aviso, TipoRede } from '../nucleo/tipos.ts';
import { TEXTOS_PLANILHA } from '../regras/planilha.ts';
import { PORQUE_AVISO } from '../regras/textos.ts';
import { TEXTOS_CASO_SALVO, TEXTOS_MEMORIAL, TEXTOS_PAINEL_KIT as TP } from '../regras/textos-memorial.ts';
import { ERRO_APP_PENDENTE, ERRO_ARVORE_SEM_PONTO, ERRO_AVISO_VERMELHO, type Estado, type Retrato } from './estado.ts';
import type { EstadoKit, RetratoKit } from './estado-kit.ts';
import {
  botaoTrocar, criarPainel, h, itemConferencia, lerBytes, salvarNoNavegador, zona, zonaVarios,
  type ContextoPasso, type ExtensaoPainel, type Filho, type Painel,
} from './painel.ts';

type Salvar = (nome: string, conteudo: Uint8Array | string, tipo: string) => void;
export interface OpcoesPainelKit {
  /** Entrega um arquivo ao usuário; nos testes é trocada por um espião. */
  salvar?: Salvar;
  /** Onde ficam "Salvar o caso" e "Abrir caso salvo" (o cabeçalho do painel). */
  topo?: HTMLElement | null;
}

const TIPO_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const TIPO_KMZ = 'application/vnd.google-earth.kmz';
const TIPO_XLSM = 'application/vnd.ms-excel.sheet.macroEnabled.12';
const TIPO_ZIP = 'application/zip';

const PASSOS_KIT = [
  { id: '5a', titulo: 'UC do cliente' },
  { id: '5b', titulo: 'Dados da obra' },
  { id: '6', titulo: 'Baixar' },
  { id: '6a', titulo: 'Figuras' },
  { id: '7', titulo: 'Montar o kit' },
  { id: '8', titulo: 'Conferir um zip' },
];

const TIPOS_ATENDIMENTO: [TipoAtendimento, string][] = [
  ['ligacao-b', 'Ligação nova grupo B'], ['ligacao-a', 'Ligação nova grupo A'], ['extensao', 'Extensão de rede'], ['melhoria', 'Melhoria'], ['outro', 'Outro'],
];
const REGIONAIS: Regional[] = ['FORTALEZA', 'METROPOLITANA', 'LESTE', 'NORTE', 'SUL', 'CENTRO-SUL', 'ATLÂNTICO'];
// as mesmas palavras do memorial (nucleo/memorial.ts)
const PREDOMINANCIAS: [Predominancia, string][] = [['arbustiva', 'Arbustiva'], ['arborea', 'Arbórea'], ['mista-arbustiva', 'Mista, com mais arbustos'], ['mista-arborea', 'Mista, com mais árvores']];
const AGUAS: [TipoAgua, string][] = [['rio', 'Rio'], ['lagoa', 'Lagoa natural'], ['reservatorio', 'Reservatório artificial (açude)']];
const PAPEIS: [Papel, string, string][] = [ // papel, nome na tela, extensão de costume
  ['memorial-pdf', 'Memorial em PDF', 'pdf'], ['memorial-docx', 'Memorial em Word', 'docx'], ['art', 'ART', 'pdf'], ['cvt', 'CVT', 'pdf'],
  ['cad-dwg', 'Projeto (CAD) em DWG', 'dwg'], ['cad-pdf', 'Projeto (CAD) em PDF', 'pdf'],
  ['planta-dwg', 'Planta georreferenciada em DWG', 'dwg'], ['planta-pdf', 'Planta georreferenciada em PDF', 'pdf'],
  ['planilha-xlsm', 'Planilha Padrão (.xlsm)', 'xlsm'], ['planilha-pdf', 'Planilha Padrão em PDF', 'pdf'],
  ['poda', 'Autorização de poda', 'pdf'], ['regularidade', 'Documento de regularidade do cliente', 'pdf'],
];
const SIM_NAO: [string, string][] = [['SIM', 'SIM'], ['NÃO', 'NÃO']];
const SIM_NAO_NA: [string, string][] = [...SIM_NAO, ['NÃO SE APLICA', 'NÃO SE APLICA']];
const TIPOS_REDE: [TipoRede, string][] = [['MT', 'MT'], ['BT', 'BT'], ['CONJ', 'conjugada']];
const ERROS_DO_CASO = new Set<string>(Object.values(TEXTOS_CASO_SALVO));

// provisório: texto a confirmar com o Italo (títulos dos avisos da Parte 2 na tela)
const TITULO_AVISO_KIT: Record<string, string> = {
  CEP_VAZIO: 'CEP em branco',
  FASES_VAZIAS: 'Fases da ligação',
  POSTES_NAO_BATEM: 'Postes não batem',
  MUNICIPIO_EDITADO: 'Município trocado',
  CASO_OUTRO_PROJETO: 'Caso salvo com outro projeto',
  UC_NAO_ACHADA: 'UC não achada no desenho',
  NAO_ASSINADO: 'Memorial e planilha saem sem assinatura',
  SEM_ASSINATURA: 'Sem a assinatura guardada',
  PLANILHA_ESCOLHER: 'Escolha na lista',
  PLANILHA_SEM_VALOR: 'Célula vazia na planilha',
  PLANILHA_ASSUNTO: 'Assunto do e-mail',
  PLANILHA_COLUNA_NOVA: 'Coluna nova na planilha',
  PLANILHA_SEM_ASSINATURA: 'Planilha sem assinatura',
  PLANILHA_JA_ASSINADA: 'Planilha já assinada',
};
// em que seção do 5b cada aviso dos dados aparece
const SECAO_DO_AVISO: Record<string, string> = { CEP_VAZIO: 'interessado', MUNICIPIO_EDITADO: 'obra', FASES_VAZIAS: 'finalidade', POSTES_NAO_BATEM: 'rede' };

const mensagem = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;
const vazio = (s: string): boolean => s.trim() === '';
const extensao = (nome: string): string => (nome.includes('.') ? nome.slice(nome.lastIndexOf('.') + 1).toLowerCase() : '');

// aviso no jeito da Parte 1: título, código, "O que é", "Por que importa" e "O que fazer"
function avisoKit(a: Aviso, porque?: string): HTMLElement {
  const pq = porque ?? PORQUE_AVISO[a.codigo];
  const titulo = TITULO_AVISO_KIT[a.codigo] ?? (a.nivel === 'vermelho' ? 'Pare e confira' : 'Confira');
  return h('div', { class: `aviso ${a.nivel}`, role: a.nivel === 'vermelho' ? 'alert' : undefined },
    h('h2', {}, titulo, h('span', { class: 'cod' }, a.codigo)),
    h('dl', {},
      h('dt', {}, 'O que é'), h('dd', {}, a.texto),
      pq ? h('dt', {}, 'Por que importa') : null, pq ? h('dd', {}, pq) : null,
      h('dt', {}, 'O que fazer'), h('dd', {}, a.comoCorrigir)));
}

interface Pilula { classe: 'ok' | 'am' | 'verm'; texto: string }
const OK: Pilula = { classe: 'ok', texto: 'completo' };
const falta = (faltas: string[]): Pilula => (faltas.length === 0 ? OK : { classe: 'am', texto: faltas.length === 1 ? `falta ${faltas[0]}` : `faltam ${faltas.length} campos` });

export function criarPainelKit(raiz: HTMLElement, kit: EstadoKit, base: Estado, opcoes: OpcoesPainelKit = {}): { desenhar(): void } {
  const salvar = opcoes.salvar ?? salvarNoNavegador;
  const topo = opcoes.topo ?? null;

  const secoes = new Map<string, boolean>(); // seções do 5b e do 7 abertas ou fechadas
  const escritos = new Map<string, string>(); // números como a pessoa escreveu (apagar o campo não vira "0")
  let dadosVistos: DadosObra | null = null;
  let mexendo = false; // os dados estão mudando por um campo desta tela
  let quieto = false; // muda o estado sem redesenhar o painel (campo de data: redesenha ao sair)
  let ucMarcada = 0; // qual bloco de UC está marcado na lista do 5a
  let trocandoUc = false;
  let ucVista: string | null = null;
  let empresaRascunho: Empresa | null = null;
  let rtRascunho: Responsavel | null = null;
  let erroGuardado: string | null = null;
  let erroBaixar: string | null = null;
  // avisos da última planilha baixada, com o que ela usou: se os dados, o caso, a UC ou a planilha mudarem, não valem mais
  let avisosPlanilha: { avisos: Aviso[]; dados: DadosObra; caso: Retrato['caso']; uc: string | null; planilha: string | null } | null = null;
  let solturas = 0; // 6a: cada soltura de imagem (mesmo nome, outra imagem) muda a chave do "Conferi"
  let projetoVisto: Retrato['projeto'] = null;
  let dadosDoCaso: DadosObra | null = null; // os dados que a tela conhece; trocados por fora = outro caso aberto
  let conferi = false; // 6a: "Conferi: cada imagem está na figura certa" (vive só na tela)
  let chaveFiguras: string | null = null;
  const trocadasAMao = new Set<string>(); // "figura:arquivo" escolhidos na lista do 6a
  const miniaturas = new Map<string, string>(); // nome da imagem -> endereço local (nada sai do navegador)
  const urlsDeBytes = new WeakMap<Uint8Array, string>();
  const escolhidosAgora = new Set<string>(); // 7: arquivos que a pessoa acabou de dizer o que são (ficam no alto)
  let kitMontado: { nome: string; bytes: Uint8Array } | null = null;
  let erroMontar: string | null = null;
  let zip8: { bytes: Uint8Array; nome: string } | null = null;
  let dxf8: Uint8Array | null = null;
  let conferencia8: { arquivo: string; itens: ItemConferencia[] } | null = null;
  let erroConferir: string | null = null;
  let erroTopo: string | null = null;
  let painel: Painel | null = null;

  const redesenhar = () => { painel?.desenhar(); };

  // outro projeto ou outro caso: o que a tela guardou do anterior (resultados, seções abertas, escolhas) sai
  function zerarDaObra() {
    avisosPlanilha = null;
    erroBaixar = null;
    conferi = false; chaveFiguras = null; trocadasAMao.clear();
    for (const u of miniaturas.values()) { try { URL.revokeObjectURL(u); } catch { /* sem miniatura */ } }
    miniaturas.clear();
    escolhidosAgora.clear();
    kitMontado = null; erroMontar = null;
    zip8 = null; dxf8 = null; conferencia8 = null; erroConferir = null;
    secoes.clear(); escritos.clear();
    ucMarcada = 0; trocandoUc = false;
  }
  // roda antes de cada desenho (é o primeiro a ouvir o estado)
  function sincronizar() {
    const r = base.ler();
    const k = kit.ler();
    const outroProjeto = r.projeto !== projetoVisto;
    const outroCaso = k.dados !== dadosDoCaso && !mexendo && dadosDoCaso !== null;
    if (outroProjeto || outroCaso) zerarDaObra();
    projetoVisto = r.projeto;
    dadosDoCaso = k.dados;
  }
  const mudar = (f: (d: DadosObra) => void) => {
    mexendo = true;
    try { kit.mudarDados(f); } finally { mexendo = false; }
  };
  const urlDe = (bytes: Uint8Array, tipo: string): string | null => {
    const ja = urlsDeBytes.get(bytes);
    if (ja) return ja;
    try {
      const u = URL.createObjectURL(new Blob([bytes as BlobPart], { type: tipo }));
      urlsDeBytes.set(bytes, u);
      return u;
    } catch { return null; } // sem miniatura: fica o nome
  };

  // ---------- campos (o id e o data-foco são a chave do campo: o foco volta para ele depois do redesenho) ----------

  function campo(chave: string, rotulo: Filho, valor: string, aoMudar: (v: string) => void,
    o: { dado?: boolean; placeholder?: string; inputmode?: string; nota?: Filho; tipo?: string } = {}): HTMLElement {
    const data = o.tipo === 'date';
    const entrada = h('input', {
      id: chave, 'data-foco': chave, type: o.tipo ?? 'text', value: valor, class: o.dado ? 'dado' : undefined,
      placeholder: o.placeholder, inputmode: o.inputmode, autocomplete: 'off',
      oninput: (e) => {
        if ((e as InputEvent).isComposing) return; // acento em composição: espera terminar
        const v = (e.target as HTMLInputElement).value;
        if (!data) { aoMudar(v); return; }
        // a data muda segmento por segmento: redesenhar no meio levaria o cursor para o dia
        quieto = true;
        try { aoMudar(v); } finally { quieto = false; }
      },
      oncompositionend: (e) => aoMudar((e.target as HTMLInputElement).value),
      onblur: data ? () => { setTimeout(redesenhar, 0); } : undefined,
    });
    return h('div', { class: 'cx' }, h('label', { for: chave }, rotulo), entrada, o.nota ? h('span', { class: 'nota' }, o.nota) : null);
  }

  function lista(chave: string, rotulo: Filho, valor: string, opcoesLista: [string, string][], aoMudar: (v: string) => void,
    o: { vazio?: string; nota?: Filho } = {}): HTMLElement {
    const s = h('select', { id: chave, 'data-foco': chave, onchange: (e) => aoMudar((e.target as HTMLSelectElement).value) },
      o.vazio !== undefined ? h('option', { value: '' }, o.vazio) : null,
      ...opcoesLista.map(([v, t]) => h('option', { value: v }, t)));
    s.value = valor;
    return h('div', { class: 'cx' }, h('label', { for: chave }, rotulo), s, o.nota ? h('span', { class: 'nota' }, o.nota) : null);
  }

  function radios(chave: string, legenda: string, valor: string | null, opcoesRadio: [string, string][], aoMudar: (v: string) => void): HTMLElement {
    return h('fieldset', { class: 'cx' }, h('legend', {}, legenda),
      h('div', { class: 'opcoes' }, ...opcoesRadio.map(([v, t]) => {
        const r = h('input', { type: 'radio', name: chave, value: v, 'data-foco': `${chave}:${v}`, onchange: () => aoMudar(v) });
        r.checked = valor === v;
        return h('label', {}, r, ` ${t}`);
      })));
  }

  // número digitado: o texto fica como a pessoa escreveu; só número válido vai ao estado
  function entradaNumero(chave: string, n: number, aoMudar: (n: number) => void, o: { decimal?: boolean; zeroVazio?: boolean; rotulo?: string } = {}): HTMLInputElement {
    const escrito = escritos.get(chave) ?? (o.zeroVazio && n === 0 ? '' : String(n).replace('.', ','));
    const valido = (t: string) => t === '' || (o.decimal ? /^\d+([.,]\d+)?$/ : /^\d+$/).test(t);
    const e = h('input', {
      id: chave, 'data-foco': chave, type: 'text', inputmode: o.decimal ? 'decimal' : 'numeric', value: escrito, autocomplete: 'off',
      class: valido(escrito.trim()) ? 'dado' : 'dado invalido', 'aria-label': o.rotulo,
      oninput: (ev) => {
        const v = (ev.target as HTMLInputElement).value;
        escritos.set(chave, v);
        const t = v.trim();
        if (!valido(t)) { redesenhar(); return; }
        aoMudar(t === '' ? 0 : Number(t.replace(',', '.')));
      },
    });
    return e;
  }

  function secao(id: string, titulo: string, resumo: string, pil: Pilula | null, padraoAberta: boolean, dentro: Filho[]): HTMLElement {
    if (!secoes.has(id)) secoes.set(id, padraoAberta);
    const d = h('details', { class: 'secao', 'data-secao': id, ontoggle: (e) => { secoes.set(id, (e.target as HTMLDetailsElement).open); } },
      h('summary', { 'data-foco': `secao:${id}` }, h('span', {}, titulo, h('small', {}, resumo)), pil ? h('span', { class: `pilula ${pil.classe}` }, pil.texto) : null),
      h('div', { class: 'dentro' }, ...dentro));
    if (secoes.get(id)) d.setAttribute('open', '');
    return d;
  }

  // ---------- o que a tela calcula do retrato ----------

  const prontoParaBaixar = (r: Retrato): boolean => !!r.caso && r.appsPendentes === 0 && r.arvoresSemPonto === 0;
  const vermelhos = (r: Retrato, k: RetratoKit): Aviso[] =>
    [...(r.caso?.avisos ?? []), ...r.avisosArvores, ...r.avisosEmArea, ...r.avisosFaixa, ...k.avisosDados].filter((a) => a.nivel === 'vermelho');
  const metros = (r: Retrato): Record<TipoRede, number> => (r.rede ? metrosDaRede(r.rede) : { MT: 0, BT: 0, CONJ: 0 });

  function estadoDasSecoes(r: Retrato, k: RetratoKit): Map<string, { pil: Pilula; resumo: string }> {
    const d = k.dados;
    const avisos = (s: string) => k.avisosDados.filter((a) => SECAO_DO_AVISO[a.codigo] === s);
    const comAviso = (s: string, p: Pilula): Pilula => {
      const v = avisos(s).find((a) => a.nivel === 'vermelho');
      if (v) return { classe: 'verm', texto: v.codigo === 'POSTES_NAO_BATEM' ? 'postes não batem' : 'corrija o vermelho' };
      const am = avisos(s).find((a) => a.nivel === 'amarelo');
      return p.classe === 'ok' && am ? { classe: 'am', texto: am.codigo === 'MUNICIPIO_EDITADO' ? 'município trocado' : 'confira o aviso' } : p;
    };
    const m = metros(r);
    const I = d.interessado;
    const O = d.obra;
    const F = d.finalidade;
    const tipo = TIPOS_ATENDIMENTO.find(([t]) => t === F.tipo)?.[1];
    const respostas = [d.planilha.regularidadeApresentou, d.planilha.regularidadeAnexou, d.planilha.reformaAgraria, d.planilha.manutencao, d.planilha.podaAnexada, d.planilha.cvtFotos];
    const faltamRespostas = respostas.filter((x) => x === null).length + (vazio(d.planilha.validador) ? 1 : 0);
    const retirada = d.retirada.nenhuma || d.retirada.postes > 0 || Object.values(d.retirada.metros).some((x) => (x ?? 0) > 0);
    const novos = r.rede ? postesNovos(r.rede) : 0;
    const faltaCabo = [m.MT + m.CONJ > 0 && vazio(d.rede.caboMT) ? 'o cabo da MT' : '', m.BT + m.CONJ > 0 && vazio(d.rede.caboBT) ? 'o cabo da BT' : ''].filter(Boolean);
    return new Map([
      ['interessado', {
        pil: comAviso('interessado', falta([vazio(I.nome) ? 'o nome' : '', vazio(I.endereco) ? 'o endereço' : '', vazio(I.bairro) ? 'o bairro' : '', vazio(I.cep) ? 'o CEP' : ''].filter(Boolean))),
        resumo: I.nome.trim() || 'nome, endereço e CEP do cliente',
      }],
      ['obra', {
        pil: comAviso('obra', falta([vazio(O.endereco) ? 'o endereço' : '', vazio(O.sed) ? 'a SED' : '', vazio(O.alimentador) ? 'o alimentador' : '', vazio(O.csi) ? 'o C.S.I.' : '', vazio(O.dataSob) ? 'a data da SOB' : '', O.zona === null ? 'a zona' : ''].filter(Boolean))),
        resumo: [O.municipio.trim() || r.caso?.municipio || '', O.sed.trim(), O.zona ? O.zona.toLowerCase() : ''].filter(Boolean).join(' · ') || 'endereço, SED, alimentador e data da SOB',
      }],
      ['finalidade', {
        pil: comAviso('finalidade', falta([F.tipo === null ? 'o tipo' : '', F.tipo === 'ligacao-b' && F.fases === null ? 'as fases' : ''].filter(Boolean))),
        resumo: tipo ? `${tipo}${F.tipo === 'ligacao-b' && F.fases ? ` · ${F.fases === 'mono' ? 'monofásico' : 'trifásico'}` : ''}` : 'o tipo de atendimento',
      }],
      ['rede', { pil: comAviso('rede', falta(faltaCabo)), resumo: `${plural(novos, 'poste novo', 'postes novos')} no desenho` }],
      ['retirada', {
        pil: retirada ? OK : { classe: 'am', texto: 'diga o que sai' },
        resumo: d.retirada.nenhuma ? 'não haverá retirada' : retirada ? 'rede e postes a retirar' : 'o que a obra tira',
      }],
      ['planilha', { pil: faltamRespostas ? { classe: 'am', texto: faltamRespostas === 1 ? 'falta 1 resposta' : `faltam ${faltamRespostas} respostas` } : OK, resumo: 'perguntas da Planilha Padrão' }],
      ['regional', { pil: d.regional ? OK : { classe: 'am', texto: 'escolha a regional' }, resumo: d.regional ?? 'vai no nome da pasta do kit' }],
      ['guardado', {
        pil: !k.empresa ? { classe: 'am', texto: 'falta a empresa' } : !k.rt ? { classe: 'am', texto: 'falta o RT' } : !k.rt.assinatura ? { classe: 'am', texto: 'sem assinatura' } : OK,
        resumo: [k.empresa?.nome, k.rt?.nome].filter(Boolean).join(' · ') || 'empresa e responsável técnico',
      }],
    ]);
  }

  // ---------- 5a UC do cliente ----------

  function passo5a(r: Retrato, k: RetratoKit, ctx: ContextoPasso): Filho[] {
    const caso = r.caso!;
    const os = r.projeto?.os ?? '';
    const chaveUc = k.uc ? k.uc.ponto.join(',') : null;
    if (chaveUc !== ucVista) { trocandoUc = false; ucVista = chaveUc; }
    if (ucMarcada >= k.candidatosUc.length) ucMarcada = 0;
    const botaoMarcar = (classe: string) => h('button', {
      type: 'button', class: classe, 'data-foco': 'uc:marcar', 'aria-pressed': k.escolhendoUc ? 'true' : 'false',
      onclick: () => { if (k.escolhendoUc) kit.cancelarUc(); else kit.marcarUcNoMapa(); },
    }, k.escolhendoUc ? 'Cancelar o clique' : 'Marcar no mapa');
    const clique = k.escolhendoUc ? h('p', { class: 'amarelo-txt', role: 'status' }, 'Clique no mapa onde fica a UC.') : null;
    const corpo: Filho[] = [
      h('p', { class: 'ajuda' }, 'A ', h('abbr', { title: 'UC: unidade consumidora, o padrão de entrada do cliente' }, 'UC'),
        ' é o ponto do cliente. O memorial diz se ela está dentro de cada área, e o assunto da planilha muda com isso.'),
    ];
    if (k.uc && !trocandoUc) {
      const uc = k.uc;
      const doBloco = k.candidatosUc.findIndex((c) => c.ponto[0] === uc.ponto[0] && c.ponto[1] === uc.ponto[1]);
      const assunto = r.rede ? assuntoTexto(os, partesDoAssunto(caso, uc, metrosDaRede(r.rede))) : null;
      corpo.push(h('article', { class: 'cartao' },
        h('h2', {}, 'UC do solicitante'),
        h('dl', { class: 'linha-dl' },
          h('dt', {}, 'Bloco'), h('dd', {}, doBloco >= 0 ? `${k.candidatosUc[doBloco].bloco} (UC ${doBloco + 1})` : 'marcada no mapa'),
          h('dt', {}, 'No memorial'), h('dd', {}, h('b', {}, coordTexto(uc.ponto))),
          h('dt', {}, 'Dentro de'), h('dd', {}, uc.dentro.length ? uc.dentro.map((a) => a.nome).join(', ') : 'nenhuma área protegida'),
          h('dt', {}, 'Em APP'), h('dd', {}, uc.emApp ? 'Sim' : 'Não')),
        h('p', { class: 'nota' }, 'Assunto da planilha (célula A1):'),
        assunto ? h('pre', { class: 'resumo-txt' }, assunto) : h('p', { class: 'amarelo-txt' }, TEXTOS_PLANILHA.semAssunto),
        h('div', {}, h('button', { type: 'button', class: 'link', 'data-foco': 'uc:trocar', onclick: () => { trocandoUc = true; redesenhar(); } }, 'trocar a UC'))));
    } else if (k.candidatosUc.length) {
      const n = k.candidatosUc.length;
      corpo.push(h('div', { class: 'grupo' },
        h('p', { class: 'ajuda' }, h('strong', {}, `O site achou ${plural(n, 'bloco', 'blocos')} de UC no desenho.`), n > 1 ? ' Escolha a do solicitante. As outras não mudam o assunto.' : ' Confira se é a do solicitante.'),
        ...k.candidatosUc.map((c, i) => {
          const r0 = h('input', { type: 'radio', name: 'uc', 'data-foco': `uc:${i}`, onchange: () => { ucMarcada = i; redesenhar(); } });
          r0.checked = i === ucMarcada;
          return h('label', { class: 'cand' }, r0,
            h('span', {}, h('span', { class: 'nome' }, c.bloco), h('span', { class: 'det' }, `camada ${c.camada} · a ${metrosTexto(c.distancia)} m da rede nova`)),
            h('span', { class: 'marca' }, `UC ${i + 1}`));
        }),
        h('div', { class: 'acoes-linha' },
          h('button', { type: 'button', class: 'botao forte', 'data-foco': 'uc:confirmar', onclick: () => kit.escolherUc(ucMarcada) }, `Confirmar a UC ${ucMarcada + 1}`),
          botaoMarcar('link')),
        clique));
    } else {
      corpo.push(h('div', { class: 'aviso amarelo' },
        h('h2', {}, TITULO_AVISO_KIT.UC_NAO_ACHADA, h('span', { class: 'cod' }, 'UC_NAO_ACHADA')),
        h('dl', {},
          h('dt', {}, 'O que é'), h('dd', {}, TP.ucNaoAchada),
          h('dt', {}, 'Por que importa'), h('dd', {}, TP.porqueUcNaoAchada),
          h('dt', {}, 'O que fazer'), h('dd', {}, TP.comoUcNaoAchada)),
        h('div', { class: 'acoes' }, botaoMarcar('botao mini forte'))), clique);
    }
    if (k.uc && trocandoUc) corpo.push(h('div', {}, h('button', { type: 'button', class: 'link', onclick: () => { trocandoUc = false; redesenhar(); } }, 'manter a UC de antes')));
    corpo.push(h('button', { type: 'button', class: 'botao forte', 'data-foco': 'seguir:5a', onclick: () => { if (k.escolhendoUc) kit.cancelarUc(); ctx.seguir(); } }, 'Seguir para os dados da obra'));
    return corpo;
  }

  // ---------- 5b dados da obra ----------

  function guardado(k: RetratoKit): Filho[] {
    const filhos: Filho[] = [h('p', { class: 'ajuda' }, 'Digitado uma vez, fica só neste navegador. ', h('strong', {}, 'Nunca vai para a internet.'))];
    if (erroGuardado) filhos.push(h('p', { class: 'erro', role: 'alert' }, erroGuardado));
    // empresa
    if (!k.empresa && !empresaRascunho) empresaRascunho = { nome: '', cnpj: '', endereco: '', municipio: '', telefone: '', email: '', logo: null };
    if (empresaRascunho) {
      const e = empresaRascunho;
      const lerLogo = (f: File) => void lerBytes(f).then((b) => {
        const img = lerImagem(b);
        erroGuardado = img ? null : TP.logoInvalido;
        if (img) e.logo = img;
        redesenhar();
      });
      filhos.push(h('div', { class: 'arquivo forma' },
        h('div', { class: 'grupo' },
          h('div', { class: 'nome' }, 'Empresa'),
          campo('empresa.nome', 'Nome', e.nome, (v) => { e.nome = v; }),
          campo('empresa.cnpj', 'CNPJ', e.cnpj, (v) => { e.cnpj = v; }, { dado: true, inputmode: 'numeric' }),
          campo('empresa.endereco', 'Endereço', e.endereco, (v) => { e.endereco = v; }),
          h('div', { class: 'duas' },
            campo('empresa.municipio', 'Município', e.municipio, (v) => { e.municipio = v; }),
            campo('empresa.telefone', 'Telefone', e.telefone, (v) => { e.telefone = v; }, { inputmode: 'tel' })),
          campo('empresa.email', 'E-mail', e.email, (v) => { e.email = v; }, { inputmode: 'email' }),
          h('div', { class: 'acoes-linha' },
            h('span', { class: 'det' }, e.logo ? 'com logotipo' : 'sem logotipo'),
            botaoTrocar('.png,.jpg,.jpeg', lerLogo, 'Escolher o logotipo da empresa (PNG ou JPG)', e.logo ? 'trocar o logotipo' : 'escolher o logotipo')),
          h('div', { class: 'acoes-linha' },
            h('button', { type: 'button', class: 'botao mini forte', 'data-foco': 'empresa:guardar', onclick: () => { empresaRascunho = null; void kit.guardarEmpresa(e); } }, 'Guardar a empresa'),
            k.empresa ? h('button', { type: 'button', class: 'link', onclick: () => { empresaRascunho = null; redesenhar(); } }, 'cancelar') : null))));
    } else if (k.empresa) {
      const e = k.empresa;
      filhos.push(h('div', { class: 'arquivo' },
        h('div', {}, h('div', { class: 'nome' }, e.nome || 'Empresa sem nome'),
          h('div', { class: 'det' }, [e.cnpj && `CNPJ ${e.cnpj}`, [e.endereco, e.municipio].filter(Boolean).join(', ')].filter(Boolean).join(' · ')),
          h('div', { class: 'det' }, [e.telefone, e.email, e.logo ? 'com logotipo' : 'sem logotipo'].filter(Boolean).join(' · '))),
        h('div', { class: 'acoes' }, h('button', { type: 'button', class: 'link', 'aria-label': 'trocar os dados da empresa', onclick: () => { empresaRascunho = structuredClone(e); redesenhar(); } }, 'trocar'))));
    }
    // responsável técnico
    if (!k.rt && !rtRascunho) rtRascunho = { nome: '', registro: '', rnp: '', email: '', assinatura: null };
    if (rtRascunho) {
      const t = rtRascunho;
      filhos.push(h('div', { class: 'arquivo forma' },
        h('div', { class: 'grupo' },
          h('div', { class: 'nome' }, 'Responsável técnico'),
          campo('rt.nome', 'Nome', t.nome, (v) => { t.nome = v; }),
          h('div', { class: 'duas' },
            campo('rt.registro', 'Registro (CREA)', t.registro, (v) => { t.registro = v; }, { dado: true }),
            campo('rt.rnp', 'RNP', t.rnp, (v) => { t.rnp = v; }, { dado: true, inputmode: 'numeric' })),
          campo('rt.email', 'E-mail', t.email, (v) => { t.email = v; }, { inputmode: 'email' }),
          h('p', { class: 'ajuda' }, 'Use os mesmos dados da ART.'),
          h('div', { class: 'acoes-linha' },
            h('button', { type: 'button', class: 'botao mini forte', 'data-foco': 'rt:guardar', onclick: () => { rtRascunho = null; void kit.guardarRt(t); } }, 'Guardar o responsável técnico'),
            k.rt ? h('button', { type: 'button', class: 'link', onclick: () => { rtRascunho = null; redesenhar(); } }, 'cancelar') : null))));
    } else if (k.rt) {
      const t = k.rt;
      filhos.push(h('div', { class: 'arquivo' },
        h('div', {}, h('div', { class: 'nome' }, t.nome || 'Responsável técnico sem nome'),
          h('div', { class: 'det' }, ['Responsável técnico', t.registro && `CREA ${t.registro}`, t.rnp && `RNP ${t.rnp}`].filter(Boolean).join(' · ')),
          t.email ? h('div', { class: 'det' }, t.email) : null,
          h('p', { class: 'ajuda folga' }, 'Use os mesmos dados da ART.')),
        h('div', { class: 'acoes' }, h('button', { type: 'button', class: 'link', 'aria-label': 'trocar os dados do responsável técnico', onclick: () => { rtRascunho = structuredClone(t); redesenhar(); } }, 'trocar'))));
    }
    // assinatura (só PNG)
    const rt = k.rt;
    if (rt) {
      const lerAssinatura = (f: File) => void lerBytes(f).then((b) => {
        const img: Imagem | null = lerImagem(b);
        if (!img || img.tipo !== 'png') { erroGuardado = TP.assinaturaNaoPng; redesenhar(); return; }
        erroGuardado = null;
        void kit.guardarRt({ ...(kit.ler().rt ?? rt), assinatura: img });
      });
      const a = rt.assinatura;
      const url = a ? urlDe(a.bytes, 'image/png') : null;
      filhos.push(h('div', { class: 'arquivo' },
        h('div', {}, h('div', { class: 'nome' }, 'Assinatura do responsável técnico'),
          h('div', { class: 'det' }, a ? `imagem PNG · ${a.largura} × ${a.altura} px` : 'nenhuma imagem guardada'),
          a && url ? h('div', { class: 'assin folga' }, h('img', { src: url, alt: 'Miniatura da assinatura guardada' })) : null,
          // provisório: texto a confirmar com o Italo
          h('p', { class: 'ajuda folga' }, 'Só entra no memorial e na planilha quando o caso não tem vermelho.')),
        h('div', { class: 'acoes' },
          botaoTrocar('.png', lerAssinatura, 'Escolher a imagem PNG da assinatura', a ? 'trocar' : 'escolher'),
          a ? h('button', { type: 'button', class: 'link', 'aria-label': 'apagar a assinatura guardada', onclick: () => void kit.apagarAssinatura() }, 'apagar') : null)));
    } else {
      filhos.push(h('p', { class: 'ajuda' }, 'Guarde o responsável técnico para escolher a imagem da assinatura.'));
    }
    return filhos;
  }

  function passo5b(r: Retrato, k: RetratoKit, ctx: ContextoPasso): Filho[] {
    const d = k.dados;
    // dados trocados por fora (caso salvo aberto): o que estava escrito nos campos de número era de antes
    if (d !== dadosVistos) { if (!mexendo) escritos.clear(); dadosVistos = d; }
    const est = estadoDasSecoes(r, k);
    const ids = [...est.keys()];
    const primeira = ids.find((id) => est.get(id)!.pil.classe !== 'ok');
    const padrao = (id: string) => est.get(id)!.pil.classe === 'verm' || id === primeira;
    const avisos = (s: string) => k.avisosDados.filter((a) => SECAO_DO_AVISO[a.codigo] === s).map((a) => avisoKit(a));
    const S = (id: string, titulo: string, dentro: Filho[]) => secao(id, titulo, est.get(id)!.resumo, est.get(id)!.pil, padrao(id), dentro);
    const m = metros(r);
    const novos = r.rede ? postesNovos(r.rede) : 0;
    const soma = d.rede.postes.reduce((s, p) => s + p.quantidade, 0);
    const confirmadas = r.apps.filter((a) => a.resposta === 'confirmada');
    const sugerida = regionalSugerida(d.obra.municipio.trim() || r.caso?.municipio || '');
    const outros = k.avisosDados.filter((a) => !SECAO_DO_AVISO[a.codigo] && a.codigo !== 'CASO_OUTRO_PROJETO');

    const postes = h('table', { class: 'postes', 'aria-labelledby': 'rot-postes' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Altura (m)'), h('th', {}, 'daN'), h('th', { class: 'n' }, 'Quantos'), h('th', {}, h('span', { class: 'so-leitor' }, 'Tirar')))),
      h('tbody', {}, ...d.rede.postes.map((p, i) => h('tr', {},
        h('td', {}, entradaNumero(`rede.postes.${i}.altura`, p.altura, (n) => mudar((x) => { x.rede.postes[i].altura = n; }), { decimal: true, zeroVazio: true, rotulo: `Altura do tipo ${i + 1}` })),
        h('td', {}, entradaNumero(`rede.postes.${i}.daN`, p.daN, (n) => mudar((x) => { x.rede.postes[i].daN = n; }), { zeroVazio: true, rotulo: `daN do tipo ${i + 1}` })),
        h('td', {}, entradaNumero(`rede.postes.${i}.quantidade`, p.quantidade, (n) => mudar((x) => { x.rede.postes[i].quantidade = n; }), { zeroVazio: true, rotulo: `Quantidade do tipo ${i + 1}` })),
        h('td', {}, h('button', {
          type: 'button', class: 'link', 'aria-label': `Tirar o tipo de poste ${i + 1}`,
          onclick: () => { for (const c of [...escritos.keys()]) if (c.startsWith('rede.postes.')) escritos.delete(c); mudar((x) => { x.rede.postes.splice(i, 1); }); },
        }, 'tirar'))))),
      h('tfoot', {}, h('tr', {}, h('td', { colspan: 2 }, 'Soma'), h('td', { class: soma === novos ? 'n' : 'n bate' }, `${soma} de ${novos}`), h('td', {}))));

    return [
      h('p', { class: 'ajuda' }, 'O que você digitar aqui vai para o memorial e para a planilha. ', h('strong', {}, 'Os dados do cliente não ficam guardados'), ' quando a página fecha, a não ser que você salve o caso.'),
      ...outros.map((a) => avisoKit(a)),
      S('interessado', 'Interessado', [
        campo('interessado.nome', 'Nome', d.interessado.nome, (v) => mudar((x) => { x.interessado.nome = v; })),
        campo('interessado.endereco', 'Endereço (logradouro e número)', d.interessado.endereco, (v) => mudar((x) => { x.interessado.endereco = v; })),
        h('div', { class: 'duas' },
          campo('interessado.bairro', 'Bairro ou zona', d.interessado.bairro, (v) => mudar((x) => { x.interessado.bairro = v; })),
          campo('interessado.cep', 'CEP', d.interessado.cep, (v) => mudar((x) => { x.interessado.cep = v; }), { dado: true, inputmode: 'numeric', placeholder: '00000-000' })),
        ...avisos('interessado'),
      ]),
      S('obra', 'Obra', [
        campo('obra.endereco', 'Endereço da obra', d.obra.endereco, (v) => mudar((x) => { x.obra.endereco = v; })),
        campo('obra.municipio', 'Município', d.obra.municipio, (v) => mudar((x) => { x.obra.municipio = v; }), {
          placeholder: r.caso?.municipio ?? undefined,
          // provisório: texto a confirmar com o Italo
          nota: r.caso?.municipio ? `Veio do KMZ: ${r.caso.municipio}. Em branco, o memorial usa este. Se você trocar, sai um aviso: o órgão foi calculado com o do KMZ.` : 'O KMZ não disse o município: digite.',
        }),
        h('div', { class: 'duas' },
          campo('obra.sed', 'Subestação (SED)', d.obra.sed, (v) => mudar((x) => { x.obra.sed = v; })),
          campo('obra.alimentador', 'Alimentador', d.obra.alimentador, (v) => mudar((x) => { x.obra.alimentador = v; }), { dado: true })),
        h('div', { class: 'duas' },
          campo('obra.csi', h('abbr', { title: 'C.S.I.: o número do circuito anterior' }, 'C.S.I.'), d.obra.csi, (v) => mudar((x) => { x.obra.csi = v; }), { dado: true }),
          campo('obra.dataSob', 'Data da SOB na GOM.net', d.obra.dataSob, (v) => mudar((x) => { x.obra.dataSob = v; }), { tipo: 'date' })),
        radios('obra.zona', 'Zona', d.obra.zona, [['RURAL', 'Rural'], ['URBANA', 'Urbana']], (v) => mudar((x) => { x.obra.zona = v as 'RURAL' | 'URBANA'; })),
        ...avisos('obra'),
      ]),
      S('finalidade', 'Finalidade', [
        lista('finalidade.tipo', 'Tipo de atendimento', d.finalidade.tipo ?? '', TIPOS_ATENDIMENTO, (v) => mudar((x) => { x.finalidade.tipo = (v || null) as TipoAtendimento | null; }), { vazio: 'escolha o tipo' }),
        d.finalidade.tipo === 'ligacao-b'
          ? radios('finalidade.fases', 'Fases', d.finalidade.fases, [['mono', 'Monofásico'], ['tri', 'Trifásico']], (v) => mudar((x) => { x.finalidade.fases = v as 'mono' | 'tri'; }))
          : null,
        h('div', { class: 'cx' },
          h('label', { for: 'finalidade.texto' }, 'Texto da finalidade no memorial'),
          h('textarea', {
            id: 'finalidade.texto', 'data-foco': 'finalidade.texto', value: finalidadePadrao(d),
            oninput: (e) => { if (!(e as InputEvent).isComposing) mudar((x) => { x.finalidade.texto = (e.target as HTMLTextAreaElement).value; }); },
            oncompositionend: (e) => mudar((x) => { x.finalidade.texto = (e.target as HTMLTextAreaElement).value; }),
          }),
          h('span', { class: 'nota' }, 'O site escreve pelo tipo. Pode mudar à vontade.',
            d.finalidade.texto !== '' ? h('button', { type: 'button', class: 'link', onclick: () => mudar((x) => { x.finalidade.texto = ''; }) }, 'voltar ao texto do site') : null)),
        ...avisos('finalidade'),
      ]),
      S('rede', 'Rede', [
        m.MT + m.CONJ > 0 || m.BT + m.CONJ === 0 ? campo('rede.caboMT', 'Cabo da MT', d.rede.caboMT, (v) => mudar((x) => { x.rede.caboMT = v; })) : null,
        m.BT + m.CONJ > 0 || m.MT + m.CONJ === 0 ? campo('rede.caboBT', 'Cabo da BT', d.rede.caboBT, (v) => mudar((x) => { x.rede.caboBT = v; })) : null,
        h('div', { class: 'cx' }, h('span', { class: 'rot', id: 'rot-postes' }, 'Postes novos por tipo'), postes,
          h('div', {}, h('button', { type: 'button', class: 'link', 'data-foco': 'rede.postes:somar', onclick: () => mudar((x) => { x.rede.postes.push({ altura: 0, daN: 0, quantidade: 0 }); }) }, 'Somar outro tipo de poste'))),
        r.limpeza.length
          ? lista('predominancia', 'Vegetação da limpeza de faixa', d.predominancia ?? '', PREDOMINANCIAS, (v) => mudar((x) => { x.predominancia = (v || null) as Predominancia | null; }), { vazio: 'escolha a predominância' })
          : null,
        ...avisos('rede'),
      ]),
      S('retirada', 'A retirar', [
        (() => {
          const c = h('input', { type: 'checkbox', 'data-foco': 'retirada.nenhuma', onchange: (e) => mudar((x) => { x.retirada.nenhuma = (e.target as HTMLInputElement).checked; }) });
          c.checked = d.retirada.nenhuma;
          return h('label', { class: 'confirma-solta' }, c, 'Não haverá retirada de rede nem de postes');
        })(),
        ...(d.retirada.nenhuma ? [] : [
          // provisório: texto a confirmar com o Italo
          h('p', { class: 'ajuda' }, 'Sem marcar, diga os metros de rede por tipo e quantos postes saem.'),
          h('div', { class: 'duas' }, ...TIPOS_REDE.map(([t, rot]) => h('div', { class: 'cx' },
            h('label', { for: `retirada.metros.${t}` }, `Metros de ${rot}`),
            entradaNumero(`retirada.metros.${t}`, d.retirada.metros[t] ?? 0, (n) => mudar((x) => { x.retirada.metros[t] = n; }), { decimal: true, zeroVazio: true }))),
          h('div', { class: 'cx' }, h('label', { for: 'retirada.postes' }, 'Postes'),
            entradaNumero('retirada.postes', d.retirada.postes, (n) => mudar((x) => { x.retirada.postes = n; }), { zeroVazio: true }))),
        ]),
      ]),
      S('planilha', 'Planilha', [
        lista('planilha.regularidadeApresentou', 'O cliente apresentou o documento de regularidade ambiental?', d.planilha.regularidadeApresentou ?? '', SIM_NAO_NA, (v) => mudar((x) => { x.planilha.regularidadeApresentou = (v || null) as Resposta; }), { vazio: 'responda' }),
        lista('planilha.regularidadeAnexou', 'Ele foi anexado na GOM.net?', d.planilha.regularidadeAnexou ?? '', SIM_NAO_NA, (v) => mudar((x) => { x.planilha.regularidadeAnexou = (v || null) as Resposta; }), { vazio: 'responda' }),
        h('div', { class: 'duas' },
          lista('planilha.reformaAgraria', 'Reforma agrária', d.planilha.reformaAgraria ?? '', SIM_NAO, (v) => mudar((x) => { x.planilha.reformaAgraria = (v || null) as Resposta; }), { vazio: 'responda' }),
          lista('planilha.manutencao', 'Manutenção sob rede existente', d.planilha.manutencao ?? '', SIM_NAO, (v) => mudar((x) => { x.planilha.manutencao = (v || null) as Resposta; }), { vazio: 'responda' })),
        h('div', { class: 'duas' },
          lista('planilha.podaAnexada', 'Autorização de poda anexada', d.planilha.podaAnexada ?? '', SIM_NAO, (v) => mudar((x) => { x.planilha.podaAnexada = (v || null) as Resposta; }), { vazio: 'responda' }),
          lista('planilha.cvtFotos', 'CVT e fotos atualizadas', d.planilha.cvtFotos ?? '', SIM_NAO, (v) => mudar((x) => { x.planilha.cvtFotos = (v || null) as Resposta; }), { vazio: 'responda' })),
        campo('planilha.validador', 'Validador Enel', d.planilha.validador, (v) => mudar((x) => { x.planilha.validador = v; })),
        ...confirmadas.map((a) => {
          const id = a.proposta.agua.id;
          return lista(`tipoAgua.${id}`, `Tipo de água da APP de ${a.proposta.agua.nome}`, d.tipoAgua[id] ?? '', AGUAS,
            (v) => mudar((x) => { if (v) x.tipoAgua[id] = v as TipoAgua; else delete x.tipoAgua[id]; }),
            // provisório: texto a confirmar com o Italo
            { vazio: 'o do KMZ', nota: 'Vai para a planilha e para o memorial, com as mesmas palavras. Sem escolher, vale o tipo que o KMZ diz.' });
        }),
      ]),
      S('regional', 'Regional da pasta', [
        lista('regional', 'Regional', d.regional ?? '', REGIONAIS.map((x) => [x, x]), (v) => mudar((x) => { x.regional = (v || null) as Regional | null; }), {
          vazio: 'escolha a regional',
          // provisório: texto a confirmar com o Italo
          nota: 'Vai no nome da pasta do kit. O site só sugere sozinho para Fortaleza; nos outros municípios, escolha na lista.',
        }),
        sugerida && d.regional === null
          ? h('div', {}, h('button', { type: 'button', class: 'link', onclick: () => mudar((x) => { x.regional = sugerida; }) }, `usar ${sugerida}, a regional do município`))
          : null,
      ]),
      S('guardado', 'Guardado neste computador', guardado(k)),
      h('button', { type: 'button', class: 'botao forte', 'data-foco': 'seguir:5b', onclick: () => ctx.seguir() }, 'Seguir para baixar'),
    ];
  }

  // ---------- 6 baixar ----------

  function baixar(fazer: () => void) {
    erroBaixar = null;
    try { fazer(); } catch (e) { erroBaixar = mensagem(e); }
    redesenhar();
  }

  function linhaBaixar(nome: string, rotulo: string, arquivo: string, det: Filho, desabilitado: boolean, fazer: () => void, selos: Filho[] = [], extra: Filho = null): HTMLElement {
    return h('div', { class: 'baixa' },
      h('span', { class: 'nome' }, nome),
      h('button', { type: 'button', class: 'botao mini', 'aria-label': rotulo, disabled: desabilitado, onclick: () => baixar(fazer) }, 'Baixar'),
      h('code', {}, arquivo),
      h('span', { class: 'det' }, det),
      selos.some(Boolean) ? h('span', { class: 'selos' }, ...selos) : null,
      extra);
  }

  function avisoAssinatura(r: Retrato, k: RetratoKit): Filho {
    const vs = vermelhos(r, k);
    if (k.assinar) return h('p', { class: 'ok' }, TP.assinados.replace('{rt}', k.rt?.nome ?? ''));
    if (vs.length) {
      return avisoKit({
        nivel: 'vermelho', codigo: 'NAO_ASSINADO',
        texto: TP.naoAssinado.replace('{n}', plural(vs.length, 'vermelho', 'vermelhos')).replace('{lista}', vs.map((a) => a.texto).join(' ')),
        comoCorrigir: TP.comoNaoAssinado,
      }, TP.porqueNaoAssinado.replace('{nota}', TEXTOS_MEMORIAL.naoAssinado));
    }
    return avisoKit({ nivel: 'amarelo', codigo: 'SEM_ASSINATURA', texto: TP.semAssinatura, comoCorrigir: TP.comoSemAssinatura },
      TP.porqueSemAssinatura.replace('{nota}', TEXTOS_MEMORIAL.semAssinatura));
  }

  function passo6(r: Retrato, k: RetratoKit, ctx: ContextoPasso): Filho[] {
    const os = r.projeto?.os ?? '';
    const pronto = prontoParaBaixar(r);
    const vermelhoNoCaso = !!r.caso?.avisos.some((a) => a.nivel === 'vermelho');
    const selo = (classe: string, texto: string) => h('span', { class: `pilula ${classe}` }, texto);
    const seloAssinatura = (fem: boolean) => (k.assinar ? selo('ok', fem ? 'assinada' : 'assinado')
      : vermelhos(r, k).length ? selo('verm', fem ? 'não assinada' : 'não assinado') : selo('am', 'sem assinatura'));
    const lerPlanilha = (f: File) => void lerBytes(f).then((b) => { avisosPlanilha = null; return kit.carregarPlanilha(b, f.name); });
    const ucChave = k.uc ? k.uc.ponto.join(',') : null;
    // os avisos só valem para os dados, o caso, a UC e a planilha com que ela foi baixada
    const avisosValem = !!avisosPlanilha && avisosPlanilha.dados === k.dados && avisosPlanilha.caso === r.caso && avisosPlanilha.uc === ucChave && avisosPlanilha.planilha === (k.planilha?.nome ?? null);
    const avisosDaPlanilha = avisosValem ? avisosPlanilha!.avisos : [];
    const escolher = avisosDaPlanilha.filter((a) => a.codigo === 'PLANILHA_ESCOLHER').length;
    return [
      vermelhoNoCaso ? h('p', { class: 'erro', role: 'alert' }, `${ERRO_AVISO_VERMELHO} o KML e o SHP. O memorial e a planilha baixam, sem assinatura.`) : null,
      r.appsPendentes > 0 ? h('p', { class: 'amarelo-txt', role: 'status' }, ERRO_APP_PENDENTE) : null,
      r.arvoresSemPonto > 0 ? h('p', { class: 'erro', role: 'alert' }, ERRO_ARVORE_SEM_PONTO) : null,
      avisoAssinatura(r, k),
      erroBaixar ? h('p', { class: 'erro', role: 'alert' }, erroBaixar) : null,
      k.erroPlanilha ? h('p', { class: 'erro', role: 'alert' }, k.erroPlanilha) : null,
      k.planilha
        ? h('div', { class: 'arquivo' },
          h('div', {}, h('div', { class: 'nome' }, k.planilha.nome), h('div', { class: 'det' }, `Planilha Padrão da Enel · ${k.planilha.revisao} · guardada neste computador`)),
          botaoTrocar('.xlsm,.xlsx', lerPlanilha, 'Escolher outra Planilha Padrão da Enel'))
        : zona('Arraste aqui a Planilha Padrão de Entrega da Enel (.xlsm), ou clique para escolher. Só na primeira vez: ela fica guardada aqui.', '.xlsm,.xlsx', lerPlanilha, 'Escolher a Planilha Padrão da Enel'),
      h('div', { class: 'grupo' },
        linhaBaixar('KML e SHP', 'Baixar o KML e o SHP', `kit-${os}-espacial.zip`, 'As camadas da Parte 1, agora com a UC e as árvores.', !pronto || vermelhoNoCaso,
          () => { const p = kit.baixarPacote(); salvar(p.nome, p.bytes, TIPO_ZIP); }, [],
          h('span', { class: 'det' }, h('button', {
            type: 'button', class: 'link', disabled: !pronto || vermelhoNoCaso,
            onclick: () => baixar(() => { const g = base.baixarGoogleEarth(); salvar(g.nome, g.texto, 'application/vnd.google-earth.kml+xml'); }),
          }, 'Abrir no Google Earth'), ' (só o KML, para ver a rede em cima da imagem de satélite)')),
        linhaBaixar('Memorial em Word', 'Baixar o memorial em Word', `${os} MEMORIAL DESCRITIVO.docx`,
          'Ainda sem as imagens: elas entram no passo 6a. A tabela de materiais sai em amarelo, para colar do orçamento do GOM.', !pronto,
          () => { const m = kit.baixarMemorial({ semFiguras: true }); salvar(m.nome, m.bytes, TIPO_DOCX); }, [seloAssinatura(false)]),
        linhaBaixar('Figuras para o Google Earth', 'Baixar as figuras para o Google Earth', `${os} FIGURAS.kmz`,
          'Uma pasta por figura, já enquadrada. No Google Earth Pro: dois cliques na pasta, depois Arquivo, Salvar, Salvar imagem.', !pronto,
          () => { const f = kit.baixarFiguras(); salvar(f.nome, f.bytes, TIPO_KMZ); }),
        linhaBaixar('Planilha Padrão preenchida', 'Baixar a Planilha Padrão preenchida', k.planilha ? nomeDaPlanilha(os, k.planilha.nome) : 'carregue a planilha acima',
          'Só a linha da obra, o assunto e o texto curto. A macro e as listas ficam como estavam.', !pronto || !k.planilha,
          () => { const p = kit.baixarPlanilha(); salvar(p.nome, p.bytes, TIPO_XLSM); avisosPlanilha = { avisos: p.avisos, dados: k.dados, caso: r.caso, uc: ucChave, planilha: k.planilha?.nome ?? null }; },
          [seloAssinatura(true), escolher ? selo('am', plural(escolher, 'célula para escolher', 'células para escolher')) : null])),
      ...avisosDaPlanilha.map((a) => avisoKit(a)),
      // provisório: texto a confirmar com o Italo
      avisosPlanilha && !avisosValem ? h('p', { class: 'amarelo-txt', role: 'status' }, 'Os dados mudaram depois de baixar a planilha: baixe a planilha de novo para ver os avisos dela.') : null,
      h('button', { type: 'button', class: 'botao forte', 'data-foco': 'seguir:6', onclick: () => ctx.seguir() }, 'Seguir para as figuras'),
    ];
  }

  // ---------- 6a figuras ----------

  function passo6a(r: Retrato, k: RetratoKit, ctx: ContextoPasso): Filho[] {
    const os = r.projeto?.os ?? '';
    const pronto = prontoParaBaixar(r);
    // qualquer troca de imagem ou de figura desmarca o "Conferi"
    const chave = JSON.stringify([solturas, k.figuras.map((f) => [f.numero, f.titulo]), k.associacoes.map((a) => [a.figura, a.arquivo, a.erro])]);
    if (chave !== chaveFiguras) { conferi = false; chaveFiguras = chave; }
    const encaixadas = k.associacoes.filter((a) => a.figura > 0 && !a.erro);
    const recusadas = k.associacoes.filter((a) => a.erro);
    const lerImagens = (fs: File[]) => {
      void Promise.all(fs.map(async (f) => ({ nome: f.name, bytes: await lerBytes(f), f }))).then((lidas) => {
        for (const l of lidas) {
          const antes = miniaturas.get(l.nome);
          if (antes) { try { URL.revokeObjectURL(antes); } catch { /* sem miniatura */ } }
          try { miniaturas.set(l.nome, URL.createObjectURL(l.f)); } catch { miniaturas.delete(l.nome); }
        }
        trocadasAMao.clear();
        solturas++; // a mesma imagem salva de novo, com o mesmo nome, também pede o "Conferi" outra vez
        conferi = false;
        kit.soltarImagens(lidas.map(({ nome, bytes }) => ({ nome, bytes })));
      });
    };
    const figuras = k.figuras.map((f) => {
      const a = encaixadas.find((x) => x.figura === f.numero) ?? null;
      const url = a?.arquivo ? miniaturas.get(a.arquivo) : undefined;
      const como = !a?.arquivo ? null
        : trocadasAMao.has(`${f.numero}:${a.arquivo}`) ? h('span', { class: 'como-achou' }, 'escolhida por você')
          : numeroDoNome(a.arquivo) === f.numero ? h('span', { class: 'como-achou' }, 'pelo nome')
            : h('span', { class: 'pilula am' }, 'pela ordem: confira');
      const sel = encaixadas.length
        ? (() => {
          const s = h('select', {
            id: `figura.${f.numero}`, 'data-foco': `figura.${f.numero}`,
            onchange: (e) => {
              const v = (e.target as HTMLSelectElement).value;
              if (!v) return;
              trocadasAMao.add(`${f.numero}:${v}`);
              kit.escolherImagem(f.numero, v);
            },
          }, a ? null : h('option', { value: '' }, 'nenhuma'), ...encaixadas.map((x) => h('option', { value: x.arquivo ?? '' }, x.arquivo ?? '')));
          s.value = a?.arquivo ?? '';
          return [h('label', { for: `figura.${f.numero}` }, 'Trocar'), s];
        })()
        : [];
      return h('div', { class: a ? 'fig' : 'fig falta' },
        url ? h('div', { class: 'foto' }, h('img', { src: url, alt: `Imagem da Figura ${f.numero}` })) : h('div', { class: 'foto vazia', role: 'img', 'aria-label': 'Sem imagem' }),
        h('div', {},
          h('div', { class: 't' }, `Figura ${f.numero}: ${f.titulo}`),
          h('div', { class: 'leg' }, f.legenda),
          h('div', { class: 'par' }, `Figura ${f.numero} ← ${a?.arquivo ?? 'sem imagem'}`),
          a ? h('div', { class: 'de' }, ...sel, como)
            : h('div', { class: 'de' }, ...sel, h('span', { class: 'amarelo-txt' }, TP.figuraSemImagem.replace('{n}', String(f.numero))))));
    });
    const caixa = h('input', { type: 'checkbox', 'data-foco': 'conferi-figuras', onchange: (e) => { conferi = (e.target as HTMLInputElement).checked; redesenhar(); } });
    caixa.checked = conferi;
    return [
      zonaVarios(h('span', {}, 'Jogue aqui as imagens salvas do Google Earth (JPG ou PNG).', h('br'), 'Nome com o número ("Figura 3", "fig3") encaixa sozinho.'),
        '.jpg,.jpeg,.png,image/*', lerImagens, 'Escolher as imagens das figuras'),
      // provisório: texto a confirmar com o Italo
      h('div', { class: 'cabeca-lista' }, h('span', {}, 'Confira cada figura antes de gerar o memorial'), h('span', {}, `${encaixadas.length} de ${k.figuras.length} com imagem`)),
      h('div', { class: 'lista' }, ...figuras),
      recusadas.length
        ? h('div', { class: 'recusada' }, h('strong', {}, 'Não encaixadas'), ...recusadas.map((a) => h('span', {}, h('code', {}, a.arquivo ?? ''), `: ${a.erro}`)))
        : null,
      // provisório: texto a confirmar com o Italo
      h('label', { class: 'confirma-solta' }, caixa, 'Conferi: cada imagem está na figura certa'),
      erroBaixar ? h('p', { class: 'erro', role: 'alert' }, erroBaixar) : null,
      h('button', {
        type: 'button', class: 'botao forte grande', 'data-foco': 'baixar-figuras', disabled: !conferi || !pronto,
        onclick: () => baixar(() => { const m = kit.baixarMemorial(); salvar(m.nome, m.bytes, TIPO_DOCX); }),
      }, 'Baixar o memorial com as figuras'),
      conferi ? null : h('p', { class: 'ajuda' }, TP.travaFiguras),
      h('p', { class: 'ajuda' }, 'Sai o mesmo ', h('code', {}, `${os} MEMORIAL DESCRITIVO.docx`), ', com cada imagem no lugar, na largura da página e com a legenda.'),
      h('button', { type: 'button', class: 'botao forte', 'data-foco': 'seguir:6a', onclick: () => ctx.seguir() }, 'Seguir para montar o kit'),
    ];
  }

  // ---------- 7 montar o kit ----------

  function seletorDePapel(nome: string, papel: Papel | null): HTMLElement[] {
    const e = extensao(nome);
    const doTipo = PAPEIS.filter(([p, , x]) => x === e || p === papel);
    const opcoesPapel = doTipo.length ? doTipo : PAPEIS;
    const chave = `papel:${nome}`;
    const s = h('select', {
      id: chave, 'data-foco': chave,
      onchange: (ev) => {
        const v = (ev.target as HTMLSelectElement).value;
        if (papel === null || escolhidosAgora.has(nome)) escolhidosAgora.add(nome);
        kit.mudarPapel(nome, (v || null) as Papel | null);
      },
    }, h('option', { value: '' }, 'escolha o que é'), ...opcoesPapel.map(([p, t]) => h('option', { value: p }, t)));
    s.value = papel ?? '';
    return [h('label', { for: chave }, 'É'), s];
  }

  function passo7(r: Retrato, k: RetratoKit): Filho[] {
    const os = r.projeto?.os ?? '';
    const pronto = prontoParaBaixar(r);
    if (!k.conferencia) kitMontado = null;
    const lerArquivos = (fs: File[]) => {
      void Promise.all(fs.map(async (f) => ({ nome: f.name, bytes: await lerBytes(f) }))).then((lidos) => {
        escolhidosAgora.clear();
        erroMontar = null;
        kit.soltarArquivos(lidos);
      });
    };
    const noAlto = k.soltos.filter((s) => s.papel === null || escolhidosAgora.has(s.nome));
    const reconhecidos = k.soltos.filter((s) => !noAlto.includes(s));
    const semPapel = k.soltos.filter((s) => s.papel === null);
    const itens = k.conferencia ?? [];
    const v = itens.filter((i) => i.nivel === 'vermelho').length;
    const am = itens.filter((i) => i.nivel === 'amarelo').length;
    const verdes = itens.length - v - am;
    const montar = async () => {
      erroMontar = null;
      kitMontado = await kit.montarKit();
      erroMontar = kitMontado ? null : kit.ler().erro;
      redesenhar();
    };
    const vaiComo = (papel: Papel, nome: string): Filho => {
      const destino = nomeNoKit(papel, os, nome);
      if (papel === 'art' && destino === nome) return h('span', { class: 'vai' }, 'vai como ', h('code', {}, destino), ' (a ART mantém o nome)');
      if (destino === nome) return h('span', { class: 'vai' }, 'vai com o mesmo nome');
      return h('span', { class: 'vai' }, 'vai como ', h('code', {}, destino));
    };
    return [
      zonaVarios(h('span', {}, 'Jogue aqui a ART, a CVT, o CAD (DWG e PDF), a planta (DWG e PDF), o memorial em PDF assinado e a planilha em PDF assinada. E a autorização de poda, se houver.', h('br'), 'Pode ser do jeito que estiverem: o site renomeia.'),
        '', lerArquivos, 'Escolher os arquivos do kit'),
      noAlto.length
        ? h('div', { class: 'cabeca-lista' },
          h('span', {}, semPapel.length ? 'Falta dizer o que é' : 'Todos os arquivos têm papel'),
          h('span', {}, semPapel.length ? plural(semPapel.length, 'arquivo', 'arquivos') : '0 faltando'))
        : null,
      noAlto.length
        ? h('div', { class: 'lista' }, ...noAlto.map((s) => h('div', { class: s.papel === null ? 'solto sem-papel' : 'solto' },
          h('span', { class: 'orig' }, s.nome),
          h('span', { class: 'papel' }, ...seletorDePapel(s.nome, s.papel)),
          s.papel === null ? h('span', { class: 'aviso-papel' }, TP.semPapel) : vaiComo(s.papel, s.nome))))
        : null,
      reconhecidos.length
        ? secao('reconhecidos', plural(reconhecidos.length, 'arquivo reconhecido', 'arquivos reconhecidos'),
          // provisório: texto a confirmar com o Italo
          'o site achou o papel pelo nome; abra para conferir ou trocar', null, false, [
            h('div', { class: 'cabeca-lista' }, h('span', {}, 'O que cada arquivo é'), h('span', {}, plural(reconhecidos.length, 'arquivo', 'arquivos'))),
            h('div', { class: 'lista' }, ...reconhecidos.map((s) => h('div', { class: 'solto' },
              h('span', { class: 'orig' }, s.nome),
              h('span', { class: 'papel' }, ...seletorDePapel(s.nome, s.papel)),
              vaiComo(s.papel!, s.nome)))),
          ])
        : null,
      k.dados.regional
        ? h('p', { class: 'ajuda' }, 'Pasta do kit: ', h('code', {}, pastaDoKit(os, k.dados.regional)), ', com as pastas ', h('code', {}, 'MEMORIAL/'), ', ', h('code', {}, 'KML/'), ' e ', h('code', {}, 'SHAPEFILE/'), ' feitas pelo site.')
        : h('p', { class: 'amarelo-txt' }, 'Escolha a regional no passo 5b: ela vai no nome da pasta do kit.'),
      erroMontar ? h('p', { class: 'erro', role: 'alert' }, erroMontar) : null,
      h('button', {
        type: 'button', class: 'botao forte grande', 'data-foco': 'montar', disabled: semPapel.length > 0 || k.soltos.length === 0 || k.ocupado || !pronto,
        onclick: () => void montar(),
      }, 'Conferir e montar o kit'),
      semPapel.length
        // provisório: texto a confirmar com o Italo
        ? h('p', { class: 'ajuda' }, 'Diga o que é ', ...semPapel.flatMap((s, i) => [i ? ', ' : '', h('code', {}, s.nome)]), ' para montar.')
        : k.soltos.length === 0 ? h('p', { class: 'ajuda' }, 'Solte os arquivos do kit para montar.') : null,
      k.ocupado ? h('p', { class: 'ajuda', role: 'status' }, 'Conferindo o kit...') : null,
      itens.length
        ? h('div', { class: 'resumo-topo' },
          h('span', { class: 'pilula' }, plural(v, 'vermelho', 'vermelhos')),
          h('span', { class: am ? 'pilula am' : 'pilula' }, `${plural(am, 'amarelo', 'amarelos')} para conferir`),
          h('span', { class: 'pilula ok' }, plural(verdes, 'verde', 'verdes')))
        : null,
      ...itens.map(itemConferencia),
      k.conferencia
        ? h('button', {
          type: 'button', class: 'botao forte grande', 'data-foco': 'baixar-kit', disabled: !kitMontado,
          onclick: () => { if (kitMontado) salvar(kitMontado.nome, kitMontado.bytes, TIPO_ZIP); },
        }, 'Baixar o kit')
        : null,
      k.conferencia
        ? kitMontado
          ? h('p', { class: 'ajuda' }, 'Sai ', h('code', {}, kitMontado.nome), '. Amarelo deixa baixar: confira a lista antes de mandar.')
          : h('p', { class: 'ajuda' }, 'Vermelho trava o baixar. Corrija e monte de novo.')
        : null,
    ];
  }

  // ---------- 8 conferir um zip ----------

  async function conferirZip() {
    if (!zip8) return;
    const z = zip8;
    erroConferir = null;
    try {
      conferencia8 = { arquivo: z.nome, itens: await kit.conferirZip(z.bytes, dxf8 ?? undefined) };
    } catch (e) {
      conferencia8 = null;
      erroConferir = mensagem(e);
    }
    redesenhar();
  }

  function passo8(r: Retrato, k: RetratoKit): Filho[] {
    const lerZip = (f: File) => void lerBytes(f).then((bytes) => { zip8 = { bytes, nome: f.name }; return conferirZip(); });
    const lerDxf = (f: File) => void lerBytes(f).then((bytes) => { dxf8 = bytes; return conferirZip(); });
    const itens = conferencia8?.itens ?? [];
    const v = itens.filter((i) => i.nivel === 'vermelho').length;
    const a = itens.filter((i) => i.nivel === 'amarelo').length;
    const docs = itens.filter((i) => i.codigo === 'DOCUMENTOS');
    const semDocumentos = ['Falta: Memorial descritivo', 'Falta: ART', 'Falta: CVT'].every((t) => docs.some((d) => d.titulo === t));
    return [
      erroConferir ? h('p', { class: 'erro', role: 'alert' }, erroConferir) : null,
      conferencia8
        ? h('div', { class: 'arquivo' },
          h('div', {}, h('div', { class: 'nome' }, conferencia8.arquivo),
            h('div', { class: 'det' }, `${plural(v, 'vermelho', 'vermelhos')} · ${plural(a, 'amarelo', 'amarelos')} · ${plural(itens.length - v - a, 'verde', 'verdes')}`)),
          botaoTrocar('.zip', lerZip, 'Escolher outro zip do kit'))
        : zona('Arraste aqui o zip do kit montado. Ele não sai do seu computador.', '.zip', lerZip, 'Escolher o zip do kit'),
      h('div', { class: 'arquivo' },
        h('div', {}, h('div', { class: 'nome' }, 'DXF do projeto (opcional)'),
          // provisório: texto a confirmar com o Italo
          h('div', { class: 'det' }, dxf8 ? 'lido: os metros do zip são conferidos pelo desenho' : 'se tiver, solte também o DXF: os metros são conferidos pelo desenho')),
        botaoTrocar('.dxf', lerDxf, 'Escolher o DXF do projeto')),
      !r.caso ? h('p', { class: 'ajuda' }, h('strong', {}, 'Sem caso aberto'), TP.semCaso8.replace(/^Sem caso aberto/, '')) : null,
      k.ocupado ? h('p', { class: 'ajuda', role: 'status' }, 'Conferindo o zip...') : null,
      semDocumentos ? h('p', { class: 'amarelo-txt', role: 'status' }, 'Este zip só tem a parte espacial (KML e SHP). Junte memorial, ART, CVT, planta e projeto antes de mandar ao órgão.') : null,
      ...itens.map(itemConferencia),
    ];
  }

  // ---------- os passos no painel da Parte 1 ----------

  function legenda(id: string, r: Retrato): string {
    const k = kit.ler();
    if (id === '8') {
      if (!conferencia8) return 'kit feito fora do site, antes de mandar ao órgão';
      const v = conferencia8.itens.filter((i) => i.nivel === 'vermelho').length;
      const a = conferencia8.itens.filter((i) => i.nivel === 'amarelo').length;
      return `${plural(v, 'vermelho', 'vermelhos')} · ${plural(a, 'amarelo', 'amarelos')}`;
    }
    if (!r.caso) return 'depois do caso';
    if (id === '5a') {
      if (k.uc) return `UC em ${coordTexto(k.uc.ponto)}`;
      if (k.escolhendoUc) return 'clique no mapa onde fica a UC';
      return k.candidatosUc.length ? `${plural(k.candidatosUc.length, 'bloco', 'blocos')} de UC no desenho` : 'marque a UC no mapa';
    }
    if (id === '5b') {
      const est = [...estadoDasSecoes(r, k).values()];
      const completas = est.filter((e) => e.pil.classe === 'ok').length;
      const v = k.avisosDados.filter((a) => a.nivel === 'vermelho').length;
      return `${completas} de ${est.length} seções completas${v ? ` · ${plural(v, 'vermelho', 'vermelhos')}` : ''}`;
    }
    if (id === '6') return k.assinar ? '4 arquivos · assinados' : vermelhos(r, k).length ? '4 arquivos · sem assinatura enquanto houver vermelho' : '4 arquivos · sem assinatura guardada';
    if (id === '6a') {
      const n = k.associacoes.filter((a) => a.figura > 0 && !a.erro).length;
      return `${plural(k.figuras.length, 'figura', 'figuras')} · ${plural(n, 'imagem encaixada', 'imagens encaixadas')}`;
    }
    if (id === '7') {
      if (!k.soltos.length) return 'soltar os documentos, conferir e baixar';
      return `${plural(k.soltos.length, 'arquivo solto', 'arquivos soltos')} · ${k.soltos.filter((s) => s.papel === null).length} sem papel`;
    }
    return '';
  }

  function corpo(id: string, r: Retrato, ctx: ContextoPasso): Filho[] {
    const k = kit.ler();
    if (id === '8') return passo8(r, k);
    if (!r.caso) return [];
    if (id === '5a') return passo5a(r, k, ctx);
    if (id === '5b') return passo5b(r, k, ctx);
    if (id === '6') return passo6(r, k, ctx);
    if (id === '6a') return passo6a(r, k, ctx);
    if (id === '7') return passo7(r, k);
    return [];
  }

  const extensaoKit: ExtensaoPainel = {
    passos: PASSOS_KIT,
    seguirDo5: 'Seguir para a UC',
    corpo,
    legenda,
    livre: (id) => id === '8',
    feito: (id) => (id === '8' ? !!conferencia8 : null),
  };

  // ---------- topo: salvar e abrir o caso ----------

  async function salvarCaso() {
    erroTopo = null;
    try {
      const c = await kit.salvarCaso();
      salvar(c.nome, c.texto, 'application/json');
    } catch (e) {
      erroTopo = mensagem(e);
    }
    desenharTopo();
  }
  const abrirCaso = (f: File) => void lerBytes(f).then((b) => {
    erroTopo = null;
    return kit.abrirCaso(new TextDecoder().decode(b));
  });

  function desenharTopo() {
    if (!topo) return;
    const r = base.ler();
    const k = kit.ler();
    const aviso = k.avisosDados.find((a) => a.codigo === 'CASO_OUTRO_PROJETO');
    const erro = erroTopo ?? (k.erro && ERROS_DO_CASO.has(k.erro) ? k.erro : null);
    topo.replaceChildren(...[
      h('div', { class: 'caso-salvo' },
        h('button', { type: 'button', class: 'link', disabled: !r.projeto || !r.rede, onclick: () => void salvarCaso() }, 'Salvar o caso'),
        botaoTrocar('.kitambiental,.json', abrirCaso, 'Abrir um caso salvo (.kitambiental)', 'Abrir caso salvo'),
        h('p', { class: 'ajuda' }, 'Guarda num arquivo ', h('code', {}, '.kitambiental'), ' o que você digitou, a UC, as árvores e as marcas da rede. Nada vai para a internet.')),
      erro ? h('p', { class: 'erro', role: 'alert' }, erro) : null,
      aviso ? avisoKit(aviso, TP.porqueCasoOutroProjeto) : null,
    ].filter((x): x is HTMLElement => x !== null));
  }

  kit.aoMudar(sincronizar); // antes do painel e do topo: eles desenham já com o que sobrou
  sincronizar();
  painel = criarPainel(raiz, base, { salvar, extensao: extensaoKit, ouvir: (f) => { kit.aoMudar(() => { if (!quieto) f(); }); } });
  kit.aoMudar(desenharTopo);
  desenharTopo();
  return { desenhar: () => { redesenhar(); desenharTopo(); } };
}
