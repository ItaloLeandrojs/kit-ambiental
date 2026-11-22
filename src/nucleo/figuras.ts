// Plano das figuras do memorial: número, título, legenda pronta e o que cada figura deve enquadrar.
// Figura 1: UC; Figura 2: rede projetada; da 3 em diante, uma por intervenção; por último, as árvores (desenho §6.4 e §6.5).
import type { Caso, Intervencao } from './caso.ts';
import type { Arvore } from './arvores.ts';
import type { EntradaMemorial } from './memorial.ts';
import type { Poste, Pt, Rede, TipoRede } from './tipos.ts';
import type { SituacaoUc } from './uc.ts';
import { redeNova } from './rede.ts';
import { lerImagem } from './docx.ts';
import { deUtm } from './utm.ts';
import { montarZip } from './zip.ts';
import { TEXTOS_FIGURAS as F, TEXTOS_IMAGENS as TI, TEXTOS_MEMORIAL as T } from '../regras/textos-memorial.ts';

// legenda: só o texto depois de "Figura N: " (o gravador do .docx põe o prefixo)
export interface Figura { numero: number; titulo: string; legenda: string; enquadrar: Pt[]; intervencao: number | null } // índice em caso.intervencoes

export type EntradaFiguras = Pick<EntradaMemorial, 'caso' | 'rede' | 'uc' | 'arvores' | 'limpeza'>;

const TIPOS: TipoRede[] = ['MT', 'BT', 'CONJ'];
export const ehApp = (iv: Intervencao): boolean => 'largura' in iv.area;
export const numeroDoPoste = (p: Poste | null): string => p?.numero?.trim() || T.numeroPosteVazio;

function pontosDaRede(rede: Rede): Pt[] {
  return [...redeNova(rede).flatMap((v) => v.pts), ...rede.postes.filter((p) => p.novo).map((p) => p.ponto)];
}

/** Título da figura da intervenção ("Interferência na <área>"). */
export const tituloIntervencao = (iv: Intervencao): string => F.interferencia.replace('{area}', iv.area.nome);

function legendaIntervencao(iv: Intervencao): string {
  const onde = iv.trechos.length
    ? iv.trechos.map((t) => F.entrePostes.replace('{x}', numeroDoPoste(t.de)).replace('{y}', numeroDoPoste(t.ate))).join(', ')
    : iv.postesSemRede.map((x) => F.noPoste.replace('{x}', numeroDoPoste(x.poste))).join(', ');
  const tipos = TIPOS.filter((t) => iv.trechos.some((x) => x.tipo === t));
  const marcas = tipos.length ? tipos.map((t) => F.linha[t]) : [F.pontoPoste];
  return [`${tituloIntervencao(iv)}${onde ? `, ${onde}` : ''}`, ...marcas, ehApp(iv) ? F.poligonoApp : F.poligonoArea].join('; ');
}

