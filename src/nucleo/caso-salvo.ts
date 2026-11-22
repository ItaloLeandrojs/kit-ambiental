// Caso salvo num arquivo local: o que o usuário digitou e marcou, para continuar depois.
// Não leva empresa, responsável técnico, CNPJ, assinatura nem os bytes das fotos (a árvore guarda só o nome da foto).
import type { Pt, Situacao, TipoRede } from './tipos.ts';
import type { DadosObra } from './obra.ts';
import type { Arvore } from './arvores.ts';
import { TEXTOS_CASO_SALVO } from '../regras/textos-memorial.ts';

export interface CasoSalvo {
  versao: 1; os: string; projetoNome: string; projetoHash: string; // SHA-256 em hex dos bytes do projeto
  dados: DadosObra; uc: Pt | null;
  marcas: Record<string, { tipo: TipoRede | null; situacao: Situacao }>; camadasIncluidas: { camada: string; tipo: TipoRede }[];
  apps: { aguaId: number; resposta: 'confirmada' | 'recusada'; largura: number }[]; m2Postes: Record<string, number>;
  arvores: Arvore[]; limpeza: Pt[][]; liberado: boolean;
}

// só os campos do caso, um por um: o que vier a mais no objeto não vai para o arquivo
export function gravarCasoSalvo(c: CasoSalvo): string {
  const limpo: CasoSalvo = {
    versao: 1,
    os: c.os,
    projetoNome: c.projetoNome,
    projetoHash: c.projetoHash,
    dados: c.dados,
    uc: c.uc,
    marcas: c.marcas,
    camadasIncluidas: c.camadasIncluidas,
    apps: c.apps,
    m2Postes: c.m2Postes,
    arvores: c.arvores,
    limpeza: c.limpeza,
    liberado: c.liberado,
  };
  return JSON.stringify(limpo, null, 2);
}

const ehObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

export function lerCasoSalvo(texto: string): CasoSalvo {
  let o: unknown;
  try { o = JSON.parse(texto); } catch { throw new Error(TEXTOS_CASO_SALVO.naoEhCaso); }
  if (!ehObjeto(o) || typeof o.versao !== 'number') throw new Error(TEXTOS_CASO_SALVO.naoEhCaso);
  if (o.versao > 1) throw new Error(TEXTOS_CASO_SALVO.versaoNova);
  const ok = o.versao === 1 && typeof o.os === 'string' && typeof o.projetoNome === 'string' && typeof o.projetoHash === 'string'
    && ehObjeto(o.dados) && ehObjeto(o.marcas) && ehObjeto(o.m2Postes) && Array.isArray(o.camadasIncluidas)
    && Array.isArray(o.apps) && Array.isArray(o.arvores) && Array.isArray(o.limpeza) && typeof o.liberado === 'boolean'
    && (o.uc === null || Array.isArray(o.uc));
  if (!ok) throw new Error(TEXTOS_CASO_SALVO.naoEhCaso);
  const dados = o.dados as unknown as DadosObra;
  // as chaves de objeto viram texto no JSON; em JS isso já é o mesmo que o número, mas refaz explícito
  const tipoAgua: DadosObra['tipoAgua'] = {};
  for (const [k, v] of Object.entries(ehObjeto(dados.tipoAgua) ? dados.tipoAgua : {})) tipoAgua[Number(k)] = v as DadosObra['tipoAgua'][number];
  return { ...(o as unknown as CasoSalvo), dados: { ...dados, tipoAgua } };
}

export async function hashDoProjeto(bytes: Uint8Array): Promise<string> {
  const resumo = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
