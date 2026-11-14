// Leitor de DXF (texto) para a geometria do desenho: linhas, blocos (só o ponto), textos e cotas.
// Só a seção ENTITIES entra; entidades da folha de impressão (67=1) ficam fora.
// A decodificação (UTF-8 a partir do AC1021, senão windows-1252) e o modelo da cota
// (texto 3 do DIMSTYLE, ex. "(1)P3AN004<>") vêm do leitor do fechamento.
import type { Pt } from './tipos.ts';
import { linhasDoTexto } from './mtext.ts';

export interface LinhaDxf { camada: string; cor: number | null; pts: Pt[] }
export interface BlocoDxf { camada: string; nome: string; ponto: Pt }
export interface TextoDxf { camada: string; linhas: string[]; ponto: Pt; cor: number | null }
export interface CotaDxf { camada: string; estilo: string; modelo: string; p1: Pt; p2: Pt; medida: number }
export interface DxfGeo { versao: string; linhas: LinhaDxf[]; blocos: BlocoDxf[]; textos: TextoDxf[]; cotas: CotaDxf[] }

const ERRO_DWG = 'Este arquivo é DWG. No CAD, salve como DXF e abra de novo.';
const ERRO_NAO_DXF = 'Este arquivo não é um DXF';

const RE_VERSAO = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d{4})/;

/** DXF de 2007 em diante é UTF-8; os antigos usam a página de código do Windows. */
function decodificar(bytes: Uint8Array): { texto: string; versao: string } {
  const inicio = new TextDecoder('latin1').decode(bytes.subarray(0, 4000));
  const versao = RE_VERSAO.exec(inicio)?.[1] ?? '';
  const utf8 = versao >= 'AC1021';
  return { texto: new TextDecoder(utf8 ? 'utf-8' : 'windows-1252').decode(bytes), versao };
}

/** Código 62: 0 (por bloco), 256 (por camada) e negativos (camada apagada) valem "cor da camada". */
function corDe(valor: string): number | null {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 && n < 256 ? n : null;
}

interface Entidade {
  tipo: string
  camada: string
  cor: number | null
  papel: boolean
  x: number
  y: number
  x2: number
  y2: number
  nome: string
  bruto: string
  continuacao: string
  estilo: string
  medida: number
  x13: number
  y13: number
  x14: number
  y14: number
  fechada: boolean
  pts: Pt[]
}

const nova = (tipo: string): Entidade => ({
  tipo, camada: '', cor: null, papel: false, x: 0, y: 0, x2: 0, y2: 0, nome: '', bruto: '', continuacao: '',
  estilo: '', medida: 0, x13: 0, y13: 0, x14: 0, y14: 0, fechada: false, pts: [],
});

const TIPOS = ['LINE', 'LWPOLYLINE', 'POLYLINE', 'INSERT', 'TEXT', 'MTEXT', 'DIMENSION'];

