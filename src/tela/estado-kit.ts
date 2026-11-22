// Estado da tela dos passos da Parte 2 (5a UC, 5b dados da obra, 6 baixar, 6a figuras, 7 kit completo, 8 conferir).
// Fica em cima do estado da Parte 1: lê o caso dele e refaz o que depende do caso cada vez que ele avisa.
// Não sabe de DOM nem de worker. O armazém guarda só empresa, RT e a planilha; os dados do cliente nunca vão para lá.
import {
  ERRO_APP_PENDENTE, ERRO_ARVORE_SEM_PONTO, ERRO_AVISO_VERMELHO, ERRO_SEM_CASO, type Armazem, type Estado, type Retrato,
} from './estado.ts';
import { confirmarApp } from '../nucleo/app.ts';
import { camadasArvores } from '../nucleo/arvores.ts';
import { assuntoTexto, partesDoAssunto } from '../nucleo/assunto.ts';
import { montarCamadas } from '../nucleo/camadas.ts';
import type { AreaConfirmada } from '../nucleo/caso.ts';
import { gravarCasoSalvo, hashDoProjeto, lerCasoSalvo, type CasoSalvo } from '../nucleo/caso-salvo.ts';
import { conferirZip as conferirZipParte1, type ItemConferencia } from '../nucleo/conferir.ts';
import type { ContextoTexto } from '../nucleo/conferir-texto.ts';
import { gravarDocx, lerImagem } from '../nucleo/docx.ts';
import type { DxfGeo } from '../nucleo/dxf.ts';
import { associarImagens, gravarKmzFiguras, planoDeFiguras, type Associacao, type Figura, type ImagemSolta } from '../nucleo/figuras.ts';
import { conferirKit, montarKit as montarKitNoNucleo, reconhecer, type ArquivoSolto, type Papel } from '../nucleo/kit.ts';
import { montarMemorial } from '../nucleo/memorial.ts';
import { montarPacote } from '../nucleo/pacote.ts';
import { dadosVazios, metrosDaRede, postesNovos, validarDados, type DadosObra, type Empresa, type Imagem, type Responsavel } from '../nucleo/obra.ts';
import type { LerPdf } from '../nucleo/pdf-texto.ts';
import { lerPlanilha, preencherPlanilha, type Planilha } from '../nucleo/planilha.ts';
import type { Aviso, Nivel, Pt, Rede } from '../nucleo/tipos.ts';
import { acharUcs, camadaUc, situarUc, type CandidatoUc, type SituacaoUc } from '../nucleo/uc.ts';
import { abrirZip } from '../nucleo/zip.ts';
import { TEXTOS_CASO_SALVO, TEXTOS_ESTADO_KIT as TK } from '../regras/textos-memorial.ts';

export interface RetratoKit {
  dados: DadosObra; empresa: Empresa | null; rt: Responsavel | null;
  avisosDados: Aviso[]; candidatosUc: CandidatoUc[]; uc: SituacaoUc | null; escolhendoUc: boolean;
  planilha: { nome: string; revisao: string } | null; erroPlanilha: string | null;
  assinar: boolean;                  // rt.assinatura e nenhum vermelho no caso nem em avisosDados (vermelhoQueTrava)
  figuras: Figura[]; associacoes: Associacao[];
  soltos: ArquivoSolto[]; conferencia: ItemConferencia[] | null; ocupado: boolean; erro: string | null;
}

