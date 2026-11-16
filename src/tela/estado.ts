// Estado da tela: liga o núcleo aos passos 1 a 3 (KMZ, projeto e confirmação da rede).
// Não sabe de DOM nem de worker: quem monta a tela passa o leitor do KMZ e o armazém.
import { lerAreasProtegidas, type BaseAreas } from '../nucleo/areas.ts';
import { calcularCaso, type Caso } from '../nucleo/caso.ts';
import { lerDxfGeometria, type DxfGeo } from '../nucleo/dxf.ts';
import { lerKml } from '../nucleo/kml.ts';
import { conferirEtiquetas, conferirLocal } from '../nucleo/local.ts';
import { incluirCamada as incluirCamadaNoNucleo, camadasCandidatas, marcarVao as marcarVaoNoNucleo, proporRedeDxf, proporRedeKml } from '../nucleo/rede.ts';
import type { Aviso, Rede, Situacao, TipoRede, Vao } from '../nucleo/tipos.ts';

export interface Projeto { nome: string; os: string; detalhe: string }

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
}

export interface Armazem {
  guardar(chave: string, valor: unknown): Promise<void>;
  ler(chave: string): Promise<unknown>;
}

export interface Dependencias {
  lerAreas?: (bytes: Uint8Array, nome: string) => Promise<BaseAreas>;
  armazem?: Armazem;
}

export interface Estado {
  iniciar(): Promise<void>;
  carregarKmz(bytes: Uint8Array, nome: string): Promise<void>;
  carregarProjeto(bytes: Uint8Array, nome: string, os: string): Promise<void>;
  /** Sem `mudanca`, passa para a próxima marca do ciclo (MT novo, BT novo, conjugada nova, fora). */
  marcarVao(id: string, mudanca?: { tipo?: TipoRede | null; situacao?: Situacao }): void;
  incluirCamada(camada: string, tipo: TipoRede): void;
  liberarEtiqueta(sim: boolean): void;
  ler(): Retrato;
  aoMudar(f: () => void): () => void;
}

export const ERRO_OS = 'A OS tem 10 dígitos, com os zeros da frente.';
export const ERRO_SEM_KMZ = 'Abra primeiro o KMZ de Áreas Protegidas (passo 1).';
const CHAVE_BASE = 'base';

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
  let atual: Retrato;

  const montar = (): Retrato => ({
    base, rede, bloqueio, caso, ocupado, erro, erroPasso, trabalho, kmzNome, projeto, liberado,
    camadas: dxf ? camadasCandidatas(dxf) : [],
  });
  const avisar = () => {
    atual = montar();
    for (const f of [...ouvintes]) f();
  };

  function recalcular() {
    bloqueio = null;
    caso = null;
    if (!rede || !base) return;
    const local = conferirLocal(rede, base.municipios);
    const etiqueta = conferirEtiquetas(rede).aviso;
    const chave = etiqueta?.texto ?? '';
    if (chave !== chaveEtiqueta) { liberado = false; chaveEtiqueta = chave; }
    let b: Aviso | null = local ?? etiqueta;
    if (b?.codigo === 'ETIQUETA_LONGE' && liberado) b = null; // só a etiqueta se libera; FORA_UTM e FORA_CEARA não
    bloqueio = b;
    if (!b) caso = calcularCaso(rede, base, []);
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

    ler: () => atual,
    aoMudar(f) {
      ouvintes.add(f);
      return () => { ouvintes.delete(f); };
    },
  };
}
