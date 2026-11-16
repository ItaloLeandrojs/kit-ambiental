// Faixa de domínio: malhas de rodovia (DNIT, SOP) e ferrovia, e o aviso quando a rede nova entra na faixa.
import type { Aviso, Pt, Rede } from './tipos.ts';
import { G } from './geom.ts';
import { ERRO_KML, lerCoordenadas, textoDoKml } from './kml.ts';
import { redeNova } from './rede.ts';
import { percorrerXml } from './xml.ts';
import { LARGURA_FAIXA, MIN_DENTRO } from '../regras/faixas.ts';
import { TEXTOS } from '../regras/textos.ts';

export type TipoMalha = 'DNIT' | 'SOP' | 'FERROVIA';
/** Linhas já em UTM 24S: é o que vai para o IndexedDB. */
export interface Malha { tipo: TipoMalha; nome: string; linhas: { nome: string; pts: Pt[] }[] }

export const ERRO_TIPO_MALHA = 'Não sei de que órgão é esta malha: o nome do arquivo precisa ter DNIT, SOP ou FERROVIA.';
export const ERRO_MALHA_VAZIA = 'Não achei nenhuma linha de rodovia ou ferrovia nesta malha. Confira se é o arquivo certo.';
export const ERRO_DNIT_SEM_UF = 'Esta malha do DNIT não tem o campo sg_uf (UF), então não dá para separar o Ceará. Confira se é o arquivo certo.';

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
  let viuUf = false;
  // DNIT: só o Ceará; feição sem sg_uf também fica de fora (não converte o Brasil inteiro)
  const descartada = (): boolean => t === 'DNIT' && atributos !== null && (atributos.sg_uf ?? '').trim().toUpperCase() !== 'CE';

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
      else if (c.tipo === 'dado' && nome === 'SimpleData') { if (atributos && c.chave) { atributos[c.chave] = c.buf.trim(); if (c.chave === 'sg_uf') viuUf = true; } captura = null; }
      else if (c.tipo === 'coord' && nome === 'coordinates') { brutas.push(c.buf); captura = null; }
    },
  });
  if (!viuKml) throw new Error(ERRO_KML);
  if (t === 'DNIT' && !viuUf) throw new Error(ERRO_DNIT_SEM_UF);
  if (linhas.length === 0) throw new Error(ERRO_MALHA_VAZIA);
  return { tipo: t, nome: nomeArquivo, linhas };
}

const ORDEM: TipoMalha[] = ['DNIT', 'SOP', 'FERROVIA'];
const numero = (n: number): string => String(n).replace('.', ',');

/**
 * Um aviso amarelo por rodovia (ou ferrovia) cuja faixa a rede nova invade. Sem nenhuma malha
 * carregada, avisa que não deu para conferir: faixa de domínio nunca sai verde.
 */
export function avisosFaixa(rede: Rede, malhas: Malha[]): Aviso[] {
  const novos = redeNova(rede).filter((v) => v.pts.length >= 2);
  if (novos.length === 0) return [];
  const avisos: Aviso[] = [];
  malhas = malhas.filter((m) => m.linhas.length > 0);
  // DNIT e SOP são obrigatórias para conferir; a ferrovia é opcional
  const faltam = (['DNIT', 'SOP'] as const).filter((t) => !malhas.some((m) => m.tipo === t));
  if (faltam.length > 0) {
    avisos.push({
      nivel: 'amarelo',
      codigo: 'FAIXA_SEM_MALHA',
      texto: faltam.length === 2 ? TEXTOS.faixaSemMalha : faltam[0] === 'DNIT' ? TEXTOS.faixaSemMalhaDnit : TEXTOS.faixaSemMalhaSop,
      comoCorrigir: `No passo 1, abra ${faltam.length === 2 ? 'as malhas do DNIT e da SOP' : `a malha ${faltam[0]}`}. Só na primeira vez: ficam guardadas neste computador.`,
    });
  }
  // caixa de cada vão novo: só os trechos de rodovia perto de algum vão entram na conta
  // (a rede pode ser comprida e a rodovia do DNIT tem milhares de pontos: o buffer da rodovia inteira é lento)
  const caixas = novos.map((v) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of v.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0, y0, x1, y1];
  });
  for (const malha of [...malhas].sort((a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo))) {
    const largura = LARGURA_FAIXA[malha.tipo];
    const cruza = (x0: number, y0: number, x1: number, y1: number): boolean =>
      caixas.some((c) => x1 + largura >= c[0] && x0 - largura <= c[2] && y1 + largura >= c[1] && y0 - largura <= c[3]);
    const perto = (a: Pt, b: Pt): boolean => cruza(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]));
    const porRodovia = new Map<string, Pt[][]>();
    for (const l of malha.linhas) {
      // linha inteira longe de todos os vãos: nem olha os segmentos
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of l.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      if (!cruza(x0, y0, x1, y1)) continue;
      let corrida: Pt[] = [];
      const fecha = () => {
        if (corrida.length >= 2) {
          const lista = porRodovia.get(l.nome) ?? [];
          lista.push(corrida);
          porRodovia.set(l.nome, lista);
        }
        corrida = [];
      };
      for (let i = 0; i + 1 < l.pts.length; i++) {
        if (perto(l.pts[i], l.pts[i + 1])) { if (corrida.length === 0) corrida.push(l.pts[i]); corrida.push(l.pts[i + 1]); }
        else fecha();
      }
      fecha();
    }
    for (const [rodovia, eixos] of porRodovia) {
      let metros = 0;
      let dentro = false;
      novos.forEach((v, k) => {
        // a faixa só dos trechos da rodovia perto deste vão: o buffer da rodovia inteira é lento
        const c = caixas[k];
        const locais: Pt[][] = [];
        for (const e of eixos) {
          let corrida: Pt[] = [];
          for (let i = 0; i + 1 < e.length; i++) {
            const a = e[i], b = e[i + 1];
            const longe = Math.max(a[0], b[0]) + largura < c[0] || Math.min(a[0], b[0]) - largura > c[2]
              || Math.max(a[1], b[1]) + largura < c[1] || Math.min(a[1], b[1]) - largura > c[3];
            if (!longe) { if (corrida.length === 0) corrida.push(a); corrida.push(b); }
            else { if (corrida.length >= 2) locais.push(corrida); corrida = []; }
          }
          if (corrida.length >= 2) locais.push(corrida);
        }
        if (locais.length === 0) return;
        const faixa = G.engrossa(G.uniao(locais.map((e) => G.linha(e))), largura);
        if (G.distancia(G.linha(v.pts), faixa) > 0) return;
        dentro = true;
        metros += G.dentro(v.pts, faixa).reduce((s, p) => s + G.comprimento(G.linha(p)), 0);
      });
      if (!dentro || metros < MIN_DENTRO) continue;
      const orgao = malha.tipo === 'FERROVIA' ? 'ferrovia' : malha.tipo;
      avisos.push({
        nivel: 'amarelo',
        codigo: 'FAIXA_DOMINIO',
        texto: `${malha.tipo === 'FERROVIA' ? TEXTOS.faixaFerrovia : TEXTOS.faixaDominio}: ${rodovia}, ${Math.round(metros)} m de rede dentro da faixa de ${numero(largura)} m`,
        comoCorrigir: `Faça o processo no órgão da via (${orgao}): requerimento, projeto, ART, memorial${malha.tipo === 'DNIT' ? ' e cronograma' : ''}. A faixa pode ser mais estreita no trecho: o órgão confirma.`,
      });
    }
  }
  return avisos;
}