export interface EstadoKit {
  iniciar(): Promise<void>;                      // lê empresa, RT e planilha do armazém
  mudarDados(f: (d: DadosObra) => void): void;
  guardarEmpresa(e: Empresa): Promise<void>; guardarRt(r: Responsavel): Promise<void>; apagarAssinatura(): Promise<void>;
  carregarPlanilha(bytes: Uint8Array, nome: string): Promise<void>;
  escolherUc(i: number): void; marcarUcNoMapa(): void; clicarNoMapa(p: Pt): boolean; // true se usou o clique
  cancelarUc(): void;                            // sai do modo de clique da UC sem mudar a UC
  baixarPacote(): { nome: string; bytes: Uint8Array }; // o KML e SHP da Parte 1 com a camada da UC
  baixarMemorial(o?: { semFiguras?: boolean }): { nome: string; bytes: Uint8Array };   // `${os} MEMORIAL DESCRITIVO.docx`; semFiguras: o do passo 6, antes do "Conferi" do 6a
  baixarFiguras(): { nome: string; bytes: Uint8Array };
  baixarPlanilha(): { nome: string; bytes: Uint8Array; avisos: Aviso[] };
  soltarImagens(fs: ImagemSolta[]): void;
  escolherImagem(figura: number, arquivo: string): void; // a imagem vai para a figura; a que estava lá troca de lugar com ela
  soltarArquivos(fs: { nome: string; bytes: Uint8Array }[]): void; mudarPapel(nome: string, papel: Papel | null): void;
  montarKit(): Promise<{ nome: string; bytes: Uint8Array } | null>; // null quando a conferência tem vermelho
  conferirZip(bytes: Uint8Array, dxf?: Uint8Array): Promise<ItemConferencia[]>; // passo 8
  salvarCaso(): Promise<{ nome: string; texto: string }>; abrirCaso(texto: string): Promise<void>;
  ler(): RetratoKit; aoMudar(f: () => void): () => void;
}

const CHAVE_EMPRESA = 'empresa';
const CHAVE_RT = 'rt';
const CHAVE_PLANILHA = 'planilha';

const EMPRESA_VAZIA: Empresa = { nome: '', cnpj: '', endereco: '', municipio: '', telefone: '', email: '', logo: null };
const RT_VAZIO: Responsavel = { nome: '', registro: '', rnp: '', email: '', assinatura: null };

const mensagem = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const troca = (modelo: string, v: Record<string, string>): string => modelo.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);
const vermelho = (titulo: string, porque: string, comoCorrigir: string, arquivos: string[] = []): ItemConferencia =>
  ({ nivel: 'vermelho', codigo: 'KIT', titulo, porque, comoCorrigir, arquivos });
const temVermelho = (xs: { nivel: Nivel }[]): boolean => xs.some((x) => x.nivel === 'vermelho');

// ---------- o que vem do armazém e do arquivo do caso: confere a forma antes de usar ----------

const ehObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const ehTexto = (x: unknown): x is string => typeof x === 'string';
const ehNumero = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const ehPt = (x: unknown): x is Pt => Array.isArray(x) && x.length === 2 && ehNumero(x[0]) && ehNumero(x[1]);
const ehImagem = (x: unknown): x is Imagem => ehObjeto(x) && x.bytes instanceof Uint8Array && (x.tipo === 'png' || x.tipo === 'jpeg') && ehNumero(x.largura) && ehNumero(x.altura);
const TIPOS_REDE = ['MT', 'BT', 'CONJ'];
const SITUACOES = ['novo', 'existente', 'realocado', 'retirado'];

function empresaGuardada(x: unknown): Empresa | null {
  if (!ehObjeto(x)) return null;
  const ok = ['nome', 'cnpj', 'endereco', 'municipio', 'telefone', 'email'].every((k) => ehTexto(x[k])) && (x.logo === null || ehImagem(x.logo));
  return ok ? (x as unknown as Empresa) : null;
}
function rtGuardado(x: unknown): Responsavel | null {
  if (!ehObjeto(x)) return null;
  const ok = ['nome', 'registro', 'rnp', 'email'].every((k) => ehTexto(x[k])) && (x.assinatura === null || ehImagem(x.assinatura));
  return ok ? (x as unknown as Responsavel) : null;
}

/** O lerCasoSalvo confere só o nível de cima; aqui o de dentro, para nada estourar na tela depois. */
// cada campo de uma seção dos dados com o mesmo tipo do campo de dadosVazios() (null aceita null ou texto)
function secaoCoerente(modelo: Record<string, unknown>, x: unknown): boolean {
  if (x === undefined) return true;
  if (!ehObjeto(x)) return false;
  return Object.entries(modelo).every(([k, m]) => {
    const v = x[k];
    if (v === undefined) return true;
    if (m === null) return v === null || ehTexto(v);
    if (Array.isArray(m)) return Array.isArray(v); // postes: conferidos um por um abaixo
    if (ehObjeto(m)) return ehObjeto(v) && Object.values(v).every(ehNumero); // retirada.metros
    if (typeof m === 'number') return ehNumero(v);
    return typeof v === typeof m;
  });
}