export function planoDeFiguras(e: EntradaFiguras): Figura[] {
  const daRede = pontosDaRede(e.rede);
  const figuras: Figura[] = [
    { numero: 1, titulo: F.tituloUc, legenda: F.legendaUc, enquadrar: e.uc ? [e.uc.ponto, ...daRede] : daRede, intervencao: null },
  ];
  const tiposRede = TIPOS.filter((t) => redeNova(e.rede).some((v) => v.tipo === t));
  const poligonos = [
    ...(e.caso.intervencoes.some(ehApp) ? [F.poligonoApp] : []),
    ...(e.caso.intervencoes.some((iv) => !ehApp(iv)) ? [F.poligonoArea] : []),
  ];
  figuras.push({
    numero: 2, titulo: F.tituloRede, legenda: [F.legendaRede, ...tiposRede.map((t) => F.linha[t]), ...poligonos].join('; '),
    enquadrar: daRede, intervencao: null,
  });
  e.caso.intervencoes.forEach((iv, i) => {
    const pts = [...iv.trechos.flatMap((t) => t.pts), ...iv.postesSemRede.map((x) => x.poste.ponto)];
    figuras.push({ numero: figuras.length + 1, titulo: tituloIntervencao(iv), legenda: legendaIntervencao(iv), enquadrar: pts.length ? pts : daRede, intervencao: i });
  });
  const limpezas = e.limpeza.filter((l) => l.length >= 3);
  if (e.arvores.length > 0 || limpezas.length > 0) {
    const pts = [...e.arvores.flatMap((a) => (a.ponto ? [a.ponto] : [])), ...limpezas.flat()];
    const marcas = [
      ...(e.arvores.some((a) => a.intervencao === 'poda') ? [F.pontoPoda] : []),
      ...(e.arvores.some((a) => a.intervencao === 'supressao') ? [F.pontoSupressao] : []),
      ...(limpezas.length ? [F.poligonoLimpeza] : []),
    ];
    figuras.push({
      numero: figuras.length + 1, titulo: F.tituloArvores, legenda: [F.legendaArvores, ...marcas].join('; '),
      enquadrar: pts.length ? pts : daRede, intervencao: null,
    });
  }
  return figuras;
}

// ---------- KMZ das figuras (desenho §6.5) ----------

/** Vista do Google Earth: centro em graus, alcance em metros, olhando para baixo (tilt 0) e para o norte (heading 0). */
export interface Enquadramento { lon: number; lat: number; alcance: number }

const FOLGA = 1.6; // alcance = 1,6 x a diagonal da caixa; conferência no Google Earth pendente
const ALCANCE_MIN_UC = 1500;
const ALCANCE_MIN = 200;

export function enquadrar(pts: Pt[], minimo: number): Enquadramento {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[0] > x1) x1 = p[0];
    if (p[1] > y1) y1 = p[1];
  }
  if (!pts.length) return { lon: 0, lat: 0, alcance: minimo };
  const [lon, lat] = deUtm([(x0 + x1) / 2, (y0 + y1) / 2]);
  return { lon, lat, alcance: Math.max(minimo, FOLGA * Math.hypot(x1 - x0, y1 - y0)) };
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const coords = (pts: Pt[]): string => pts.map((p) => { const [lon, lat] = deUtm(p); return `${lon.toFixed(8)},${lat.toFixed(8)},0`; }).join(' ');
const fechado = (a: Pt[]): Pt[] => (a.length && (a[0][0] !== a[a.length - 1][0] || a[0][1] !== a[a.length - 1][1]) ? [...a, a[0]] : a);

// KML usa aabbggrr
const COR_LINHA: Record<TipoRede, string> = { MT: 'ff0000ff', BT: 'ff00ff00', CONJ: 'ffff0000' };
const ICONE = 'http://maps.google.com/mapfiles/kml/';
const ESTILOS = [
  ...(['MT', 'BT', 'CONJ'] as TipoRede[]).map((t) => `<Style id="${t}"><LineStyle><color>${COR_LINHA[t]}</color><width>4</width></LineStyle></Style>`),
  '<Style id="area"><LineStyle><color>ff00ffff</color><width>3</width></LineStyle><PolyStyle><color>4d00ffff</color></PolyStyle></Style>',
  '<Style id="limpeza"><LineStyle><color>ff0080ff</color><width>3</width></LineStyle><PolyStyle><color>4d0080ff</color></PolyStyle></Style>',
  `<Style id="uc"><IconStyle><scale>1.2</scale><Icon><href>${ICONE}paddle/red-circle.png</href></Icon></IconStyle></Style>`,
  `<Style id="poste"><IconStyle><scale>0.6</scale><Icon><href>${ICONE}shapes/placemark_circle.png</href></Icon></IconStyle><LabelStyle><scale>0.9</scale></LabelStyle></Style>`,
  `<Style id="poda"><IconStyle><Icon><href>${ICONE}paddle/grn-circle.png</href></Icon></IconStyle></Style>`,
  `<Style id="supressao"><IconStyle><Icon><href>${ICONE}paddle/purple-square.png</href></Icon></IconStyle></Style>`,
].join('');

