// Estado da tela: liga o núcleo aos passos 1 a 3 (KMZ, projeto e confirmação da rede).
// Não sabe de DOM nem de worker: quem monta a tela passa o leitor do KMZ e o armazém.
import { lerAreasProtegidas, type BaseAreas } from '../nucleo/areas.ts';
import { proporApps, refazerApp as refazerAppNoNucleo, confirmarApp as confirmarAppNoNucleo, type AppProposta } from '../nucleo/app.ts';
import { avisosArvores, avisosEmArea, camadasArvores, posicaoDaFoto, type Arvore, type IntervencaoArvore } from '../nucleo/arvores.ts';
import { montarCamadas, unificar } from '../nucleo/camadas.ts';
import { calcularCaso, type AreaConfirmada, type Caso } from '../nucleo/caso.ts';
import { conferirZip, type ItemConferencia } from '../nucleo/conferir.ts';
import { avisosFaixa, lerMalha, type Malha, type TipoMalha } from '../nucleo/faixa.ts';
import { gravarKml } from '../nucleo/kml-saida.ts';
import { montarPacote } from '../nucleo/pacote.ts';
import { lerDxfGeometria, type DxfGeo } from '../nucleo/dxf.ts';
import { lerKml } from '../nucleo/kml.ts';
import { conferirEtiquetas, conferirLocal } from '../nucleo/local.ts';
import { incluirCamada as incluirCamadaNoNucleo, camadasCandidatas, marcarVao as marcarVaoNoNucleo, proporRedeDxf, proporRedeKml } from '../nucleo/rede.ts';
import type { Aviso, Pt, Rede, Situacao, TipoRede, Vao } from '../nucleo/tipos.ts';

export interface Projeto { nome: string; os: string; detalhe: string }

export type RespostaApp = 'pendente' | 'confirmada' | 'recusada';
/** Uma APP proposta em volta de uma água, com a resposta do projetista. */
export interface AppDoCaso { proposta: AppProposta; resposta: RespostaApp; erro: string | null }

/** O que o clique no mapa faz agora: pôr uma árvore sem GPS, ou acrescentar um vértice da limpeza de faixa. */
export type ModoMapa = { t: 'arvore'; id: string } | { t: 'limpeza'; pts: Pt[] } | null;
/** De onde veio o ponto da árvore e o que o site avisou sobre a foto. */
export interface InfoFoto { aviso: string | null; origem: 'gps' | 'mapa' | null }

export interface Retrato {
  base: BaseAreas | null;
  rede: Rede | null;
  bloqueio: Aviso | null; // aviso vermelho que impede o passo 5; null quando pode seguir
  caso: Caso | null; // só existe sem bloqueio
  ocupado: boolean;
  erro: string | null;
  erroPasso: 1 | 2 | null; // em que passo o erro aparece
  trabalho: string | null; // o que está sendo lido agora (barra de status)
  kmzNome: string | null;
  projeto: Projeto | null;
  liberado: boolean; // a caixa "o desenho está no lugar certo" (só ETIQUETA_LONGE)
  camadas: string[]; // camadas do DXF com linhas que não são de rede
  apps: AppDoCaso[]; // uma por água a até 100 m da rede nova
  appsPendentes: number; // quantas ainda não foram confirmadas nem recusadas
  m2Postes: Record<string, number>; // m² editados por poste novo sem rede nova na área
  arvores: Arvore[];
  infoFotos: Record<string, InfoFoto>; // por id da árvore
  limpeza: Pt[][]; // áreas de limpeza de faixa já fechadas
  modoMapa: ModoMapa;
  avisosArvores: Aviso[];
  avisosEmArea: Aviso[]; // árvore ou limpeza dentro de área protegida ou APP confirmada (passo 5)
  arvoresSemPonto: number;
  erroArvores: string | null;
  malhas: Malha[]; // malhas de faixa de domínio carregadas (DNIT, SOP, ferrovia)
  avisosFaixa: Aviso[]; // faixa de domínio e malhas que faltam (passo 5); vazio sem caso
  erroMalha: string | null;
}