function casoCoerente(c: CasoSalvo): boolean {
  const d = c.dados as unknown as Record<string, unknown>;
  const v = dadosVazios() as unknown as Record<string, Record<string, unknown>>;
  const secoes = ['interessado', 'obra', 'finalidade', 'rede', 'retirada', 'planilha'];
  if (!secoes.every((s) => secaoCoerente(v[s], d[s]))) return false;
  if (!(d.regional === undefined || d.regional === null || ehTexto(d.regional))) return false;
  if (!(d.predominancia === undefined || d.predominancia === null || ehTexto(d.predominancia))) return false;
  if (!(d.tipoAgua === undefined || (ehObjeto(d.tipoAgua) && Object.values(d.tipoAgua).every(ehTexto)))) return false;
  const rede = d.rede as Record<string, unknown> | undefined;
  if (rede?.postes !== undefined && !(Array.isArray(rede.postes) && rede.postes.every((p) => ehObjeto(p) && ehNumero(p.altura) && ehNumero(p.daN) && ehNumero(p.quantidade)))) return false;
  if (!(c.uc === null || ehPt(c.uc))) return false;
  if (!Object.values(c.marcas).every((m) => ehObjeto(m) && (m.tipo === null || TIPOS_REDE.includes(m.tipo as string)) && SITUACOES.includes(m.situacao as string))) return false;
  if (!c.camadasIncluidas.every((x) => ehObjeto(x) && ehTexto(x.camada) && TIPOS_REDE.includes(x.tipo as string))) return false;
  if (!c.apps.every((a) => ehObjeto(a) && ehNumero(a.aguaId) && (a.resposta === 'confirmada' || a.resposta === 'recusada') && ehNumero(a.largura) && a.largura > 0)) return false;
  if (!Object.values(c.m2Postes).every((m) => ehNumero(m) && m >= 0)) return false;
  if (!c.arvores.every((a) => ehObjeto(a) && ehTexto(a.id) && ehTexto(a.foto) && ehTexto(a.especie)
    && (a.intervencao === 'poda' || a.intervencao === 'supressao') && (a.ponto === null || ehPt(a.ponto)))) return false;
  return c.limpeza.every((l) => Array.isArray(l) && l.every(ehPt));
}

// cada seção do formulário vem do arquivo por cima da vazia: campo que faltar fica vazio, nunca undefined
function dadosDoCaso(x: DadosObra): DadosObra {
  const v = dadosVazios();
  return {
    ...v,
    interessado: { ...v.interessado, ...x.interessado },
    obra: { ...v.obra, ...x.obra },
    finalidade: { ...v.finalidade, ...x.finalidade },
    rede: { ...v.rede, ...x.rede },
    retirada: { ...v.retirada, ...x.retirada, metros: { ...(x.retirada?.metros ?? {}) } },
    planilha: { ...v.planilha, ...x.planilha },
    regional: x.regional ?? null,
    predominancia: x.predominancia ?? null,
    tipoAgua: { ...(x.tipoAgua ?? {}) },
  };
}

// a OS no nome da pasta do zip (`<OS>_PROCESSO DOCUMENTAL_...`), para o passo 8 sem projeto aberto.
// Só vale esse padrão: outros 10 dígitos no caminho podem ser de outra coisa. Sem ele, '' (a conferência não confere a OS).
function osDoZip(bytes: Uint8Array): string {
  try {
    for (const a of abrirZip(bytes)) {
      const m = /(?:^|\/)(\d{10})_PROCESSO\b/i.exec(a.caminho);
      if (m) return m[1];
    }
  } catch {
    // não é zip: a conferência da Parte 1 diz
  }
  return '';
}

const ORDEM: Record<Nivel, number> = { vermelho: 0, amarelo: 1, verde: 2 };
const ordenar = (itens: ItemConferencia[]): ItemConferencia[] =>
  itens.map((x, i) => ({ x, i })).sort((a, b) => ORDEM[a.x.nivel] - ORDEM[b.x.nivel] || a.i - b.i).map((e) => e.x);