const marca = (nome: string, estilo: string, geo: string): string => `<Placemark><name>${esc(nome)}</name><styleUrl>#${estilo}</styleUrl>${geo}</Placemark>`;
const linha = (nome: string, tipo: TipoRede, pts: Pt[]): string => marca(nome, tipo, `<LineString><tessellate>1</tessellate><coordinates>${coords(pts)}</coordinates></LineString>`);
const ponto = (nome: string, estilo: string, p: Pt): string => marca(nome, estilo, `<Point><coordinates>${coords([p])}</coordinates></Point>`);
const poligono = (nome: string, estilo: string, aneis: Pt[][]): string => {
  const [ext, ...buracos] = aneis;
  const anel = (a: Pt[]): string => `<LinearRing><coordinates>${coords(fechado(a))}</coordinates></LinearRing>`;
  return marca(nome, estilo, `<Polygon><outerBoundaryIs>${anel(ext)}</outerBoundaryIs>${buracos.map((b) => `<innerBoundaryIs>${anel(b)}</innerBoundaryIs>`).join('')}</Polygon>`);
};
const poligonosDaArea = (iv: Intervencao): string[] =>
  iv.area.poligonos.filter((an) => an.length > 0 && an[0].length >= 4).map((an) => poligono(iv.area.nome, 'area', an));
const postes = (ps: Poste[]): string[] => ps.map((p) => ponto(`Poste Nº ${numeroDoPoste(p)}`, 'poste', p.ponto));

export interface EntradaKmz { caso: Caso; rede: Rede; uc: SituacaoUc | null; arvores: Arvore[]; limpeza?: Pt[][] }

function camadasDaFigura(f: Figura, e: EntradaKmz): string[] {
  const vaos = redeNova(e.rede).map((v) => linha(`${v.tipo} ${v.id}`, v.tipo as TipoRede, v.pts));
  if (f.intervencao !== null) {
    const iv = e.caso.intervencoes[f.intervencao];
    const ps = new Map<string, Poste>();
    iv.trechos.forEach((t) => [t.de, t.ate].forEach((p) => p && ps.set(p.id, p)));
    iv.postesSemRede.forEach((x) => ps.set(x.poste.id, x.poste));
    return [...poligonosDaArea(iv), ...iv.trechos.map((t) => linha(`${t.tipo} ${numeroDoPoste(t.de)}-${numeroDoPoste(t.ate)}`, t.tipo, t.pts)), ...postes([...ps.values()])];
  }
  if (f.numero === 1) return [...(e.uc ? [ponto('UC', 'uc', e.uc.ponto)] : []), ...vaos];
  if (f.numero === 2) return [...e.caso.intervencoes.flatMap(poligonosDaArea), ...vaos, ...postes(e.rede.postes.filter((p) => p.novo))];
  return [
    ...e.arvores.flatMap((a) => (a.ponto ? [ponto(`${a.especie || a.foto} (${a.intervencao === 'poda' ? 'poda' : 'supressão'})`, a.intervencao, a.ponto)] : [])),
    ...(e.limpeza ?? []).filter((l) => l.length >= 3).map((l) => poligono('Limpeza de faixa', 'limpeza', [l])),
  ];
}