export interface Armazem {
  guardar(chave: string, valor: unknown): Promise<void>;
  ler(chave: string): Promise<unknown>;
}

export interface Dependencias {
  lerAreas?: (bytes: Uint8Array, nome: string) => Promise<BaseAreas>;
  lerMalha?: (bytes: Uint8Array, nome: string, tipo: TipoMalha) => Promise<Malha>;
  armazem?: Armazem;
}

export interface Estado {
  iniciar(): Promise<void>;
  carregarKmz(bytes: Uint8Array, nome: string): Promise<void>;
  carregarProjeto(bytes: Uint8Array, nome: string, os: string): Promise<void>;
  /** Malha de rodovia ou ferrovia (passo 1). Guardada no navegador, só com as linhas em UTM. */
  carregarMalha(bytes: Uint8Array, nome: string, tipo: TipoMalha): Promise<void>;
  /** Sem `mudanca`, passa para a próxima marca do ciclo (MT novo, BT novo, conjugada nova, fora). */
  marcarVao(id: string, mudanca?: { tipo?: TipoRede | null; situacao?: Situacao }): void;
  incluirCamada(camada: string, tipo: TipoRede): void;
  /** Aceita a APP `i` com essa largura (em metros). Se a APP ficar vazia, a resposta fica pendente e `erro` diz por quê. */
  confirmarApp(i: number, largura: number): void;
  recusarApp(i: number): void;
  /** Desfaz a resposta e volta a APP para pendente. */
  reabrirApp(i: number): void;
  /** Só redesenha a APP `i` com outra largura, sem responder (para ver no mapa). */
  refazerApp(i: number, largura: number): void;
  mudarM2Poste(id: string, m2: number): void;
  /** Lê o GPS de cada foto e cria uma árvore por foto (poda, sem espécie). Devolve os ids na ordem das fotos. */
  adicionarFotos(fotos: { nome: string; bytes: Uint8Array }[]): string[];
  mudarArvore(id: string, mudanca: { especie?: string; intervencao?: IntervencaoArvore }): void;
  removerArvore(id: string): void;
  /** A próxima vez que a pessoa clicar no mapa, a árvore `id` vai para lá. De novo com a mesma árvore cancela. */
  colocarArvore(id: string): void;
  comecarLimpeza(): void;
  /** Fecha o polígono da limpeza de faixa (duplo clique no mapa). Com menos de 3 vértices, descarta e avisa. */
  fecharLimpeza(): void;
  removerLimpeza(i: number): void;
  cancelarModo(): void;
  /** Clique no mapa, em UTM: vale só quando há um modo ativo. */
  clicarNoMapa(p: Pt): void;
  baixarPacote(): { nome: string; bytes: Uint8Array };
  /** O KML unificado, para abrir no Google Earth. */
  baixarGoogleEarth(): { nome: string; texto: string };
  conferir(bytes: Uint8Array, dxf?: Uint8Array): ItemConferencia[];
  liberarEtiqueta(sim: boolean): void;
  ler(): Retrato;
  aoMudar(f: () => void): () => void;
}

export const ERRO_OS = 'A OS tem 10 dígitos, com os zeros da frente.';
export const ERRO_APP_PENDENTE = 'Responda as APPs propostas antes de baixar';
export const ERRO_ARVORE_SEM_PONTO = 'Marque no mapa as árvores sem posição antes de baixar';
export const ERRO_LIMPEZA_CURTA = 'A limpeza de faixa precisa de pelo menos 3 cantos. Clique os cantos no mapa e feche com duplo clique.';
export const ERRO_SEM_CASO = 'Falta o caso: abra o KMZ e o projeto, e resolva os avisos vermelhos.';
export const ERRO_LARGURA = 'A largura da APP precisa ser um número maior que zero, em metros.';
export const ERRO_SEM_KMZ = 'Abra primeiro o KMZ de Áreas Protegidas (passo 1).';
const CHAVE_BASE = 'base';
const chaveMalha = (tipo: TipoMalha): string => `malha-${tipo}`;
const TIPOS_MALHA: TipoMalha[] = ['DNIT', 'SOP', 'FERROVIA'];

