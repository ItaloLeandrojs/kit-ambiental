import type { Aviso, Pt, Rede, TipoRede } from './tipos.ts';
import { redeNova } from './rede.ts';
import { semAcento } from './areas.ts';
import { TEXTOS_MEMORIAL } from '../regras/textos-memorial.ts';

export interface Imagem { bytes: Uint8Array; tipo: 'png' | 'jpeg'; largura: number; altura: number } // px
export interface Empresa { nome: string; cnpj: string; endereco: string; municipio: string; telefone: string; email: string; logo: Imagem | null }
export interface Responsavel { nome: string; registro: string; rnp: string; email: string; assinatura: Imagem | null } // assinatura: só PNG
export type TipoAtendimento = 'ligacao-b' | 'ligacao-a' | 'extensao' | 'melhoria' | 'outro';
export type Regional = 'FORTALEZA' | 'METROPOLITANA' | 'LESTE' | 'NORTE' | 'SUL' | 'CENTRO-SUL' | 'ATLÂNTICO';
export type Resposta = 'SIM' | 'NÃO' | 'NÃO SE APLICA' | null;
export type Predominancia = 'arbustiva' | 'arborea' | 'mista-arbustiva' | 'mista-arborea';
export type TipoAgua = 'rio' | 'lagoa' | 'reservatorio';
export interface PosteTipo { altura: number; daN: number; quantidade: number }
export interface DadosObra {
  interessado: { nome: string; endereco: string; bairro: string; cep: string };
  obra: { endereco: string; municipio: string; sed: string; alimentador: string; csi: string; dataSob: string; zona: 'RURAL' | 'URBANA' | null }; // dataSob: aaaa-mm-dd
  finalidade: { tipo: TipoAtendimento | null; fases: 'mono' | 'tri' | null; texto: string }; // texto vazio = usar finalidadePadrao
  rede: { caboMT: string; caboBT: string; postes: PosteTipo[] };
  retirada: { nenhuma: boolean; metros: Partial<Record<TipoRede, number>>; postes: number };
  planilha: { regularidadeApresentou: Resposta; regularidadeAnexou: Resposta; reformaAgraria: Resposta; manutencao: Resposta; podaAnexada: Resposta; validador: string; cvtFotos: Resposta };
  regional: Regional | null;
  predominancia: Predominancia | null; // da limpeza de faixa, quando houver
  tipoAgua: Record<number, TipoAgua>; // por aguaId da APP confirmada
}

export const dadosVazios = (): DadosObra => ({
  interessado: { nome: '', endereco: '', bairro: '', cep: '' },
  obra: { endereco: '', municipio: '', sed: '', alimentador: '', csi: '', dataSob: '', zona: null },
  finalidade: { tipo: null, fases: null, texto: '' },
  rede: { caboMT: '', caboBT: '', postes: [] },
  retirada: { nenhuma: false, metros: {}, postes: 0 },
  planilha: {
    regularidadeApresentou: null, regularidadeAnexou: null, reformaAgraria: null,
    manutencao: null, podaAnexada: null, validador: '', cvtFotos: null,
  },
  regional: null,
  predominancia: null,
  tipoAgua: {},
});

function compVao(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) s += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return s;
}

// soma dos vãos novos com tipo, sem arredondar (quem mostra arredonda com metrosTexto)
export function metrosDaRede(rede: Rede): Record<TipoRede, number> {
  const m: Record<TipoRede, number> = { MT: 0, BT: 0, CONJ: 0 };
  for (const v of redeNova(rede)) m[v.tipo as TipoRede] += compVao(v.pts);
  return m;
}

export const postesNovos = (rede: Rede): number => rede.postes.filter((p) => p.novo).length;

// texto de finalidade no estilo dos memoriais aprovados; texto digitado vale como está
export function finalidadePadrao(d: DadosObra): string {
  const f = d.finalidade;
  if (f.texto.trim() !== '') return f.texto;
  if (f.tipo === null) return '';
  const partes = [d.obra.endereco.trim(), d.obra.municipio.trim() ? `${d.obra.municipio.trim()} - CE` : ''].filter((s) => s !== '');
  const local = partes.length > 0 ? partes.join(', ') : TEXTOS_MEMORIAL.localVazio;
  const T = TEXTOS_MEMORIAL;
  // sem saber se é mono ou tri, não chuta: deixa o campo para preencher
  if (f.tipo === 'ligacao-b' && f.fases === null) return T.finalidadeFasesVazias.replace('{local}', local);
  const modelo = {
    'ligacao-b': f.fases === 'tri' ? T.finalidadeLigacaoBTri : T.finalidadeLigacaoBMono,
    'ligacao-a': T.finalidadeLigacaoA,
    extensao: T.finalidadeExtensao,
    melhoria: T.finalidadeMelhoria,
    outro: T.finalidadeOutro,
  }[f.tipo];
  return modelo.replace('{local}', local);
}

export function validarDados(d: DadosObra, ctx: { postesNovos: number; municipioKmz: string | null }): Aviso[] {
  const T = TEXTOS_MEMORIAL;
  const avisos: Aviso[] = [];
  if (d.interessado.cep.trim() === '') {
    avisos.push({ nivel: 'amarelo', codigo: 'CEP_VAZIO', texto: T.cepVazio, comoCorrigir: T.cepVazioComo });
  }
  if (d.finalidade.tipo === 'ligacao-b' && d.finalidade.fases === null) {
    avisos.push({ nivel: 'amarelo', codigo: 'FASES_VAZIAS', texto: T.fasesVazias, comoCorrigir: T.fasesVaziasComo });
  }
  const soma = d.rede.postes.reduce((s, p) => s + p.quantidade, 0);
  if (soma !== ctx.postesNovos) {
    avisos.push({
      nivel: 'vermelho',
      codigo: 'POSTES_NAO_BATEM',
      texto: T.postesNaoBatem.replace('{soma}', String(soma)).replace('{novos}', String(ctx.postesNovos)),
      comoCorrigir: T.postesNaoBatemComo,
    });
  }
  const digitado = d.obra.municipio.trim();
  if (ctx.municipioKmz && digitado !== '' && semAcento(digitado) !== semAcento(ctx.municipioKmz.trim())) {
    avisos.push({
      nivel: 'amarelo',
      codigo: 'MUNICIPIO_EDITADO',
      texto: T.municipioEditado.replace('{digitado}', digitado).replace('{kmz}', ctx.municipioKmz),
      comoCorrigir: T.municipioEditadoComo,
    });
  }
  return avisos;
}

// a tabela de regionais fica em regras/regionais.ts; reexportada aqui para quem só importa a obra
export { REGIONAL_DO_MUNICIPIO, regionalSugerida } from '../regras/regionais.ts';