export function criarEstadoKit(base: Estado, deps: { armazem?: Armazem; lerPdf: LerPdf }): EstadoKit {
  const armazem = deps.armazem;
  const ouvintes = new Set<() => void>();

  let dados: DadosObra = dadosVazios();
  let empresa: Empresa | null = null;
  let rt: Responsavel | null = null;
  let planilha: { bytes: Uint8Array; nome: string; lida: Planilha } | null = null;
  let erroPlanilha: string | null = null;
  let ucPonto: Pt | null = null;
  let escolhendoUc = false;
  let imagens: ImagemSolta[] = [];
  let escolhas: [number, string][] = []; // trocas de imagem feitas à mão no 6a, na ordem; soltar imagens zera
  let soltos: ArquivoSolto[] = [];
  let conferencia: ItemConferencia[] | null = null;
  let ocupado = false;
  let erro: string | null = null;
  let avisoCaso: Aviso | null = null; // o amarelo do caso salvo com outro projeto
  let projetoVisto = base.ler().projeto;
  let restaurando = false;

  // a UC proposta só muda quando muda a rede ou o DXF
  let memoUcs: { rede: Rede | null; dxf: DxfGeo | null; ucs: CandidatoUc[] } | null = null;
  const candidatos = (r: Retrato): CandidatoUc[] => {
    const dxf = base.projetoAberto()?.dxf ?? null;
    if (!r.rede || !dxf) return [];
    if (!memoUcs || memoUcs.rede !== r.rede || memoUcs.dxf !== dxf) memoUcs = { rede: r.rede, dxf, ucs: acharUcs(dxf, r.rede) };
    return memoUcs.ucs;
  };
  const confirmadas = (r: Retrato): AreaConfirmada[] => r.apps.filter((a) => a.resposta === 'confirmada').flatMap((a) => {
    try { return [confirmarApp(a.proposta)]; } catch { return []; }
  });
  const situacao = (r: Retrato): SituacaoUc | null => {
    if (!ucPonto || !r.base) return null;
    try { return situarUc(ucPonto, r.base, confirmadas(r)); } catch { return null; }
  };
  // a associação automática (nome, depois ordem) com as trocas feitas à mão por cima: só entre imagens já encaixadas
  const comEscolhas = (auto: Associacao[], figuras: Figura[]): Associacao[] => {
    const r = auto.map((a) => ({ ...a }));
    for (const [fig, arq] of escolhas) {
      if (!figuras.some((f) => f.numero === fig)) continue;
      const x = r.find((a) => a.arquivo === arq && a.figura > 0 && !a.erro);
      if (!x) continue;
      const y = r.find((a) => a.figura === fig && !a.erro);
      const de = x.figura;
      x.figura = fig;
      if (y && y !== x) y.figura = de;
    }
    return r;
  };
  // o que é vermelho no caso: os avisos dele e os do passo 5 (árvores, área protegida e faixa de domínio)
  const vermelhosDoCaso = (r: Retrato): boolean =>
    !r.caso || temVermelho(r.caso.avisos) || temVermelho(r.avisosArvores) || temVermelho(r.avisosEmArea) || temVermelho(r.avisosFaixa);
  // a mesma regra tira a assinatura do memorial e da planilha e trava o "Conferir e montar o kit": as duas não divergem
  const vermelhoQueTrava = (r: Retrato, avisosDados: Aviso[]): boolean => vermelhosDoCaso(r) || temVermelho(avisosDados);

  const montar = (): RetratoKit => {
    const r = base.ler();
    const uc = situacao(r);
    const avisosDados = [
      ...validarDados(dados, { postesNovos: r.rede ? postesNovos(r.rede) : 0, municipioKmz: r.caso?.municipio ?? null }),
      ...(avisoCaso ? [avisoCaso] : []),
    ];
    let figuras: Figura[] = [];
    if (r.caso && r.rede) figuras = planoDeFiguras({ caso: r.caso, rede: r.rede, uc, arvores: r.arvores, limpeza: r.limpeza });
    return {
      dados, empresa, rt, avisosDados, candidatosUc: candidatos(r), uc, escolhendoUc,
      planilha: planilha ? { nome: planilha.nome, revisao: planilha.lida.revisao } : null, erroPlanilha,
      assinar: !!rt?.assinatura && !vermelhoQueTrava(r, avisosDados),
      figuras, associacoes: comEscolhas(associarImagens(imagens, figuras), figuras),
      soltos, conferencia, ocupado, erro,
    };
  };
  let atual = montar();
  const avisar = () => {
    atual = montar();
    for (const f of [...ouvintes]) f();
  };

  base.aoMudar(() => {
    // outro projeto aberto: a UC, as imagens e o aviso do caso salvo eram da obra de antes
    const p = base.ler().projeto;
    if (p !== projetoVisto) {
      projetoVisto = p;
      ucPonto = null; escolhendoUc = false; imagens = []; escolhas = []; avisoCaso = null; conferencia = null;
    }
    if (!restaurando) avisar();
  });

  function pronto() {
    const r = base.ler();
    if (!r.rede || !r.base || !r.caso || !r.projeto) throw new Error(ERRO_SEM_CASO);
    if (r.apps.some((a) => a.resposta === 'pendente')) throw new Error(ERRO_APP_PENDENTE);
    if (r.arvores.some((a) => a.ponto === null)) throw new Error(ERRO_ARVORE_SEM_PONTO);
    return { r, os: r.projeto.os, caso: r.caso, rede: r.rede, areas: r.base };
  }

  const assinatura = (): Imagem | null => (atual.assinar ? rt?.assinatura ?? null : null);

  function contexto(os: string, comCaso: boolean): ContextoTexto & { lerPdf: LerPdf; temPoda: boolean; ucEmArea: boolean; assunto: string | null } {
    const r = base.ler();
    const caso = comCaso ? r.caso : null;
    // UC não marcada no 5a: undefined ("o site não sabe onde está"); null quer dizer "sem UC" no ContextoTexto
    const uc = caso && ucPonto ? atual.uc ?? undefined : undefined;
    const arvores = caso ? r.arvores : [];
    return {
      // metrosZip null: a conferência da Parte 1 soma os metros do KML do zip, mas não por tipo; sem caso sai o amarelo
      os, caso, rede: caso ? r.rede : null, nomesDaBase: r.base?.areas.map((a) => a.nome) ?? [],
      arvores, limpeza: caso ? r.limpeza : [], municipioKmz: caso?.municipio ?? null, rt, metrosZip: null,
      // sem caso o site não sabe dos dados digitados deste zip
      ...(caso ? { cepVazio: dados.interessado.cep.trim() === '' } : {}),
      uc,
      lerPdf: deps.lerPdf,
      temPoda: arvores.some((a) => a.intervencao === 'poda'),
      ucEmArea: (uc?.dentro.length ?? 0) > 0,
      // o conferirKit não usa o assunto (vem da A1 do kit); vai só porque a assinatura pede
      assunto: caso && r.rede ? assuntoTexto(os, partesDoAssunto(caso, uc ?? null, metrosDaRede(r.rede))) : null,
    };
  }

  // o caso salvo a partir do que está aberto agora (null sem projeto)
  function casoDoEstado(hash: string): CasoSalvo | null {
    const r = base.ler();
    const aberto = base.projetoAberto();
    if (!r.rede || !r.projeto || !aberto) return null;
    return {
      versao: 1, os: r.projeto.os, projetoNome: r.projeto.nome, projetoHash: hash,
      dados, uc: ucPonto,
      marcas: Object.fromEntries(r.rede.vaos.map((v) => [v.id, { tipo: v.tipo, situacao: v.situacao }])),
      camadasIncluidas: aberto.camadasIncluidas,
      apps: r.apps.flatMap((a) => (a.resposta === 'pendente' ? [] : [{ aguaId: a.proposta.agua.id, resposta: a.resposta, largura: a.proposta.largura }])),
      m2Postes: r.m2Postes, arvores: r.arvores, limpeza: r.limpeza, liberado: r.liberado,
    };
  }

  async function guardar(chave: string, valor: unknown) {
    if (!armazem) return;
    try { await armazem.guardar(chave, valor); } catch { /* segue sem guardar */ }
  }

  return {
    async iniciar() {
      if (!armazem) return;
      try { empresa = empresaGuardada(await armazem.ler(CHAVE_EMPRESA)) ?? empresa; } catch { /* sem armazém */ }
      try { rt = rtGuardado(await armazem.ler(CHAVE_RT)) ?? rt; } catch { /* sem armazém */ }
      try {
        const g = await armazem.ler(CHAVE_PLANILHA);
        if (ehObjeto(g) && ehTexto(g.nome) && g.bytes instanceof Uint8Array) {
          try {
            planilha = { bytes: g.bytes, nome: g.nome, lida: lerPlanilha(g.bytes, g.nome) };
            erroPlanilha = null;
          } catch (e) {
            erroPlanilha = mensagem(e);
          }
        }
      } catch { /* sem armazém: a planilha é pedida de novo */ }
      avisar();
    },

    mudarDados(f) {
      const d = structuredClone(dados);
      f(d);
      dados = d;
      avisar();
    },

    async guardarEmpresa(e) {
      empresa = e;
      avisar();
      await guardar(CHAVE_EMPRESA, e);
    },

    async guardarRt(r) {
      rt = r;
      avisar();
      await guardar(CHAVE_RT, r);
    },

    async apagarAssinatura() {
      if (!rt) return;
      rt = { ...rt, assinatura: null };
      avisar();
      await guardar(CHAVE_RT, rt);
    },

    async carregarPlanilha(bytes, nome) {
      ocupado = true;
      avisar();
      try {
        planilha = { bytes, nome, lida: lerPlanilha(bytes, nome) };
        erroPlanilha = null;
        await guardar(CHAVE_PLANILHA, { nome, bytes });
      } catch (e) {
        erroPlanilha = mensagem(e); // a planilha guardada antes continua valendo
      } finally {
        ocupado = false;
        avisar();
      }
    },

    escolherUc(i) {
      const c = atual.candidatosUc[i];
      if (!c) return;
      ucPonto = c.ponto;
      escolhendoUc = false;
      avisar();
    },

    marcarUcNoMapa() {
      escolhendoUc = true;
      avisar();
    },

    clicarNoMapa(p) {
      if (!escolhendoUc) return false;
      ucPonto = [p[0], p[1]];
      escolhendoUc = false;
      avisar();
      return true;
    },

    cancelarUc() {
      if (!escolhendoUc) return;
      escolhendoUc = false;
      avisar();
    },

    baixarPacote() {
      const { r, os, caso, rede, areas } = pronto();
      // como o da Parte 1: vermelho no caso não deixa baixar o espacial
      if (temVermelho(caso.avisos)) throw new Error(ERRO_AVISO_VERMELHO);
      const uc = atual.uc;
      const extras = [...camadasArvores(os, r.arvores, r.limpeza), ...(uc ? [camadaUc(os, uc.ponto)] : [])];
      return { nome: `kit-${os}-espacial.zip`, bytes: montarPacote(os, montarCamadas(os, caso, rede, extras, areas)) };
    },

    baixarMemorial(o) {
      const { r, os, caso, rede } = pronto();
      const figuras: Record<number, Imagem> = {};
      // sem as figuras, cada uma sai com a marca amarela para soltar a imagem no site
      for (const a of o?.semFiguras ? [] : atual.associacoes) {
        if (a.figura <= 0 || a.erro) continue;
        const im = imagens.find((s) => s.nome === a.arquivo);
        const lida = im ? lerImagem(im.bytes) : null;
        if (lida) figuras[a.figura] = lida;
      }
      // assinar = sem vermelho: com vermelho a nota pede para corrigir; sem vermelho e sem a imagem guardada, a marca
      // [PREENCHER] pede a assinatura (a nota nunca fala de vermelho que não existe)
      const doc = montarMemorial({
        os, caso, rede, dados, empresa: empresa ?? EMPRESA_VAZIA, rt: rt ?? RT_VAZIO, uc: atual.uc,
        arvores: r.arvores, limpeza: r.limpeza, data: new Date(), assinar: !vermelhoQueTrava(r, atual.avisosDados), imagens: figuras,
      });
      return { nome: `${os} MEMORIAL DESCRITIVO.docx`, bytes: gravarDocx(doc) };
    },

    baixarFiguras() {
      const { r, os, caso, rede } = pronto();
      return gravarKmzFiguras(os, atual.figuras, { caso, rede, uc: atual.uc, arvores: r.arvores, limpeza: r.limpeza });
    },

    baixarPlanilha() {
      const { r, os, caso, rede, areas } = pronto();
      if (!planilha) throw new Error(TK.semPlanilha);
      return preencherPlanilha(planilha.lida, {
        os, caso, rede, dados, empresa: empresa ?? EMPRESA_VAZIA, uc: atual.uc,
        arvores: r.arvores, limpeza: r.limpeza, assinatura: assinatura(), base: areas,
      });
    },

    soltarImagens(fs) {
      const nomes = new Set(fs.map((f) => f.nome));
      imagens = [...imagens.filter((s) => !nomes.has(s.nome)), ...fs];
      escolhas = []; // imagem nova refaz a associação: as trocas à mão eram da lista de antes
      avisar();
    },

    escolherImagem(figura, arquivo) {
      escolhas = [...escolhas, [figura, arquivo]];
      avisar();
    },

    soltarArquivos(fs) {
      const nomes = new Set(fs.map((f) => f.nome));
      soltos = [...soltos.filter((s) => !nomes.has(s.nome)), ...fs.map((f) => ({ nome: f.nome, bytes: f.bytes, papel: reconhecer(f.nome) }))];
      conferencia = null;
      avisar();
    },

    mudarPapel(nome, papel) {
      soltos = soltos.map((s) => (s.nome === nome ? { ...s, papel } : s));
      conferencia = null;
      avisar();
    },

    async montarKit() {
      erro = null;
      conferencia = null;
      let p: ReturnType<typeof pronto>;
      try {
        p = pronto();
        if (temVermelho(p.caso.avisos)) throw new Error(ERRO_AVISO_VERMELHO);
        // o vermelho dos dados da obra (postes que não batem) e o do passo 5 também travam, como travam a assinatura
        if (vermelhoQueTrava(p.r, atual.avisosDados)) throw new Error(TK.vermelhoAntesDoKit);
      } catch (e) {
        erro = mensagem(e);
        avisar();
        return null;
      }
      // §6.8: o que o site não reconheceu, o projetista diz o que é antes (nada de chute)
      const semPapel = soltos.filter((s) => s.papel === null).map((s) => s.nome);
      const regional = dados.regional;
      if (semPapel.length || regional === null) {
        conferencia = [
          ...(semPapel.length ? [vermelho(TK.papelFaltando, troca(TK.porquePapelFaltando, { lista: semPapel.join(', ') }), TK.comoPapelFaltando, semPapel)] : []),
          ...(regional === null ? [vermelho(TK.semRegional, TK.porqueSemRegional, TK.comoSemRegional)] : []),
        ];
        avisar();
        return null;
      }
      ocupado = true;
      avisar();
      try {
        const { r, os, caso, rede, areas } = p;
        const uc = atual.uc;
        const extras = [...camadasArvores(os, r.arvores, r.limpeza), ...(uc ? [camadaUc(os, uc.ponto)] : [])];
        const camadas = montarCamadas(os, caso, rede, extras, areas);
        const zip = montarKitNoNucleo({ os, regional, soltos, camadas });
        conferencia = await conferirKit(zip.bytes, contexto(os, true));
        return temVermelho(conferencia) ? null : zip;
      } catch (e) {
        conferencia = [vermelho(TK.naoMontou, mensagem(e), TK.comoNaoMontou)];
        return null;
      } finally {
        ocupado = false;
        avisar();
      }
    },

    async conferirZip(bytes, dxf) {
      ocupado = true;
      erro = null;
      avisar();
      try {
        const r = base.ler();
        const os = r.projeto?.os ?? osDoZip(bytes);
        let itens = await conferirKit(bytes, contexto(os, !!r.projeto));
        // o conferirKit não recebe o DXF: os metros do DXF vêm da conferência da Parte 1, no lugar dos dela
        if (dxf) {
          const doDxf = conferirZipParte1(bytes, dxf).filter((i) => i.codigo === 'COMPRIMENTO' || i.codigo === 'DXF');
          itens = ordenar([...itens.filter((i) => i.codigo !== 'COMPRIMENTO' && i.codigo !== 'DXF'), ...doDxf]);
        }
        return itens;
      } catch {
        // a conta parou no meio: nada de exceção crua na tela
        erro = TK.conferenciaFalhou;
        return [vermelho(TK.conferenciaFalhou, TK.porqueConferenciaFalhou, TK.comoConferenciaFalhou)];
      } finally {
        ocupado = false;
        avisar();
      }
    },

    async salvarCaso() {
      const r = base.ler();
      const aberto = base.projetoAberto();
      if (!r.rede || !r.projeto || !aberto) throw new Error(ERRO_SEM_CASO);
      const c = casoDoEstado(await hashDoProjeto(aberto.bytes))!;
      return { nome: `${r.projeto.os}.kitambiental`, texto: gravarCasoSalvo(c) };
    },

    async abrirCaso(texto) {
      erro = null;
      const aberto = base.projetoAberto();
      const r = base.ler();
      if (!aberto || !r.rede || !r.base) { erro = TEXTOS_CASO_SALVO.semProjeto; avisar(); return; }
      let c: CasoSalvo;
      try {
        c = lerCasoSalvo(texto);
        if (!casoCoerente(c)) throw new Error(TEXTOS_CASO_SALVO.naoEhCaso);
      } catch (e) {
        // só as mensagens do caso salvo vão para a tela; qualquer outra (em inglês) vira "não é um caso salvo"
        const m = e instanceof Error ? e.message : '';
        erro = m === TEXTOS_CASO_SALVO.versaoNova ? m : TEXTOS_CASO_SALVO.naoEhCaso;
        avisar();
        return;
      }
      // camada que o desenho aberto não tem: o caso é de outro projeto
      const doDesenho = new Set(aberto.dxf?.linhas.map((l) => l.camada) ?? []);
      if (c.camadasIncluidas.some((x) => !doDesenho.has(x.camada))) { erro = TEXTOS_CASO_SALVO.naoBate; avisar(); return; }
      let hash = '';
      try { hash = await hashDoProjeto(aberto.bytes); } catch { /* sem hash: sai o amarelo */ }
      // o que havia antes, para voltar se algo falhar no meio
      const antes = { caso: casoDoEstado(hash), dados, ucPonto, escolhendoUc, avisoCaso };
      const voltar = () => {
        dados = antes.dados; ucPonto = antes.ucPonto; escolhendoUc = antes.escolhendoUc; avisoCaso = antes.avisoCaso;
        try { if (antes.caso) base.restaurar(antes.caso); } catch { /* a Parte 1 fica como o restaurar deixou */ }
      };
      restaurando = true;
      try {
        // a liberação da etiqueta longe só vale para o arquivo em que foi dada: com outro, a pergunta volta
        base.restaurar({ ...c, liberado: c.liberado && hash !== '' && hash === c.projetoHash });
      } catch {
        erro = TEXTOS_CASO_SALVO.naoBate;
      }
      if (erro === null) {
        try {
          dados = dadosDoCaso(c.dados);
          ucPonto = c.uc ? [c.uc[0], c.uc[1]] : null;
          escolhendoUc = false;
          avisoCaso = hash === c.projetoHash ? null
            : { nivel: 'amarelo', codigo: 'CASO_OUTRO_PROJETO', texto: TEXTOS_CASO_SALVO.outroProjeto, comoCorrigir: TEXTOS_CASO_SALVO.outroProjetoComo };
          atual = montar(); // se o retrato não fecha com o caso novo, volta tudo
        } catch {
          erro = TEXTOS_CASO_SALVO.naoEhCaso;
          voltar();
        }
      } else voltar();
      restaurando = false;
      avisar();
    },

    ler: () => atual,
    aoMudar(f) {
      ouvintes.add(f);
      return () => { ouvintes.delete(f); };
    },
  };
}
