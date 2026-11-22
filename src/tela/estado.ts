// Estado da tela: liga o núcleo aos passos 1 a 3 (KMZ, projeto e confirmação da rede).
// Não sabe de DOM nem de worker: quem monta a tela passa o leitor do KMZ e o armazém.
import { lerAreasProtegidas, VERSAO_LEITURA, type BaseAreas } from '../nucleo/areas.ts';
import { proporApps, refazerApp as refazerAppNoNucleo, confirmarApp as confirmarAppNoNucleo, ERRO_APP_SEM_DESENHO, type AppProposta } from '../nucleo/app.ts';
import { avisosArvores, avisosEmArea, camadasArvores, posicaoDaFoto, type Arvore, type IntervencaoArvore } from '../nucleo/arvores.ts';
import { montarCamadas, unificar } from '../nucleo/camadas.ts';
import { calcularCaso, type AreaConfirmada, type Caso } from '../nucleo/caso.ts';
import { conferirZip, type ItemConferencia } from '../nucleo/conferir.ts';
import { avisosFaixa, lerMalha, type Malha, type TipoMalha } from '../nucleo/faixa.ts';
import { gravarKml } from '../nucleo/kml-saida.ts';
import { montarPacote } from '../nucleo/pacote.ts';
import { lerDxfGeometria, type DxfGeo } from '../nucleo/dxf.ts';
import { lerKml } from '../nucleo/kml.ts';
import { AVISO_SUBTERRANEA, temSubterraneaDxf, temSubterraneaKml } from '../nucleo/subterranea.ts';
import { conferirEtiquetas, conferirLocal } from '../nucleo/local.ts';
import { incluirCamada as incluirCamadaNoNucleo, camadasCandidatas, marcarVao as marcarVaoNoNucleo, proporRedeDxf, proporRedeKml } from '../nucleo/rede.ts';
import type { Aviso, Pt, Rede, Situacao, TipoRede, Vao } from '../nucleo/tipos.ts';
import type { CasoSalvo } from '../nucleo/caso-salvo.ts';

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
  /** Para a Parte 2 (estado-kit): os bytes do projeto aberto (hash do caso salvo), o DXF (UC) e as camadas incluídas. */
  projetoAberto(): { bytes: Uint8Array; dxf: DxfGeo | null; camadasIncluidas: { camada: string; tipo: TipoRede }[] } | null;
  /**
   * Repõe um caso salvo sobre o projeto aberto, na ordem do estado: camadas incluídas e marcas dos vãos, depois as APPs
   * propostas com as respostas salvas, depois postes, árvores, limpeza e a caixa da etiqueta. Avisa `aoMudar` uma vez.
   */
  restaurar(c: CasoSalvo): void;
  ler(): Retrato;
  aoMudar(f: () => void): () => void;
}

