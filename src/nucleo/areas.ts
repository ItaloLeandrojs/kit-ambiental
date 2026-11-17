import type { Pt } from './tipos.ts';
import { lerKml } from './kml.ts';
import { G } from './geom.ts';
import { REGRAS_ORGAOS, type RegraOrgao } from '../regras/orgaos.ts';

export interface AreaProtegida {
  id: number;
  nome: string;
  pasta: string[];
  atributos: Record<string, string>;
  poligonos: Pt[][][];
  linhas: Pt[][];
  caixa: [number, number, number, number];
  // polígono inválido que o conserto da leitura não resolveu: o caso não cruza a rede com ele e avisa em vermelho
  defeito?: true;
  // polígono consertado na leitura com a área mudando mais que TOL_AVISO_CONSERTO: a maior fração |depois - antes| / antes.
  // O caso avisa em amarelo quando a rede nova cruza a área ou passa a menos de 100 m (o conserto pode ter tirado um pedaço)
  consertoGrande?: number;
  // índices em `poligonos` dos pedaços que vieram desses consertos: o caso mede a distância só até eles,
  // para que um polígono consertado não marque as outras partes da área (que podem estar longe)
  poligonosConsertados?: number[];
}
export interface BaseAreas { revisao: string; data: string; areas: AreaProtegida[]; municipios: AreaProtegida[] }
export interface Orgao { categoria: string; esfera: string; licencia: string; gestor: string; soIcmbio?: boolean; aConfirmar?: string }

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

// O KMZ real tem anel que não fecha e vértice digitado errado (X na casa dos milhões).
// Vértice fora do Ceará largo sai antes da caixa; anel aberto fecha repetindo o 1º ponto;
// anel com menos de 4 pontos sai; sem o anel externo o polígono sai.
const noCearaLargo = (p: Pt): boolean => p[0] >= 100_000 && p[0] <= 900_000 && p[1] >= 8_900_000 && p[1] <= 9_800_000;

function limparAnel(anel: Pt[]): Pt[] | null {
  const pts = anel.filter(noCearaLargo);
  if (pts.length === 0) return null;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  if (a[0] !== b[0] || a[1] !== b[1]) pts.push([a[0], a[1]]);
  return pts.length >= 4 ? pts : null;
}

function limparPoligono(aneis: Pt[][]): Pt[][] | null {
  const externo = aneis.length ? limparAnel(aneis[0]) : null;
  if (!externo) return null;
  const buracos = aneis.slice(1).map(limparAnel).filter((a): a is Pt[] => a !== null);
  return [externo, ...buracos];
}

// O KMZ real tem polígonos inválidos para o JSTS (anel que se toca, furo que encosta no anel): o cruzamento lança
// "non-noded intersection". Buffer zero refaz o polígono válido; só vale se a área quase não muda.
// muda quando o jeito de ler o KMZ muda (ex.: o conserto dos polígonos): a base guardada de antes é pedida de novo
export const VERSAO_LEITURA = 3; // 3: a área guarda o consertoGrande e os poligonosConsertados
export const TOL_CONSERTO = 0.05; // fração da área: acima disso o conserto mudaria a área demais
export const TOL_AVISO_CONSERTO = 0.005; // fração da área: acima disso o conserto vale um amarelo quando a obra cruza ou passa perto

/** Quanto o conserto mudou a área, em fração da área de antes (0 quando não consertou). */
export const mudancaDoConserto = (c: Conserto): number =>
  c.consertado && c.areaAntes !== 0 ? Math.abs(c.areaDepois - c.areaAntes) / Math.abs(c.areaAntes) : 0;

export interface Conserto { poligonos: Pt[][][]; consertado: boolean; defeito: boolean; areaAntes: number; areaDepois: number }

export function consertarPoligono(aneis: Pt[][]): Conserto {
  const g = G.poligono(aneis);
  const areaAntes = G.area(g);
  if (G.valido(g)) return { poligonos: [aneis], consertado: false, defeito: false, areaAntes, areaDepois: areaAntes };
  try {
    const b = G.engrossa(g, 0);
    const areaDepois = G.area(b);
    const partes = G.poligonos(b);
    const perto = Math.abs(areaDepois - areaAntes) <= TOL_CONSERTO * Math.abs(areaAntes);
    if (partes.length > 0 && G.valido(b) && perto) return { poligonos: partes, consertado: true, defeito: false, areaAntes, areaDepois };
    return { poligonos: [aneis], consertado: false, defeito: true, areaAntes, areaDepois };
  } catch {
    return { poligonos: [aneis], consertado: false, defeito: true, areaAntes, areaDepois: NaN };
  }
}

/** `consertar: false` só para os testes medirem o antes e o depois do conserto. */
export function lerAreasProtegidas(bytes: Uint8Array, nomeArquivo: string, opcoes: { consertar?: boolean } = {}): BaseAreas {
  const consertar = opcoes.consertar ?? true;
  const feicoes = lerKml(bytes);
  const areas: AreaProtegida[] = [];
  const municipios: AreaProtegida[] = [];
  for (const f of feicoes) {
    const poligonos: Pt[][][] = [];
    const linhas: Pt[][] = [];
    let defeito = false;
    let mudanca = 0; // maior mudança de área entre os polígonos consertados desta feição
    const consertados: number[] = []; // índices dos pedaços cujo conserto mudou a área além de TOL_AVISO_CONSERTO
    for (const g of f.geometrias) {
      if (g.t === 'poligono') {
        const aneis = limparPoligono(g.aneis);
        if (!aneis) continue;
        if (!consertar) { poligonos.push(aneis); continue; }
        const c = consertarPoligono(aneis);
        const m = mudancaDoConserto(c);
        if (m > TOL_AVISO_CONSERTO) c.poligonos.forEach((_, i) => consertados.push(poligonos.length + i));
        poligonos.push(...c.poligonos);
        if (c.defeito) defeito = true;
        mudanca = Math.max(mudanca, m);
      } else if (g.t === 'linha') {
        const pts = g.pts.filter(noCearaLargo);
        if (pts.length >= 2) linhas.push(pts);
      }
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
      ...(defeito ? { defeito: true as const } : {}),
      ...(mudanca > TOL_AVISO_CONSERTO ? { consertoGrande: mudanca, poligonosConsertados: consertados } : {}),
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
  return { categoria, esfera: regra.esfera, licencia: regra.licencia, gestor: regra.gestor, ...(regra.aConfirmar ? { aConfirmar: regra.aConfirmar } : {}) };
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
