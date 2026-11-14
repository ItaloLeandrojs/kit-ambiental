import type { Feicao, Geometria, Pt } from './tipos.ts';
import { paraUtm } from './utm.ts';
import { abrirZip } from './zip.ts';
import { percorrerXml } from './xml.ts';

const ERRO_KML = 'Este arquivo não é um KML nem um KMZ';

function textoDoKml(bytes: Uint8Array): string {
  if (bytes.length > 1 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let arquivos;
    try {
      arquivos = abrirZip(bytes);
    } catch {
      throw new Error(ERRO_KML);
    }
    const kmls = arquivos.filter((a) => a.caminho.toLowerCase().endsWith('.kml'));
    const alvo = kmls.find((a) => a.caminho.toLowerCase() === 'doc.kml') ?? kmls[0];
    if (!alvo) throw new Error(ERRO_KML);
    bytes = alvo.bytes;
  }
  return new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
}

function lerCoordenadas(t: string): Pt[] {
  const pts: Pt[] = [];
  for (const trio of t.split(/\s+/)) {
    if (!trio) continue;
    const p = trio.split(',');
    const lon = Number(p[0]);
    const lat = Number(p[1]);
    if (p.length >= 2 && p[0] !== '' && p[1] !== '' && Number.isFinite(lon) && Number.isFinite(lat)) pts.push(paraUtm(lon, lat));
  }
  return pts;
}

type Captura = { tipo: 'nome' | 'dado' | 'valor' | 'coord'; chave: string; buf: string };

/** Lê KML ou KMZ em fluxo (sem DOM) e devolve uma feição por Placemark, já em UTM 24S. */
export function lerKml(bytes: Uint8Array): Feicao[] {
  const texto = textoDoKml(bytes);
  const feicoes: Feicao[] = [];
  const pasta: { nome: string }[] = []; // Folder/Document abertos, da raiz para dentro
  const pilha: string[] = [];
  let viuKml = false;
  let atual: Feicao | null = null;
  let captura: Captura | null = null;
  let chaveData = '';
  let poligono: { externo: Pt[] | null; buracos: Pt[][] } | null = null;
  let emBuraco = false;

  const ehPasta = (n: string | undefined): boolean => n === 'Folder' || n === 'Document';

  percorrerXml(texto, {
    abre(nome, attrs) {
      if (!viuKml) {
        if (nome !== 'kml') throw new Error(ERRO_KML);
        viuKml = true;
      }
      const pai = pilha[pilha.length - 1];
      pilha.push(nome);
      if (ehPasta(nome)) pasta.push({ nome: '' });
      else if (nome === 'Placemark') atual = { pasta: pasta.map((p) => p.nome).filter((x) => x), nome: '', atributos: {}, geometrias: [] };
      else if (nome === 'name' && (ehPasta(pai) || pai === 'Placemark')) captura = { tipo: 'nome', chave: pai, buf: '' };
      else if (!atual) return;
      else if (nome === 'SimpleData') captura = { tipo: 'dado', chave: attrs.name ?? '', buf: '' };
      else if (nome === 'Data') chaveData = attrs.name ?? '';
      else if (nome === 'value' && pai === 'Data') captura = { tipo: 'valor', chave: chaveData, buf: '' };
      else if (nome === 'Polygon') { poligono = { externo: null, buracos: [] }; emBuraco = false; }
      else if (nome === 'outerBoundaryIs') emBuraco = false;
      else if (nome === 'innerBoundaryIs') emBuraco = true;
      else if (nome === 'coordinates') captura = { tipo: 'coord', chave: '', buf: '' };
    },
    texto(t) {
      if (captura) captura.buf += t;
    },
    fecha(nome) {
      pilha.pop();
      if (ehPasta(nome)) { pasta.pop(); return; }
      if (nome === 'Placemark') {
        if (atual) feicoes.push(atual);
        atual = null;
        return;
      }
      if (nome === 'Polygon' && poligono && atual) {
        if (poligono.externo) atual.geometrias.push({ t: 'poligono', aneis: [poligono.externo, ...poligono.buracos] });
        poligono = null;
        return;
      }
      const c = captura;
      if (!c) return;
      const pai = pilha[pilha.length - 1];
      if (c.tipo === 'nome' && nome === 'name') {
        const limpo = c.buf.trim();
        if (c.chave === 'Placemark') { if (atual) atual.nome = limpo; }
        else if (pasta.length) pasta[pasta.length - 1].nome = limpo;
        captura = null;
      } else if ((c.tipo === 'dado' && nome === 'SimpleData') || (c.tipo === 'valor' && nome === 'value')) {
        if (atual && c.chave) atual.atributos[c.chave] = c.buf.trim();
        captura = null;
      } else if (c.tipo === 'coord' && nome === 'coordinates') {
        captura = null;
        if (!atual) return;
        const pts = lerCoordenadas(c.buf);
        let g: Geometria | null = null;
        if (pai === 'Point') { if (pts.length) g = { t: 'ponto', p: pts[0] }; }
        else if (pai === 'LineString') { if (pts.length >= 2) g = { t: 'linha', pts }; }
        else if (pai === 'LinearRing' && poligono) {
          if (emBuraco) poligono.buracos.push(pts);
          else poligono.externo = pts;
        }
        if (g) atual.geometrias.push(g);
      }
    },
  });
  if (!viuKml) throw new Error(ERRO_KML);
  return feicoes;
}