export const ERRO_OS = 'A OS tem 10 dígitos, com os zeros da frente.';
export const ERRO_APP_PENDENTE = 'Responda as APPs propostas antes de baixar';
export const ERRO_ARVORE_SEM_PONTO = 'Marque no mapa as árvores sem posição antes de baixar';
export const ERRO_AVISO_VERMELHO = 'Resolva os avisos vermelhos do caso antes de baixar';
export const ERRO_LIMPEZA_CURTA = 'A limpeza de faixa precisa de pelo menos 3 cantos. Clique os cantos no mapa e feche com duplo clique.';
export const ERRO_SEM_CASO = 'Falta o caso: abra o KMZ e o projeto, e resolva os avisos vermelhos.';
export const ERRO_LARGURA = 'A largura da APP precisa ser um número maior que zero, em metros.';
export const ERRO_SEM_KMZ = 'Abra primeiro o KMZ de Áreas Protegidas (passo 1).';
export const ERRO_CALCULO = 'Não consegui cruzar a rede nova com as áreas do KMZ: a conta deu erro. O caso e o resumo não valem até isso ser resolvido.';
export const ERRO_BASE_ANTIGA = 'O KMZ guardado neste computador foi lido por uma versão antiga do site. Abra o KMZ de Áreas Protegidas de novo.';
// a conta lançou (ex.: polígono quebrado no JSTS): vermelho claro, sem o erro em inglês, e nada do caso velho
const FALHA_NO_CALCULO: Aviso = {
  nivel: 'vermelho', codigo: 'CALCULO_FALHOU', texto: ERRO_CALCULO,
  comoCorrigir: 'Confira a rede no mapa e tente de novo. Se o erro continuar, avise o responsável pelo site e mande o projeto e o KMZ: sem a conta o kit não sai.',
};
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
  let bytesProjeto: Uint8Array | null = null; // só para o hash do caso salvo (Parte 2)
  let camadasIncluidas: { camada: string; tipo: TipoRede }[] = []; // o que incluirCamada juntou, para o caso salvo
  let subterraneas: string[] = []; // camadas ou pastas de rede subterrânea achadas no projeto
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

  // Contas pesadas guardadas pela entrada: só refazem quando o que elas usam muda (desempenho, revisão final I3).
  // `iguais` compara a chave nova com a guardada: identidade para objetos grandes, texto para o resto.
  type Chave = unknown[];
  const iguais = (a: Chave, b: Chave): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
  // a rede nova pela geometria (o tipo não muda a faixa, as APPs propostas nem a posição das árvores)
  const desenhoDaRedeNova = (): string =>
    rede ? JSON.stringify([rede.vaos.filter(contaNaRede).map((v) => v.pts), rede.postes.filter((p) => p.novo).map((p) => p.ponto)]) : '';
  let memoEmArea: { chave: Chave; avisos: Aviso[] } | null = null;
  const emArea = (): Aviso[] => {
    if (!base || (arvores.length === 0 && limpeza.length === 0)) return [];
    // a APP confirmada vale pela água, pela largura e pelo recorte (a caixa da rede): é o que dá o polígono
    const apps0 = apps.filter((a) => a.resposta === 'confirmada').map((a) => [a.proposta.agua.id, a.proposta.largura, ...a.proposta.caixa]);
    const chave: Chave = [base, limpeza, JSON.stringify([arvores.map((a) => [a.ponto, a.intervencao]), apps0])];
    if (!memoEmArea || !iguais(memoEmArea.chave, chave)) {
      memoEmArea = { chave, avisos: avisosEmArea(arvores, limpeza, [...base.areas, ...confirmadas()]) };
    }
    return memoEmArea.avisos;
  };
  let memoFaixa: { chave: Chave; avisos: Aviso[] } | null = null;
  let memoApps: { chave: Chave; apps: AppProposta[] } | null = null;
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
  // a conta lançou: some tudo o que veio dela e fica o vermelho (nunca o caso de antes na tela)
  const falhou = () => { bloqueio = FALHA_NO_CALCULO; caso = null; apps = []; faixa = []; };
  // faixa de domínio só existe com caso pronto: a conta com JSTS é pesada, por isso fica guardada
  const calcularFaixa = () => {
    faixa = [];
    if (!rede || !base || bloqueio) return;
    const chave: Chave = [desenhoDaRedeNova(), ...malhas];
    try {
      if (!memoFaixa || !iguais(memoFaixa.chave, chave)) memoFaixa = { chave, avisos: avisosFaixa(rede, malhas) };
      faixa = memoFaixa.avisos;
    } catch { memoFaixa = null; falhou(); }
  };
  const calcular = () => {
    caso = null;
    if (!rede || !base || bloqueio) return;
    try { caso = calcularCaso(rede, base, confirmadas(), m2Postes); } catch { falhou(); }
  };
  // propõe as APPs de novo e devolve as respostas que ainda valem
  function propor() {
    apps = [];
    if (!rede || !base) return;
    const chave: Chave = [base, desenhoDaRedeNova()];
    if (!memoApps || !iguais(memoApps.chave, chave)) memoApps = { chave, apps: proporApps(rede, base) };
    for (const p of memoApps.apps) {
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
      apps.push({ proposta, resposta, erro: proposta.semDesenho ? ERRO_APP_SEM_DESENHO : null });
    }
  }
  const guardarResposta = (a: AppDoCaso) => respostas.set(a.proposta.agua.id, { resposta: a.resposta, largura: a.proposta.largura });

  function recalcular() {
    bloqueio = null;
    caso = null;
    apps = [];
    faixa = [];
    if (!rede || !base) return;
    // subterrânea vem antes de qualquer outro bloqueio
    if (subterraneas.length) {
      bloqueio = { ...AVISO_SUBTERRANEA, comoCorrigir: `${AVISO_SUBTERRANEA.comoCorrigir} Achei: ${subterraneas.join(', ')}.` };
      return;
    }
    try {
      const local = conferirLocal(rede, base.municipios);
      const etiqueta = conferirEtiquetas(rede).aviso;
      const chave = etiqueta?.texto ?? '';
      if (chave !== chaveEtiqueta) { liberado = false; chaveEtiqueta = chave; }
      let b: Aviso | null = local ?? etiqueta;
      if (b?.codigo === 'ETIQUETA_LONGE' && liberado) b = null; // só a etiqueta se libera; FORA_UTM e FORA_CEARA não
      bloqueio = b;
      if (!b) { propor(); calcular(); }
      calcularFaixa();
    } catch {
      falhou();
    }
  }

  function prontoParaBaixar() {
    if (!rede || !base || !caso || !projeto) throw new Error(ERRO_SEM_CASO);
    if (caso.avisos.some((a) => a.nivel === 'vermelho')) throw new Error(ERRO_AVISO_VERMELHO);
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
        const guardado = (await armazem.ler(CHAVE_BASE)) as { nome: string; base: BaseAreas; versao?: number } | undefined;
        if (guardado?.base && Array.isArray(guardado.base.areas) && Array.isArray(guardado.base.municipios)) {
          if (guardado.versao === VERSAO_LEITURA) {
            base = guardado.base;
            kmzNome = guardado.nome ?? null;
          } else {
            // lida antes do conserto dos polígonos: pede o KMZ de novo em vez de usar a base sem conserto
            erro = ERRO_BASE_ANTIGA; erroPasso = 1;
          }
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
        rede = null; dxf = null; subterraneas = []; projeto = null; liberado = false; chaveEtiqueta = '';
        bytesProjeto = null; camadasIncluidas = [];
        respostas = new Map(); m2Postes = {}; limparArvores();
        recalcular();
        if (armazem) {
          try { await armazem.guardar(CHAVE_BASE, { nome, base: lida, versao: VERSAO_LEITURA }); } catch { /* segue sem guardar */ }
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
        let achadas: string[];
        if (/\.(kml|kmz)$/i.test(nome)) {
          // os kits reais dão o tipo (MT, BT) pelo nome do arquivo: ele vira a pasta de cima
          const pasta = semExtensao(nome);
          const feicoes = lerKml(bytes).map((f) => ({ ...f, pasta: [pasta, ...f.pasta] }));
          achadas = temSubterraneaKml(feicoes);
          novaRede = proporRedeKml(feicoes);
          detalhe = `${novaRede.vaos.length} vãos · ${novaRede.postes.length} postes`;
        } else {
          novoDxf = lerDxfGeometria(bytes);
          achadas = temSubterraneaDxf(novoDxf);
          novaRede = proporRedeDxf(novoDxf);
          detalhe = `${novoDxf.linhas.length} linhas · ${novaRede.postes.length} postes · ${novoDxf.cotas.length} textos de cota`;
        }
        rede = novaRede;
        dxf = novoDxf;
        subterraneas = achadas;
        projeto = { nome, os: os.trim(), detalhe };
        bytesProjeto = bytes; camadasIncluidas = [];
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
      camadasIncluidas = [...camadasIncluidas, { camada, tipo }];
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
      a.erro = a.proposta.semDesenho ? ERRO_APP_SEM_DESENHO : null;
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

    projetoAberto: () => (projeto && bytesProjeto ? { bytes: bytesProjeto, dxf, camadasIncluidas: [...camadasIncluidas] } : null),

    restaurar(c) {
      if (!rede || !base || !projeto) return;
      let r = rede;
      const incluidas: { camada: string; tipo: TipoRede }[] = [];
      if (dxf) {
        for (const x of c.camadasIncluidas) { r = incluirCamadaNoNucleo(r, dxf, x.camada, x.tipo); incluidas.push({ camada: x.camada, tipo: x.tipo }); }
      }
      // só o vão que mudou ganha a marca (os outros ficam com o motivo da proposta)
      for (const [id, m] of Object.entries(c.marcas)) {
        const v = r.vaos.find((x) => x.id === id);
        if (v && (v.tipo !== m.tipo || v.situacao !== m.situacao)) r = marcarVaoNoNucleo(r, id, { tipo: m.tipo, situacao: m.situacao });
      }
      rede = r;
      camadasIncluidas = incluidas;
      respostas = new Map(c.apps.map((a) => [a.aguaId, { resposta: a.resposta, largura: a.largura }]));
      m2Postes = { ...c.m2Postes };
      arvores = c.arvores.map((a) => ({ ...a, ponto: a.ponto ? [a.ponto[0], a.ponto[1]] as Pt : null }));
      // a foto não vem no caso salvo: não se sabe mais se o ponto veio do GPS
      infoFotos = Object.fromEntries(arvores.map((a) => [a.id, { aviso: null, origem: null }]));
      for (const a of arvores) {
        const n = /^arvore-(\d+)$/.exec(a.id);
        if (n) contaArvores = Math.max(contaArvores, Number(n[1]));
      }
      limpeza = c.limpeza.map((l) => l.map((p) => [p[0], p[1]] as Pt));
      modoMapa = null; erroArvores = null; erro = null; erroPasso = null;
      recalcular(); // acerta a chave da etiqueta para a rede reposta
      liberado = c.liberado;
      recalcular();
      avisar();
    },

    ler: () => atual,
    aoMudar(f) {
      ouvintes.add(f);
      return () => { ouvintes.delete(f); };
    },
  };
}
