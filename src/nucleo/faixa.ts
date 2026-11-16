// Faixa de domínio: malhas de rodovia (DNIT, SOP) e ferrovia, e o aviso quando a rede nova entra na faixa.
import type { Aviso, Pt, Rede } from './tipos.ts';
import { G } from './geom.ts';
import { lerCoordenadas, textoDoKml } from './kml.ts';
import { redeNova } from './rede.ts';
import { percorrerXml } from './xml.ts';
import { LARGURA_FAIXA } from '../regras/faixas.ts';
import { TEXTOS } from '../regras/textos.ts';

export type TipoMalha = 'DNIT' | 'SOP' | 'FERROVIA';
/** Linhas já em UTM 24S: é o que vai para o IndexedDB. */
export interface Malha { tipo: TipoMalha; nome: string; linhas: { nome: string; pts: Pt[] }[] }

export const ERRO_TIPO_MALHA = 'Não sei de que órgão é esta malha: o nome do arquivo precisa ter DNIT, SOP ou FERROVIA.';
const ERRO_KML = 'Este arquivo não é um KML nem um KMZ';

function tipoDoNome(nome: string): TipoMalha | null {
  const n = nome.toUpperCase();
  if (n.includes('DNIT')) return 'DNIT';
  if (n.includes('SOP')) return 'SOP';
  if (/FERROV|TRANSNORDESTINA/.test(n)) return 'FERROVIA';
  return null;
}

type Captura = { tipo: 'nome' | 'dado' | 'coord'; chave: string; buf: string };

/**
 * Lê uma malha KML/KMZ em fluxo. Na do DNIT só ficam as feições com sg_uf = CE, e as outras
 * nem têm as coordenadas convertidas (o arquivo traz o Brasil inteiro).
 */
export function lerMalha(bytes: Uint8Array, nomeArquivo: string, tipo?: TipoMalha): Malha {
  const t = tipo ?? tipoDoNome(nomeArquivo);
  if (!t) throw new Error(ERRO_TIPO_MALHA);
  const texto = textoDoKml(bytes);
  const linhas: Malha['linhas'] = [];
  const pilha: string[] = [];
  let viuKml = false;
  let atributos: Record<string, string> | null = null;
  let nomePlacemark = '';
  let brutas: string[] = [];
  let captura: Captura | null = null;
  const descartada = (): boolean =>
    t === 'DNIT' && atributos !== null && atributos.sg_uf !== undefined && atributos.sg_uf.trim().toUpperCase() !== 'CE';

  percorrerXml(texto, {
    abre(nome, attrs) {
      if (!viuKml) {
        if (nome !== 'kml') throw new Error(ERRO_KML);
        viuKml = true;
      }
      const pai = pilha[pilha.length - 1];
      pilha.push(nome);
      if (nome === 'Placemark') { atributos = {}; nomePlacemark = ''; brutas = []; }
      else if (!atributos) return;
      else if (nome === 'name' && pai === 'Placemark') captura = { tipo: 'nome', chave: '', buf: '' };
      else if (nome === 'SimpleData') captura = { tipo: 'dado', chave: attrs.name ?? '', buf: '' };
      else if (nome === 'coordinates' && pai === 'LineString' && !descartada()) captura = { tipo: 'coord', chave: '', buf: '' };
    },
    texto(x) {
      if (captura) captura.buf += x;
    },
    fecha(nome) {
      pilha.pop();
      if (nome === 'Placemark') {
        if (atributos && !descartada() && brutas.length) {
          const nomeLinha = t === 'DNIT' ? (atributos.vl_br ? `BR-${atributos.vl_br}` : nomePlacemark)
            : t === 'SOP' ? (atributos.RODOVIA || nomePlacemark) : nomePlacemark;
          for (const b of brutas) {
            const pts = lerCoordenadas(b);
            if (pts.length >= 2) linhas.push({ nome: nomeLinha || nomeArquivo, pts });
          }
        }
        atributos = null; brutas = []; captura = null;
        return;
      }
      const c = captura;
      if (!c) return;
      if (c.tipo === 'nome' && nome === 'name') { nomePlacemark = c.buf.trim(); captura = null; }
      else if (c.tipo === 'dado' && nome === 'SimpleData') { if (atributos && c.chave) atributos[c.chave] = c.buf.trim(); captura = null; }
      else if (c.tipo === 'coord' && nome === 'coordinates') { brutas.push(c.buf); captura = null; }
    },
  });
  if (!viuKml) throw new Error(ERRO_KML);
  return { tipo: t, nome: nomeArquivo, linhas };
}

const ORDEM: TipoMalha[] = ['DNIT', 'SOP', 'FERROVIA'];
const numero = (n: number): string => String(n).replace('.', ',');

/**
 * Um aviso amarelo por rodovia (ou ferrovia) cuja faixa a rede nova invade. Sem nenhuma malha
 * carregada, avisa que não deu para conferir: faixa de domínio nunca sai verde.
 */
export function avisosFaixa(rede: Rede, malhas: Malha[]): Aviso[] {
  if (malhas.length === 0) {
    return [{
      nivel: 'amarelo',
      codigo: 'FAIXA_SEM_MALHA',
      texto: TEXTOS.faixaSemMalha,
      comoCorrigir: 'No passo 1, abra as malhas do DNIT e da SOP (e da ferrovia, se houver). Só na primeira vez: elas ficam guardadas neste computador.',
    }];
  }
  const novos = redeNova(rede).filter((v) => v.pts.length >= 2);
  if (novos.length === 0) return [];
  let cx0 = Infinity, cy0 = Infinity, cx1 = -Infinity, cy1 = -Infinity;
  for (const v of novos) for (const [x, y] of v.pts) { cx0 = Math.min(cx0, x); cy0 = Math.min(cy0, y); cx1 = Math.max(cx1, x); cy1 = Math.max(cy1, y); }
  const avisos: Aviso[] = [];
  for (const malha of [...malhas].sort((a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo))) {
    const largura = LARGURA_FAIXA[malha.tipo];
    // só as linhas cuja caixa chega perto da rede (a malha do DNIT tem o Ceará inteiro)
    const porRodovia = new Map<string, Pt[][]>();
    for (const l of malha.linhas) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of l.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      if (x1 < cx0 - largura || x0 > cx1 + largura || y1 < cy0 - largura || y0 > cy1 + largura) continue;
      const lista = porRodovia.get(l.nome) ?? [];
      lista.push(l.pts);
      porRodovia.set(l.nome, lista);
    }
    for (const [rodovia, eixos] of porRodovia) {
      const faixa = G.engrossa(G.uniao(eixos.map((e) => G.linha(e))), largura);
      let metros = 0;
      let dentro = false;
      for (const v of novos) {
        if (G.distancia(G.linha(v.pts), faixa) > 0) continue;
        dentro = true;
        metros += G.dentro(v.pts, faixa).reduce((s, p) => s + G.comprimento(G.linha(p)), 0);
      }
      if (!dentro) continue;
      const orgao = malha.tipo === 'FERROVIA' ? 'ferrovia' : malha.tipo;
      avisos.push({
        nivel: 'amarelo',
        codigo: 'FAIXA_DOMINIO',
        texto: `${TEXTOS.faixaDominio}: ${rodovia}, ${Math.round(metros)} m de rede dentro da faixa de ${numero(largura)} m`,
        comoCorrigir: `Faça o processo no órgão da via (${orgao}): requerimento, projeto, ART, memorial${malha.tipo === 'DNIT' ? ' e cronograma' : ''}. A faixa pode ser mais estreita no trecho: o órgão confirma.`,
      });
    }
  }
  return avisos;
}
