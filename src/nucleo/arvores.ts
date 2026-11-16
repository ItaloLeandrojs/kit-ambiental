// Árvores do kit (poda, supressão e limpeza de faixa) a partir das fotos do celular.
import type { Aviso, Geometria, Pt } from './tipos.ts';
import type { AreaProtegida } from './areas.ts';
import type { CamadaKit } from './shp.ts';
import { lerGpsJpeg } from './exif.ts';
import { G } from './geom.ts';
import { paraUtm } from './utm.ts';

export type IntervencaoArvore = 'poda' | 'supressao' | 'limpeza';
export interface Arvore { id: string; foto: string; ponto: Pt | null; especie: string; intervencao: IntervencaoArvore }

export const LIMITE_ARVORES = 20;
const FORA_DO_CEARA = 'A posição desta foto fica fora do Ceará. Clique no mapa onde está a árvore.';
const HEIC = 'Foto HEIC: o site não lê a posição. Clique no mapa onde está a árvore.';
const SEM_GPS = 'Esta foto não tem a posição. Clique no mapa onde está a árvore.';

// HEIC/HEIF: "ftyp" a partir do byte 4, com a marca do formato logo depois (ex.: ftypheic)
const ehHeic = (b: Uint8Array): boolean => {
  if (b.length < 12) return false;
  const texto = String.fromCharCode(...b.subarray(4, 12));
  return /^ftyp(hei[cx]|hevc|hevx|mif1|msf1)$/.test(texto);
};

/**
 * Onde a foto foi tirada, em UTM 24S. Sempre que `ponto` é `null` vem o aviso que pede o clique no mapa:
 * a árvore nunca é posta num lugar de que o site não tem certeza.
 */
export function posicaoDaFoto(bytes: Uint8Array, municipios: AreaProtegida[]): { ponto: Pt | null; aviso: string | null } {
  if (ehHeic(bytes)) return { ponto: null, aviso: HEIC };
  const gps = lerGpsJpeg(bytes);
  if (!gps) return { ponto: null, aviso: SEM_GPS };
  const ponto = paraUtm(gps.lon, gps.lat);
  const alvo = G.ponto(ponto);
  const dentro = municipios.some(
    (m) => ponto[0] >= m.caixa[0] && ponto[0] <= m.caixa[2] && ponto[1] >= m.caixa[1] && ponto[1] <= m.caixa[3]
      && m.poligonos.some((p) => G.contem(G.poligono(p), alvo)),
  );
  return dentro ? { ponto, aviso: null } : { ponto: null, aviso: FORA_DO_CEARA };
}

const semAcento = (t: string): string => t.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();

export function avisosArvores(as: Arvore[]): Aviso[] {
  const avisos: Aviso[] = [];
  if (as.some((a) => semAcento(a.especie).includes('CARNAUBA'))) {
    avisos.push({
      nivel: 'amarelo',
      codigo: 'ARVORE_CARNAUBA',
      texto: 'Carnaúba é espécie protegida (Decreto estadual 27.413/2004).',
      comoCorrigir: 'Confirme com o órgão antes de cortar.',
    });
  }
  if (as.length > LIMITE_ARVORES) {
    avisos.push({
      nivel: 'amarelo',
      codigo: 'ARVORE_MUITAS',
      texto: 'Com mais de 20 árvores, desenhe a área de limpeza de faixa em vez de árvore por árvore.',
      comoCorrigir: 'Use "Desenhar limpeza de faixa": clique os cantos da área no mapa e feche com duplo clique.',
    });
  }
  const sem = as.filter((a) => a.ponto === null).length;
  if (sem > 0) {
    avisos.push({
      nivel: 'vermelho',
      codigo: 'ARVORE_SEM_PONTO',
      texto: sem === 1 ? 'Há 1 árvore sem posição no mapa.' : `Há ${sem} árvores sem posição no mapa.`,
      comoCorrigir: 'Clique em "Clicar no mapa" na árvore e depois no mapa, onde ela está. Sem isso o kit não pode ser baixado.',
    });
  }
  return avisos;
}

const fechado = (anel: Pt[]): Pt[] => {
  const p = anel[0], u = anel[anel.length - 1];
  return p[0] === u[0] && p[1] === u[1] ? anel : [...anel, p];
};

/**
 * Camadas `<OS> PODA` e `<OS> SUPRESSAO` (ponto, nome = espécie) e `<OS> LIMPEZA DE FAIXA` (polígono).
 * Árvore sem ponto não sai (o estado trava o download antes). Camada vazia não sai.
 */
export function camadasArvores(os: string, as: Arvore[], limpeza: Pt[][] = []): CamadaKit[] {
  const saida: CamadaKit[] = [];
  const pontos = (iv: IntervencaoArvore): CamadaKit['feicoes'] =>
    as.filter((a) => a.intervencao === iv && a.ponto !== null)
      .map((a) => ({ name: a.especie.trim() || 'Árvore', geometria: [{ t: 'ponto', p: a.ponto! } as Geometria] }));
  const poda = pontos('poda');
  const supressao = pontos('supressao');
  if (poda.length) saida.push({ nome: `${os} PODA`, tipo: 'ponto', feicoes: poda });
  if (supressao.length) saida.push({ nome: `${os} SUPRESSAO`, tipo: 'ponto', feicoes: supressao });
  const areas = limpeza.filter((a) => a.length >= 3);
  if (areas.length) {
    saida.push({
      nome: `${os} LIMPEZA DE FAIXA`,
      tipo: 'poligono',
      feicoes: areas.map((a) => ({ name: 'Limpeza de faixa', geometria: [{ t: 'poligono', aneis: [fechado(a)] } as Geometria] })),
    });
  }
  return saida;
}