export const osValida = (os: string): boolean => /^\d{10}$/.test(os.trim());

// vão que conta na rede nova: situação nova e com tipo
export const contaNaRede = (v: Vao): boolean => v.situacao === 'novo' && v.tipo !== null;

export function proximaMarca(v: Vao): { tipo: TipoRede | null; situacao: Situacao } {
  if (v.situacao === 'novo' && v.tipo === 'MT') return { tipo: 'BT', situacao: 'novo' };
  if (v.situacao === 'novo' && v.tipo === 'BT') return { tipo: 'CONJ', situacao: 'novo' };
  if (v.situacao === 'novo' && v.tipo === 'CONJ') return { tipo: v.tipo, situacao: 'existente' };
  return { tipo: 'MT', situacao: 'novo' };
}

const semExtensao = (nome: string): string => nome.replace(/\.[^./\\]+$/, '');
const mensagem = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function criarEstado(deps: Dependencias = {}): Estado {
  const lerAreas = deps.lerAreas ?? (async (b: Uint8Array, n: string) => lerAreasProtegidas(b, n));
  const lerDaMalha = deps.lerMalha ?? (async (b: Uint8Array, n: string, t: TipoMalha) => lerMalha(b, n, t));
  const armazem = deps.armazem;
  const ouvintes = new Set<() => void>();

  let base: BaseAreas | null = null;
  let kmzNome: string | null = null;
  let rede: Rede | null = null;
  let dxf: DxfGeo | null = null;
  let projeto: Projeto | null = null;
  let liberado = false;
  let chaveEtiqueta = ''; // o que a caixa liberou; se o resultado da conferência mudar, a liberação cai
  let ocupado = false;
  let erro: string | null = null;
  let erroPasso: 1 | 2 | null = null;
  let trabalho: string | null = null;
  let bloqueio: Aviso | null = null;
  let caso: Caso | null = null;
  let apps: AppDoCaso[] = [];
  let m2Postes: Record<string, number> = {};
  let arvores: Arvore[] = [];
  let infoFotos: Record<string, InfoFoto> = {};
  let limpeza: Pt[][] = [];
  let modoMapa: ModoMapa = null;
  let erroArvores: string | null = null;
  let malhas: Malha[] = [];
  let faixa: Aviso[] = [];
  let erroMalha: string | null = null;
  let contaArvores = 0;
  // respostas dadas, por id da água: sobrevivem a marcar um vão (que propõe as APPs de novo)
  let respostas = new Map<number, { resposta: RespostaApp; largura: number }>();
  let atual: Retrato;

  const emArea = (): Aviso[] =>
    base && (arvores.length > 0 || limpeza.length > 0)
      ? avisosEmArea(arvores, limpeza, [...base.areas, ...confirmadas()])
      : [];
  const montar = (): Retrato => ({
    base, rede, bloqueio, caso, ocupado, erro, erroPasso, trabalho, kmzNome, projeto, liberado,
    camadas: dxf ? camadasCandidatas(dxf) : [],
    apps, appsPendentes: apps.filter((a) => a.resposta === 'pendente').length, m2Postes,
    arvores, infoFotos, limpeza, modoMapa, erroArvores, malhas, avisosFaixa: faixa, erroMalha,
    avisosArvores: avisosArvores(arvores), avisosEmArea: emArea(), arvoresSemPonto: arvores.filter((a) => a.ponto === null).length,
  });
  // outro KMZ ou outro projeto: as árvores eram de outra obra
  const limparArvores = () => { arvores = []; infoFotos = {}; limpeza = []; modoMapa = null; erroArvores = null; };
  const avisar = () => {
    atual = montar();
    for (const f of [...ouvintes]) f();
  };

  const confirmadas = (): AreaConfirmada[] =>
    apps.filter((a) => a.resposta === 'confirmada').map((a) => confirmarAppNoNucleo(a.proposta));
  // faixa de domínio só existe com caso pronto: a conta com JSTS é pesada, por isso fica guardada
  const calcularFaixa = () => { faixa = rede && base && !bloqueio ? avisosFaixa(rede, malhas) : []; };
  const calcular = () => {
    caso = rede && base && !bloqueio ? calcularCaso(rede, base, confirmadas(), m2Postes) : null;
  };
  // propõe as APPs de novo e devolve as respostas que ainda valem
  function propor() {
    apps = [];
    if (!rede || !base) return;
    for (const p of proporApps(rede, base)) {
      const antes = respostas.get(p.agua.id);
      let proposta = p;
      let resposta: RespostaApp = 'pendente';
      if (antes) {
        proposta = antes.largura === p.largura ? p : refazerAppNoNucleo(p, antes.largura);
        resposta = antes.resposta;
        if (resposta === 'confirmada') {
          try { confirmarAppNoNucleo(proposta); } catch { resposta = 'pendente'; }
        }
      }
      apps.push({ proposta, resposta, erro: null });
    }
  }
  const guardarResposta = (a: AppDoCaso) => respostas.set(a.proposta.agua.id, { resposta: a.resposta, largura: a.proposta.largura });

  function recalcular() {
    bloqueio = null;
    caso = null;
    apps = [];
    faixa = [];
    if (!rede || !base) return;
    const local = conferirLocal(rede, base.municipios);
    const etiqueta = conferirEtiquetas(rede).aviso;
    const chave = etiqueta?.texto ?? '';
    if (chave !== chaveEtiqueta) { liberado = false; chaveEtiqueta = chave; }
    let b: Aviso | null = local ?? etiqueta;
    if (b?.codigo === 'ETIQUETA_LONGE' && liberado) b = null; // só a etiqueta se libera; FORA_UTM e FORA_CEARA não
    bloqueio = b;
    if (!b) { propor(); calcular(); }
    calcularFaixa();
  }

  function prontoParaBaixar() {
    if (!rede || !base || !caso || !projeto) throw new Error(ERRO_SEM_CASO);
    if (apps.some((a) => a.resposta === 'pendente')) throw new Error(ERRO_APP_PENDENTE);
    if (arvores.some((a) => a.ponto === null)) throw new Error(ERRO_ARVORE_SEM_PONTO);
    return { os: projeto.os, cs: montarCamadas(projeto.os, caso, rede, camadasArvores(projeto.os, arvores, limpeza), base) };
  }

  // deixa a tela pintar "Lendo..." antes de uma conta pesada
  const respirar = () => new Promise<void>((r) => setTimeout(r, 0));

  atual = montar();

  return {
    async iniciar() {
      if (!armazem) return;
      try {
        const guardado = (await armazem.ler(CHAVE_BASE)) as { nome: string; base: BaseAreas } | undefined;
        if (guardado?.base && Array.isArray(guardado.base.areas) && Array.isArray(guardado.base.municipios)) {
          base = guardado.base;
          kmzNome = guardado.nome ?? null;
          avisar();
        }
      } catch {
        // sem armazém: segue e pede o KMZ de novo
      }
      for (const tipo of TIPOS_MALHA) {
        try {
          const g = (await armazem.ler(chaveMalha(tipo))) as Malha | undefined;
          if (g && g.tipo === tipo && Array.isArray(g.linhas)) { malhas = [...malhas.filter((m) => m.tipo !== tipo), g]; }
        } catch {
          // sem armazém: a malha é pedida de novo
        }
      }
      if (malhas.length) { calcularFaixa(); avisar(); }
    },

    async carregarKmz(bytes, nome) {
      erro = null; erroPasso = null;
      ocupado = true;
      trabalho = 'Lendo o KMZ…';
      avisar();
      try {
        const lida = await lerAreas(bytes, nome);
        base = lida;
        kmzNome = nome;
        rede = null; dxf = null; projeto = null; liberado = false; chaveEtiqueta = '';
        respostas = new Map(); m2Postes = {}; limparArvores();
        recalcular();
        if (armazem) {
          try { await armazem.guardar(CHAVE_BASE, { nome, base: lida }); } catch { /* segue sem guardar */ }
        }
      } catch (e) {
        erro = mensagem(e); erroPasso = 1;
      } finally {
        ocupado = false; trabalho = null;
        avisar();
      }
    },

    async carregarMalha(bytes, nome, tipo) {
      erroMalha = null;
      ocupado = true;
      trabalho = `Lendo a malha ${tipo}…`;
      avisar();
      await respirar();
      try {
        const lida = await lerDaMalha(bytes, nome, tipo);
        malhas = [...malhas.filter((m) => m.tipo !== tipo), lida];
        calcularFaixa();
        if (armazem) {
          try { await armazem.guardar(chaveMalha(tipo), lida); } catch { /* segue sem guardar */ }
        }
      } catch (e) {
        erroMalha = mensagem(e);
      } finally {
        ocupado = false; trabalho = null;
        avisar();
      }
    },

    async carregarProjeto(bytes, nome, os) {
      erro = null; erroPasso = null;
      if (!base) { erro = ERRO_SEM_KMZ; erroPasso = 2; avisar(); return; }
      if (!osValida(os)) { erro = ERRO_OS; erroPasso = 2; avisar(); return; }
      ocupado = true;
      trabalho = 'Lendo o projeto…';
      avisar();
      await respirar();
      try {
        let novaRede: Rede;
        let novoDxf: DxfGeo | null = null;
        let detalhe: string;
        if (/\.(kml|kmz)$/i.test(nome)) {
          // os kits reais dão o tipo (MT, BT) pelo nome do arquivo: ele vira a pasta de cima
          const pasta = semExtensao(nome);
          const feicoes = lerKml(bytes).map((f) => ({ ...f, pasta: [pasta, ...f.pasta] }));
          novaRede = proporRedeKml(feicoes);
          detalhe = `${novaRede.vaos.length} vãos · ${novaRede.postes.length} postes`;
        } else {
          novoDxf = lerDxfGeometria(bytes);
          novaRede = proporRedeDxf(novoDxf);
          detalhe = `${novoDxf.linhas.length} linhas · ${novaRede.postes.length} postes · ${novoDxf.cotas.length} textos de cota`;
        }
        rede = novaRede;
        dxf = novoDxf;
        projeto = { nome, os: os.trim(), detalhe };
        liberado = false; chaveEtiqueta = '';
        respostas = new Map(); m2Postes = {}; limparArvores();
        recalcular();
      } catch (e) {
        erro = mensagem(e); erroPasso = 2;
      } finally {
        ocupado = false; trabalho = null;
        avisar();
      }
    },

    marcarVao(id, mudanca) {
      if (!rede) return;
      const v = rede.vaos.find((x) => x.id === id);
      if (!v) return;
      rede = marcarVaoNoNucleo(rede, id, mudanca ?? proximaMarca(v));
      recalcular();
      avisar();
    },

    incluirCamada(camada, tipo) {
      if (!rede || !dxf) return;
      rede = incluirCamadaNoNucleo(rede, dxf, camada, tipo);
      recalcular();
      avisar();
    },

    liberarEtiqueta(sim) {
      liberado = sim;
      recalcular();
      avisar();
    },

    confirmarApp(i, largura) {
      const a = apps[i];
      if (!a) return;
      if (!Number.isFinite(largura) || largura <= 0) { a.erro = ERRO_LARGURA; avisar(); return; }
      if (largura !== a.proposta.largura) a.proposta = refazerAppNoNucleo(a.proposta, largura);
      try {
        confirmarAppNoNucleo(a.proposta); // recusa APP vazia
        a.resposta = 'confirmada';
        a.erro = null;
      } catch (e) {
        a.resposta = 'pendente';
        a.erro = mensagem(e);
      }
      guardarResposta(a);
      calcular();
      avisar();
    },

    recusarApp(i) {
      const a = apps[i];
      if (!a) return;
      a.resposta = 'recusada'; a.erro = null;
      guardarResposta(a);
      calcular();
      avisar();
    },

    reabrirApp(i) {
      const a = apps[i];
      if (!a) return;
      a.resposta = 'pendente'; a.erro = null;
      guardarResposta(a);
      calcular();
      avisar();
    },

    refazerApp(i, largura) {
      const a = apps[i];
      if (!a) return;
      if (!Number.isFinite(largura) || largura <= 0) { a.erro = ERRO_LARGURA; avisar(); return; }
      a.proposta = refazerAppNoNucleo(a.proposta, largura);
      a.erro = null;
      if (a.resposta === 'confirmada') a.resposta = 'pendente'; // a largura mudou: precisa confirmar de novo
      guardarResposta(a);
      calcular();
      avisar();
    },

    mudarM2Poste(id, m2) {
      if (!Number.isFinite(m2) || m2 < 0) return; // a tela valida e avisa; aqui o valor ruim não entra na conta
      m2Postes = { ...m2Postes, [id]: m2 };
      calcular();
      avisar();
    },

    adicionarFotos(fotos) {
      if (!base) return [];
      erroArvores = null;
      const ids: string[] = [];
      for (const f of fotos) {
        const { ponto, aviso } = posicaoDaFoto(f.bytes, base.municipios);
        const id = `arvore-${++contaArvores}`;
        arvores = [...arvores, { id, foto: f.nome, ponto, especie: '', intervencao: 'poda' }];
        infoFotos = { ...infoFotos, [id]: { aviso, origem: ponto ? 'gps' : null } };
        ids.push(id);
      }
      avisar();
      return ids;
    },

    mudarArvore(id, mudanca) {
      arvores = arvores.map((a) => (a.id === id ? {
        ...a,
        especie: mudanca.especie ?? a.especie,
        intervencao: mudanca.intervencao ?? a.intervencao,
      } : a));
      avisar();
    },

    removerArvore(id) {
      arvores = arvores.filter((a) => a.id !== id);
      const { [id]: _fora, ...resto } = infoFotos;
      infoFotos = resto;
      if (modoMapa?.t === 'arvore' && modoMapa.id === id) modoMapa = null;
      avisar();
    },

    colocarArvore(id) {
      erroArvores = null;
      modoMapa = modoMapa?.t === 'arvore' && modoMapa.id === id ? null : { t: 'arvore', id };
      avisar();
    },

    comecarLimpeza() {
      erroArvores = null;
      modoMapa = modoMapa?.t === 'limpeza' ? modoMapa : { t: 'limpeza', pts: [] };
      avisar();
    },

    fecharLimpeza() {
      if (modoMapa?.t !== 'limpeza') return;
      if (modoMapa.pts.length < 3) {
        erroArvores = ERRO_LIMPEZA_CURTA;
      } else {
        limpeza = [...limpeza, modoMapa.pts];
        erroArvores = null;
      }
      modoMapa = null;
      avisar();
    },

    removerLimpeza(i) {
      limpeza = limpeza.filter((_, k) => k !== i);
      avisar();
    },

    cancelarModo() {
      modoMapa = null;
      erroArvores = null;
      avisar();
    },

    clicarNoMapa(p) {
      if (!modoMapa) return;
      if (modoMapa.t === 'arvore') {
        const id = modoMapa.id;
        arvores = arvores.map((a) => (a.id === id ? { ...a, ponto: p } : a));
        infoFotos = { ...infoFotos, [id]: { aviso: infoFotos[id]?.aviso ?? null, origem: 'mapa' } };
        modoMapa = null;
      } else {
        modoMapa = { t: 'limpeza', pts: [...modoMapa.pts, p] };
      }
      avisar();
    },

    baixarPacote() {
      const { os, cs } = prontoParaBaixar();
      return { nome: `kit-${os}-espacial.zip`, bytes: montarPacote(os, cs) };
    },

    baixarGoogleEarth() {
      const { os, cs } = prontoParaBaixar();
      return { nome: `${os} UNIFICADO.kml`, texto: gravarKml(unificar(os, cs).kml) };
    },

    conferir: (bytes, dxfBytes) => conferirZip(bytes, dxfBytes),

    ler: () => atual,
    aoMudar(f) {
      ouvintes.add(f);
      return () => { ouvintes.delete(f); };
    },
  };
}
