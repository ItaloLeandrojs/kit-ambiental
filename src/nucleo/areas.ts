import type { Pt } from './tipos.ts';
import { lerKml } from './kml.ts';
import { REGRAS_ORGAOS, type RegraOrgao } from '../regras/orgaos.ts';

export interface AreaProtegida {
  id: number;
  nome: string;
  pasta: string[];
  atributos: Record<string, string>;
  poligonos: Pt[][][];
  linhas: Pt[][];
  caixa: [number, number, number, number];
}
export interface BaseAreas { revisao: string; data: string; areas: AreaProtegida[]; municipios: AreaProtegida[] }
export interface Orgao { categoria: string; esfera: string; licencia: string; gestor: string; soIcmbio?: boolean }

const ERRO_NAO_E_BASE = 'Este arquivo não é o KMZ de Áreas Protegidas do Ceará.';
const ATRIBUTOS_DE_NOME = ['nome_zona', 'nome_proje', 'NM_COMUN3', 'terrai_nome', 'NOME_UC1', 'nome', 'Nome', 'Municipio'];

// sem acento e em maiúsculas, para comparar nomes de pasta
export const semAcento = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();

function revisaoEData(nomeArquivo: string): { revisao: string; data: string } {
  const m = /Rev\.?\s*(\d+)\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/i.exec(nomeArquivo);
  if (!m) return { revisao: '?', data: '?' };
  return { revisao: m[1], data: `${m[2].padStart(2, '0')}/${m[3].padStart(2, '0')}/${m[4]}` };
}

function nomeDaArea(nome: string, atributos: Record<string, string>, pasta: string[]): string {
  const direto = nome.trim();
  if (direto) return direto;
  for (const k of ATRIBUTOS_DE_NOME) {
    const v = (atributos[k] ?? '').trim();
    if (v) return v;
  }
  // pasta mais próxima com nome legível: pula ids internos de camada (ex.: zo_vii)
  for (let i = pasta.length - 1; i >= 0; i--) {
    const n = pasta[i].replace(/\.(kml|kmz)$/i, '').trim();
    if (n && !/^[a-z0-9_]+$/.test(n)) return n;
  }
  return '';
}

function caixaDe(poligonos: Pt[][][], linhas: Pt[][]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ve = (p: Pt) => {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  };
  for (const pol of poligonos) for (const anel of pol) anel.forEach(ve);
  for (const l of linhas) l.forEach(ve);
  return [x0, y0, x1, y1];
}

export function lerAreasProtegidas(bytes: Uint8Array, nomeArquivo: string): BaseAreas {
  const feicoes = lerKml(bytes);
  const areas: AreaProtegida[] = [];
  const municipios: AreaProtegida[] = [];
  for (const f of feicoes) {
    const poligonos: Pt[][][] = [];
    const linhas: Pt[][] = [];
    for (const g of f.geometrias) {
      if (g.t === 'poligono') poligonos.push(g.aneis);
      else if (g.t === 'linha') linhas.push(g.pts);
    }
    if (!poligonos.length && !linhas.length) continue; // ponto sozinho fica fora
    const ehMunicipio = f.pasta.some((p) => semAcento(p).startsWith('MUNICIPIOS'));
    const alvo = ehMunicipio ? municipios : areas;
    alvo.push({
      id: alvo.length,
      nome: nomeDaArea(f.nome, f.atributos, f.pasta),
      pasta: f.pasta,
      atributos: f.atributos,
      poligonos,
      linhas,
      caixa: caixaDe(poligonos, linhas),
    });
  }
  if (municipios.length < 100) throw new Error(ERRO_NAO_E_BASE);
  return { ...revisaoEData(nomeArquivo), areas, municipios };
}

function categoriaDe(regra: RegraOrgao, pastas: string[]): string {
  if (!regra.grupoUc) return regra.categoria;
  if (pastas.some((p) => p.includes('USO SUSTENTAVEL'))) return `${regra.categoria} (Uso Sustentável)`;
  if (pastas.some((p) => p.includes('PROTECAO INTEGRAL'))) return `${regra.categoria} (Proteção Integral)`;
  return regra.categoria;
}

export function orgaoDaArea(a: AreaProtegida): Orgao | null {
  const pastas = a.pasta.map(semAcento);
  const regra = REGRAS_ORGAOS.find((r) => pastas.some((p) => p.includes(r.trecho)));
  if (!regra) return null; // nunca chutar órgão
  const categoria = categoriaDe(regra, pastas);
  const nome = semAcento(a.nome);
  if (regra.soIcmbio?.some((t) => nome.includes(t))) {
    return { categoria, esfera: regra.esfera, licencia: 'ICMBio', gestor: 'ICMBio', soIcmbio: true };
  }
  return { categoria, esfera: regra.esfera, licencia: regra.licencia, gestor: regra.gestor };
}

export function ehAgua(a: AreaProtegida): 'acude' | 'lagoa' | 'rio' | null {
  const pastas = a.pasta.map(semAcento);
  if (!pastas.some((p) => p.includes('RECURSOS HIDRICOS - COGERH'))) return null;
  if (pastas.some((p) => p.includes('ACUDES MONITORADOS')) && a.poligonos.length) {
    return semAcento(a.nome).includes('LAGOA') ? 'lagoa' : 'acude';
  }
  if (pastas.some((p) => p.includes('REDE HIDROGRAFICA')) && a.linhas.length) return 'rio';
  return null;
}