export function lerDxfGeometria(bytes: Uint8Array): DxfGeo {
  if (/^AC1\d{3}/.test(new TextDecoder('latin1').decode(bytes.subarray(0, 6)))) throw new Error(ERRO_DWG);
  const { texto, versao } = decodificar(bytes);
  if (!texto.includes('SECTION')) throw new Error(ERRO_NAO_DXF);
  const L = texto.split(/\r?\n/);

  const linhas: LinhaDxf[] = [];
  const blocos: BlocoDxf[] = [];
  const textos: TextoDxf[] = [];
  const cotasCruas: Omit<CotaDxf, 'modelo'>[] = [];
  const estilos = new Map<string, string>();

  let secao = '';
  let ent: Entidade | null = null;
  let poli: Entidade | null = null // POLYLINE aberta, esperando VERTEX e SEQEND
  let vertice: Entidade | null = null
  let dimstyle: { nome: string; post: string } | null = null;

  const fecharPoli = () => {
    if (poli && !poli.papel && poli.pts.length >= 2) {
      const pts = poli.fechada ? [...poli.pts, poli.pts[0]] : poli.pts;
      linhas.push({ camada: poli.camada, cor: poli.cor, pts });
    }
    poli = null;
  };
  const fechar = () => {
    if (dimstyle?.nome) estilos.set(dimstyle.nome, dimstyle.post);
    dimstyle = null;
    if (vertice && poli) poli.pts.push([vertice.x, vertice.y]);
    vertice = null;
    const e = ent;
    ent = null;
    if (!e || e.papel) return;
    switch (e.tipo) {
      case 'LINE':
        linhas.push({ camada: e.camada, cor: e.cor, pts: [[e.x, e.y], [e.x2, e.y2]] });
        break;
      case 'LWPOLYLINE': {
        if (e.pts.length < 2) break;
        linhas.push({ camada: e.camada, cor: e.cor, pts: e.fechada ? [...e.pts, e.pts[0]] : e.pts });
        break;
      }
      case 'INSERT':
        blocos.push({ camada: e.camada, nome: e.nome, ponto: [e.x, e.y] });
        break;
      case 'TEXT':
      case 'MTEXT':
        textos.push({ camada: e.camada, linhas: linhasDoTexto(e.continuacao + e.bruto), ponto: [e.x, e.y], cor: e.cor });
        break;
      case 'DIMENSION':
        cotasCruas.push({ camada: e.camada, estilo: e.estilo, p1: [e.x13, e.y13], p2: [e.x14, e.y14], medida: e.medida });
        break;
    }
  };

  for (let i = 0; i + 1 < L.length; i += 2) {
    const codigo = L[i].trim();
    const valor = L[i + 1];
    if (codigo === '0') {
      fechar();
      const tipo = valor.trim();
      if (tipo === 'SECTION') {
        fecharPoli();
        secao = (L[i + 3] ?? '').trim();
        continue;
      }
      if (tipo === 'ENDSEC') {
        fecharPoli();
        secao = '';
        continue;
      }
      if (secao === 'TABLES' && tipo === 'DIMSTYLE') dimstyle = { nome: '', post: '' };
      else if (secao === 'ENTITIES') {
        if (tipo === 'VERTEX' && poli) vertice = nova('VERTEX');
        else if (tipo === 'SEQEND') fecharPoli();
        else if (tipo === 'POLYLINE') {
          fecharPoli();
          poli = nova('POLYLINE');
          ent = poli;
        } else if (TIPOS.includes(tipo)) {
          fecharPoli();
          ent = nova(tipo);
        }
      }
      continue;
    }
    if (dimstyle) {
      if (codigo === '2') dimstyle.nome = valor.trim();
      else if (codigo === '3') dimstyle.post = valor.trim();
      continue;
    }
    if (vertice) {
      if (codigo === '10') vertice.x = Number(valor);
      else if (codigo === '20') vertice.y = Number(valor);
      continue;
    }
    if (!ent) continue;
    // LWPOLYLINE: cada código 10 abre um vértice; o 20 seguinte completa o par
    if (ent.tipo === 'LWPOLYLINE') {
      if (codigo === '10') ent.pts.push([Number(valor), 0]);
      else if (codigo === '20' && ent.pts.length) ent.pts[ent.pts.length - 1][1] = Number(valor);
      else if (codigo === '70') ent.fechada = (Number(valor) & 1) === 1;
    } else if (codigo === '70' && ent.tipo === 'POLYLINE') ent.fechada = (Number(valor) & 1) === 1;
    switch (codigo) {
      case '1':
        if (ent.tipo === 'TEXT' || ent.tipo === 'MTEXT') ent.bruto += valor;
        break;
      case '2':
        if (ent.tipo === 'INSERT') ent.nome = valor.trim();
        break;
      case '3':
        if (ent.tipo === 'DIMENSION') ent.estilo = valor.trim();
        else if (ent.tipo === 'MTEXT') ent.continuacao += valor; // pedaços de MTEXT longo vêm antes do código 1
        break;
      case '8':
        ent.camada = valor.trim();
        break;
      case '62':
        ent.cor = corDe(valor);
        break;
      case '67':
        ent.papel = valor.trim() === '1';
        break;
      case '10':
        if (ent.tipo !== 'LWPOLYLINE') ent.x = Number(valor);
        break;
      case '20':
        if (ent.tipo !== 'LWPOLYLINE') ent.y = Number(valor);
        break;
      case '11':
        ent.x2 = Number(valor);
        break;
      case '21':
        ent.y2 = Number(valor);
        break;
      case '13':
        ent.x13 = Number(valor);
        break;
      case '23':
        ent.y13 = Number(valor);
        break;
      case '14':
        ent.x14 = Number(valor);
        break;
      case '24':
        ent.y14 = Number(valor);
        break;
      case '42':
        if (ent.tipo === 'DIMENSION') ent.medida = Number(valor);
        break;
    }
  }
  fechar();
  fecharPoli();

  const cotas = cotasCruas.map((c) => ({ ...c, modelo: estilos.get(c.estilo) ?? '' }));
  return { versao, linhas, blocos, textos, cotas };
}