/** `<OS> FIGURAS.kmz`: uma pasta por figura, com a vista pronta (LookAt) e só as camadas dela. Só a primeira pasta vem ligada. */
export function gravarKmzFiguras(os: string, figuras: Figura[], e: EntradaKmz): { nome: string; bytes: Uint8Array } {
  const pastas = figuras.map((f, i) => {
    const v = enquadrar(f.enquadrar, f.numero === 1 ? ALCANCE_MIN_UC : ALCANCE_MIN);
    const vista = `<LookAt><longitude>${v.lon.toFixed(8)}</longitude><latitude>${v.lat.toFixed(8)}</latitude><altitude>0</altitude><heading>0</heading><tilt>0</tilt><range>${Math.round(v.alcance)}</range><altitudeMode>relativeToGround</altitudeMode></LookAt>`;
    return `<Folder><name>${esc(`Figura ${f.numero} - ${f.titulo}`)}</name><open>0</open>${i > 0 ? '<visibility>0</visibility>' : ''}${vista}${camadasDaFigura(f, e).join('\n')}</Folder>`;
  });
  const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(`${os} FIGURAS`)}</name>${ESTILOS}\n${pastas.join('\n')}</Document></kml>\n`;
  return { nome: `${os} FIGURAS.kmz`, bytes: montarZip([{ caminho: 'doc.kml', bytes: new TextEncoder().encode(kml) }]) };
}

// ---------- imagens soltas nas figuras (Tarefa 14) ----------

export interface ImagemSolta { nome: string; bytes: Uint8Array }
/** Uma por imagem solta, na ordem em que vieram. Com erro, `figura` é 0 (nenhuma) e `erro` diz o motivo; sem erro, `erro` é null. */
export interface Associacao { figura: number; arquivo: string | null; erro: string | null }

// número da figura no nome sem extensão: "Figura 3", "fig1", "img_2", "2"
const NUMERO_NO_NOME = /(?:^|[^\d])(?:fig(?:ura)?\s*[_.-]?\s*)?(\d{1,2})(?!\d)/gi;
/**
 * Com prefixo fig/figura, esse número ganha ("Obra 12 figura 3" = 3). Sem prefixo, só vale se o nome tem um único
 * número candidato; com mais de um (datas, horas) o nome é tratado como sem número e vai pela ordem natural.
 */
// a tela usa para dizer se a imagem foi achada "pelo nome" ou "pela ordem"
export const numeroDoNome = (nome: string): number | null => {
  const achados = [...nome.replace(/\.[^.]*$/, '').matchAll(NUMERO_NO_NOME)];
  const comPrefixo = achados.find((m) => /fig/i.test(m[0]));
  if (comPrefixo) return Number(comPrefixo[1]);
  return achados.length === 1 ? Number(achados[0][1]) : null;
};
const naturalDoNome = (a: string, b: string): number => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });

/**
 * O número no nome manda; as imagens sem número ocupam, pela ordem natural do nome, as figuras que sobraram.
 * Empate de número: a primeira pela ordem natural do nome fica com a figura.
 */
export function associarImagens(soltas: ImagemSolta[], figuras: Figura[]): Associacao[] {
  const resultado = new Map<ImagemSolta, Associacao>();
  const existentes = new Set(figuras.map((f) => f.numero));
  const ocupadas = new Set<number>();
  const semNumero: ImagemSolta[] = [];
  const falha = (s: ImagemSolta, erro: string): void => { resultado.set(s, { figura: 0, arquivo: s.nome, erro }); };
  const ordenadas = [...soltas].sort((a, b) => naturalDoNome(a.nome, b.nome));
  for (const s of ordenadas) {
    if (!lerImagem(s.bytes)) { falha(s, TI.formatoInvalido); continue; }
    const n = numeroDoNome(s.nome);
    if (n === null) { semNumero.push(s); continue; }
    if (!existentes.has(n)) { falha(s, TI.figuraInexistente.replace('{n}', String(n))); continue; }
    if (ocupadas.has(n)) { falha(s, TI.numeroRepetido.replace('{n}', String(n))); continue; }
    ocupadas.add(n);
    resultado.set(s, { figura: n, arquivo: s.nome, erro: null });
  }
  const livres = figuras.map((f) => f.numero).filter((n) => !ocupadas.has(n)).sort((a, b) => a - b);
  for (const s of semNumero) {
    const n = livres.shift();
    if (n === undefined) falha(s, TI.semFiguraLivre);
    else resultado.set(s, { figura: n, arquivo: s.nome, erro: null });
  }
  return soltas.map((s) => resultado.get(s)!);
}
