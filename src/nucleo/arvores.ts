// Árvores do kit (poda, supressão e limpeza de faixa) a partir das fotos do celular.
import type { Aviso, Geometria, Pt } from './tipos.ts';
import type { AreaProtegida } from './areas.ts';
import type { CamadaKit } from './shp.ts';
import { lerGpsJpeg } from './exif.ts';
import { G } from './geom.ts';
import { paraUtm } from './utm.ts';
import { haTexto } from './formato.ts';

// limpeza de faixa é uma ÁREA (polígono desenhado no mapa), não uma árvore: por isso não está aqui
export type IntervencaoArvore = 'poda' | 'supressao';
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
  const semEspecie = as.filter((a) => a.especie.trim() === '').length;
  if (semEspecie > 0) {
    avisos.push({
      nivel: 'amarelo',
      codigo: 'ARVORE_SEM_ESPECIE',
      texto: semEspecie === 1 ? 'Há 1 árvore sem espécie.' : `Há ${semEspecie} árvores sem espécie.`,
      comoCorrigir: 'Digite a espécie de cada árvore. Sem ela, a feição sai no kit com o nome "Árvore".',
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

export interface AreaParaCruzar { nome: string; poligonos: Pt[][][]; caixa?: [number, number, number, number] }

const NOME_INTERVENCAO: Record<IntervencaoArvore, string> = { poda: 'Poda', supressao: 'Supressão' };
const poligonoValido = (an: Pt[][]): boolean => an.length > 0 && an[0].length >= 4;

/**
 * Aviso amarelo para cada (intervenção, área) em que um ponto de árvore, ou o polígono de limpeza de faixa,
 * cai dentro de uma área protegida ou de uma APP confirmada. Não muda metros nem hectares da rede.
 */
export function avisosEmArea(as: Arvore[], limpeza: Pt[][], areas: AreaParaCruzar[]): Aviso[] {
  const avisos: Aviso[] = [];
  const vistos = new Set<string>();
  const poe = (que: string, nome: string) => {
    const chave = `${que}|${nome}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    avisos.push({
      nivel: 'amarelo',
      codigo: 'ARVORE_EM_AREA',
      texto: `${que} dentro de ${nome}: o órgão precisa saber; inclua no memorial`,
      comoCorrigir: 'Cite a intervenção no memorial e confirme com o órgão da área antes de executar.',
    });
  };
  const alvos = [
    ...as.filter((a) => a.ponto !== null).map((a) => ({ que: NOME_INTERVENCAO[a.intervencao], geo: G.ponto(a.ponto!), caixa: [a.ponto![0], a.ponto![1], a.ponto![0], a.ponto![1]] })),
    ...limpeza.filter((l) => l.length >= 3).map((l) => ({ que: 'Limpeza de faixa', geo: G.poligono([fechado(l)]), caixa: G.envelope(G.poligono([fechado(l)])) })),
  ];
  if (alvos.length === 0) return avisos;
  for (const area of areas) {
    for (const alvo of alvos) {
      if (area.caixa && (alvo.caixa[0] > area.caixa[2] || alvo.caixa[2] < area.caixa[0] || alvo.caixa[1] > area.caixa[3] || alvo.caixa[3] < area.caixa[1])) continue;
      if (area.poligonos.filter(poligonoValido).some((p) => G.distancia(alvo.geo, G.poligono(p)) === 0)) poe(alvo.que, area.nome);
    }
  }
  return avisos;
}

/** Linha do resumo do caso: quantas podas, quantas supressões e a limpeza de faixa em m² e ha. Sem nada, `null`. */
export function linhaArvores(as: Arvore[], limpeza: Pt[][]): string | null {
  const podas = as.filter((a) => a.intervencao === 'poda').length;
  const sup = as.filter((a) => a.intervencao === 'supressao').length;
  const partes: string[] = [];
  if (podas) partes.push(`${podas} ${podas === 1 ? 'poda' : 'podas'}`);
  if (sup) partes.push(`${sup} ${sup === 1 ? 'supressão' : 'supressões'}`);
  const m2 = limpeza.filter((l) => l.length >= 3).reduce((s, l) => s + G.area(G.poligono([fechado(l)])), 0);
  if (m2 > 0) partes.push(`limpeza de faixa de ${Math.round(m2).toLocaleString('pt-BR')} m² (${haTexto(m2 / 10000)} ha)`);
  return partes.length ? `Árvores: ${partes.join('; ')}.` : null;
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
