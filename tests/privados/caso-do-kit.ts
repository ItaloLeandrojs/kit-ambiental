// Monta o caso de um kit aprovado a partir dos KMLs dele (usado por kits.test.ts e memorial-gerado.test.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVADOS } from './caminhos.ts';
import { abrirZip, type ArquivoZip } from '../../src/nucleo/zip.ts';
import { lerKml } from '../../src/nucleo/kml.ts';
import { proporRedeKml } from '../../src/nucleo/rede.ts';
import type { BaseAreas } from '../../src/nucleo/areas.ts';
import { calcularCaso, type AreaConfirmada, type Caso } from '../../src/nucleo/caso.ts';
import type { Pt, Rede, TipoRede } from '../../src/nucleo/tipos.ts';

export interface IntervencaoGabarito {
  nomeNoMemorial: string;
  nomeNoKmz: string | null;
  gestor: string | null;
  metrosMemorial: Partial<Record<TipoRede, number>>;
  haMemorial: number;
  metrosKml?: Partial<Record<TipoRede, number>>;
  fonte: string;
}
export interface KitGabarito {
  zip: string;
  rede: string[];
  appsDoKit: string[];
  intervencoes: IntervencaoGabarito[];
  divergencias: string[];
  amarelosConhecidos: string[];
}

// regra global do desenho, escrita aqui de novo para os testes não dependerem de src/regras
export const FAIXA_GLOBAL: Record<TipoRede, number> = { MT: 6, BT: 3, CONJ: 6 };

const LARGURA_NAO_USADA = 0; // a APP já vem desenhada no kit; o caso não usa a largura

const nomeDoArquivo = (caminho: string): string => caminho.slice(caminho.lastIndexOf('/') + 1).replace(/\.km[lz]$/i, '');

export interface CasoDoKit {
  bytes: Uint8Array;
  rede: Rede;
  confirmadas: AreaConfirmada[];
  caso: Caso;
  /** Erros de montagem (APP sem polígono), para o teste relatar. */
  problemas: string[];
}

export function montarCasoDoKit(kit: KitGabarito, base: BaseAreas): CasoDoKit {
  const bytes = new Uint8Array(readFileSync(join(PRIVADOS, kit.zip)));
  const arquivos = abrirZip(bytes);
  const pega = (caminho: string): ArquivoZip => {
    const a = arquivos.find((x) => x.caminho === caminho);
    if (!a) throw new Error(`não achei no zip: ${caminho}`);
    return a;
  };

  // a rede: só o que está dentro dos KMLs, sem o nome do arquivo (a tela vai passar o nome como pasta de cima)
  const rede = proporRedeKml(kit.rede.flatMap((c) => lerKml(pega(c).bytes)));

  // as APPs aprovadas no kit, aceitas como estão desenhadas
  const problemas: string[] = [];
  const confirmadas: AreaConfirmada[] = kit.appsDoKit.map((c) => {
    const poligonos: Pt[][][] = lerKml(pega(c).bytes).flatMap((f) =>
      f.geometrias.flatMap((g) => (g.t === 'poligono' ? [g.aneis] : [])),
    );
    if (poligonos.length === 0) problemas.push(`APP sem polígono: ${c}`);
    return { nome: nomeDoArquivo(c), tipo: 'APP', poligonos, largura: LARGURA_NAO_USADA };
  });

  const caso = calcularCaso(rede, base, confirmadas);
  return { bytes, rede, confirmadas, caso, problemas };
}

/** Alvo e folga (em metros) de um tipo de rede numa intervenção do gabarito: 1 m onde o KML diverge do memorial, senão o maior entre 2 m e 3%. */
export function alvoETolerancia(esperado: IntervencaoGabarito, t: TipoRede): { alvo: number; tol: number } {
  const alvo = esperado.metrosKml ? (esperado.metrosKml[t] ?? 0) : (esperado.metrosMemorial[t] ?? 0);
  const tol = esperado.metrosKml ? 1 : Math.max(2, 0.03 * alvo);
  return { alvo, tol };
}
