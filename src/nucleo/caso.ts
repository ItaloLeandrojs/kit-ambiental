import type { Aviso, Pt, Poste, Rede, TipoRede, Vao } from './tipos.ts';
import { ehAgua, orgaoDaArea, semAcento, type AreaProtegida, type BaseAreas, type Orgao } from './areas.ts';
import { redeNova } from './rede.ts';
import { G, type Geo } from './geom.ts';
import { FAIXA, M2_POSTE_SEM_REDE, MIN_DENTRO, RAIO_PROXIMA } from '../regras/faixas.ts';
import { MUNICIPIOS_LITORAL } from '../regras/litoral.ts';
import { TEXTOS } from '../regras/textos.ts';

export interface Trecho { tipo: TipoRede; metros: number; pts: Pt[]; de: Poste | null; ate: Poste | null }
export interface AreaConfirmada { nome: string; tipo: 'APP'; poligonos: Pt[][][]; largura: number; aguaId?: number } // APP aceita pelo projetista (Tarefa 8); aguaId = id da água de onde a APP veio
export interface Intervencao {
  area: AreaProtegida | AreaConfirmada; orgao: Orgao | null;
  trechos: Trecho[]; metros: Record<TipoRede, number>; // metros sem arredondar
  postesSemRede: { poste: Poste; m2: number }[];
  hectares: number;
}
export interface Caso { municipio: string | null; litoral: boolean; intervencoes: Intervencao[]; proximas: { area: AreaProtegida; distancia: number }[]; avisos: Aviso[] }

// APP confirmada: quem licencia é o município (se licencia) ou a SEMACE; não há gestor (desenho §6.3)
const ORGAO_APP: Orgao = { categoria: 'APP', esfera: 'municipal', licencia: 'Município, se ele licencia; senão SEMACE', gestor: 'Não há' };
const RAIO_POSTE = 5; // metros: poste que marca a ponta de um trecho
const TOL_JUNTA = 0.01; // metros: pontas que se tocam

type Caixa = [number, number, number, number];
const ehConfirmada = (a: AreaProtegida | AreaConfirmada): a is AreaConfirmada => 'largura' in a;
const cruza = (a: Caixa, b: Caixa): boolean => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const alarga = (c: Caixa, d: number): Caixa => [c[0] - d, c[1] - d, c[2] + d, c[3] + d];
// com laço: Math.min(...) estoura a pilha em anéis grandes
function caixaDePts(ps: Pt[]): Caixa {
  const c: Caixa = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of ps) {
    if (p[0] < c[0]) c[0] = p[0];
    if (p[1] < c[1]) c[1] = p[1];
    if (p[0] > c[2]) c[2] = p[0];
    if (p[1] > c[3]) c[3] = p[1];
  }
  return c;
}
const comp = (p: Pt[]): number => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
const mesmoPonto = (a: Pt, b: Pt): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) <= TOL_JUNTA;
const aneisValidos = (an: Pt[][]): boolean => an.length > 0 && an[0].length >= 4;

interface Pedaco { tipo: TipoRede; pts: Pt[] }

// junta pedaços do mesmo tipo que se tocam nas pontas (vãos seguidos dentro da mesma entrada)
function juntar(pedacos: Pedaco[]): Pedaco[] {
  const lista = pedacos.map((p) => ({ tipo: p.tipo, pts: p.pts.slice() }));
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (let i = 0; i < lista.length && !mudou; i++) {
      for (let k = i + 1; k < lista.length && !mudou; k++) {
        if (lista[i].tipo !== lista[k].tipo) continue;
        const a = lista[i].pts;
        const b = lista[k].pts;
        let novo: Pt[] | null = null;
        if (mesmoPonto(a[a.length - 1], b[0])) novo = [...a, ...b.slice(1)];
        else if (mesmoPonto(a[a.length - 1], b[b.length - 1])) novo = [...a, ...b.slice(0, -1).reverse()];
        else if (mesmoPonto(a[0], b[b.length - 1])) novo = [...b, ...a.slice(1)];
        else if (mesmoPonto(a[0], b[0])) novo = [...b.slice(1).reverse(), ...a];
        if (novo) {
          lista[i].pts = novo;
          lista.splice(k, 1);
          mudou = true;
        }
      }
    }
  }
  return lista;
}

function posteDaPonta(postes: Poste[], p: Pt): Poste | null {
  let melhor: Poste | null = null;
  let dMelhor = RAIO_POSTE;
  for (const q of postes) {
    const d = Math.hypot(q.ponto[0] - p[0], q.ponto[1] - p[1]);
    if (d <= dMelhor) { melhor = q; dMelhor = d; }
  }
  return melhor;
}

// área candidata ao cruzamento, com os polígonos já unidos (as áreas se distinguem por identidade, nunca por nome)
interface Alvo { area: AreaProtegida | AreaConfirmada; geo: Geo | null; caixa: Caixa }

// a união dos polígonos de cada área do KMZ é feita uma vez só (a base não muda entre um clique e outro)
const unidas = new WeakMap<AreaProtegida, Geo | null>();
// o polígono do JSTS de cada anel da base (municípios e águas) também
const feitos = new WeakMap<Pt[][], Geo>();
function poligonoDe(an: Pt[][]): Geo {
  let g = feitos.get(an);
  if (!g) { g = G.poligono(an); feitos.set(an, g); }
  return g;
}

function alvoDe(a: AreaProtegida | AreaConfirmada): Alvo {
  const lista = a.poligonos.filter(aneisValidos);
  // une os polígonos da área: polígonos sobrepostos não contam o mesmo metro duas vezes
  const unir = (): Geo | null => (lista.length ? G.uniao(lista.map((an) => G.poligono(an))) : null);
  let geo: Geo | null;
  if (ehConfirmada(a)) geo = unir();
  else if (unidas.has(a)) geo = unidas.get(a)!;
  else { geo = unir(); unidas.set(a, geo); }
  const caixa: Caixa = ehConfirmada(a)
    ? caixaDePts(lista.map((an) => an[0]).flat())
    : a.caixa;
  return { area: a, geo, caixa };
}

// Água da COGERH (açude, lagoa, rio) NÃO vira intervenção por si: o hectare é a faixa da obra, nunca o açude inteiro,
// e a APP só entra depois de confirmada (vira AreaConfirmada). A água só dispara o aviso APP_POSSIVEL.
export function calcularCaso(rede: Rede, base: BaseAreas, confirmadas: AreaConfirmada[], m2PorPoste: Record<string, number> = {}): Caso {
  const novos: Vao[] = redeNova(rede);
  const postesNovos = rede.postes.filter((p) => p.novo);
  const semVao = novos.length === 0;
  // vão novo sem tipo fica fora da conta: vermelho, para a rede não sumir do kit em silêncio
  const nSemTipo = rede.vaos.filter((v) => v.situacao === 'novo' && v.tipo === null).length;
  const semTipo: Aviso[] = nSemTipo === 0 ? [] : [{
    nivel: 'vermelho', codigo: 'VAO_SEM_TIPO',
    texto: `${nSemTipo === 1 ? '1 vão novo sem tipo ficou' : `${nSemTipo} vãos novos sem tipo ficaram`} ${TEXTOS.vaosSemTipo}`,
    comoCorrigir: 'No passo 3, clique em cada vão tracejado em amarelo (no mapa ou na coluna Tipo) e escolha MT, BT ou conjugada; se não for rede nova, marque como fora.',
  }];
  if (semVao && postesNovos.length === 0) {
    // sem rede nova não se cruza nada: dizer "sem área protegida" aqui seria falso verde
    return {
      municipio: null, litoral: false, intervencoes: [], proximas: [],
      avisos: [{
        nivel: 'vermelho', codigo: 'SEM_REDE_NOVA', texto: TEXTOS.semRedeNova,
        comoCorrigir: 'No mapa, clique nos vãos que são rede nova e marque cada um como novo (1).',
      }, ...semTipo],
    };
  }

  const todosPts: Pt[] = [...novos.flatMap((v) => v.pts), ...postesNovos.map((p) => p.ponto)];
  const caixaRede = caixaDePts(todosPts);
  const caixaPerto = alarga(caixaRede, RAIO_PROXIMA);
  const geosRede: Geo[] = [...novos.map((v) => G.linha(v.pts)), ...postesNovos.map((p) => G.ponto(p.ponto))];
  const distRede = (g: Geo): number => Math.min(...geosRede.map((r) => G.distancia(r, g)));

  // área que não deu para cruzar (defeito na leitura ou erro do JSTS): aviso vermelho com o nome, nunca silêncio
  const naoConferidas = new Map<AreaProtegida | AreaConfirmada, string>(); // por identidade: duas áreas podem ter o mesmo nome
  const naoConferiu = (a: AreaProtegida | AreaConfirmada) => { naoConferidas.set(a, a.nome); };
  const alvos: Alvo[] = [];
  const perto = [
    ...base.areas.filter((a) => ehAgua(a) === null && cruza(a.caixa, caixaPerto)),
    ...confirmadas.filter((a) => cruza(caixaDePts(a.poligonos.filter(aneisValidos).map((an) => an[0]).flat()), caixaPerto)),
  ];
  for (const a of perto) {
    if (!ehConfirmada(a) && a.defeito) { naoConferiu(a); continue; }
    try { alvos.push(alvoDe(a)); } catch { naoConferiu(a); }
  }

  const intervencoes: Intervencao[] = [];
  const semCruzar: Alvo[] = [];
  for (const alvo of alvos) {
    try {
      const iv = cruzar(alvo);
      if (iv) intervencoes.push(iv);
      else if (!ehConfirmada(alvo.area)) semCruzar.push(alvo);
    } catch {
      naoConferiu(alvo.area);
    }
  }

  function cruzar(alvo: Alvo): Intervencao | null {
    const pedacos: Pedaco[] = [];
    if (alvo.geo && cruza(alvo.caixa, caixaRede)) {
      for (const v of novos) {
        if (!cruza(caixaDePts(v.pts), alvo.caixa)) continue; // vão longe da área: nem cruza
        for (const pts of G.dentro(v.pts, alvo.geo)) pedacos.push({ tipo: v.tipo as TipoRede, pts });
      }
    }
    // o corte de 0,5 m vale para o trecho já juntado: quem só encosta não é intervenção
    const trechos: Trecho[] = juntar(pedacos)
      .map((p) => ({
        tipo: p.tipo, metros: comp(p.pts), pts: p.pts,
        de: posteDaPonta(rede.postes, p.pts[0]), ate: posteDaPonta(rede.postes, p.pts[p.pts.length - 1]),
      }))
      .filter((t) => t.metros >= MIN_DENTRO);
    const postesSemRede = trechos.length
      ? []
      : postesNovos
          .filter((p) => alvo.geo !== null && G.contem(alvo.geo, G.ponto(p.ponto)))
          .map((p) => ({ poste: p, m2: m2PorPoste[p.id] ?? M2_POSTE_SEM_REDE }));
    if (trechos.length === 0 && postesSemRede.length === 0) return null;
    const metros: Record<TipoRede, number> = { MT: 0, BT: 0, CONJ: 0 };
    for (const t of trechos) metros[t.tipo] += t.metros;
    const m2 =
      (Object.keys(metros) as TipoRede[]).reduce((s, t) => s + Math.round(metros[t]) * FAIXA[t], 0) +
      postesSemRede.reduce((s, x) => s + x.m2, 0);
    return {
      area: alvo.area,
      orgao: ehConfirmada(alvo.area) ? ORGAO_APP : orgaoDaArea(alvo.area),
      trechos, metros, postesSemRede, hectares: m2 / 10000,
    };
  }

  const avisos: Aviso[] = [];
  if (semVao) {
    // só poste novo, sem vão novo: o projeto pode estar com a rede mal marcada; nunca dizer "sem área protegida"
    avisos.push({
      nivel: 'amarelo', codigo: 'SEM_REDE_NOVA', texto: TEXTOS.semRedeNova,
      comoCorrigir: 'Há poste novo mas nenhum vão marcado como novo; no mapa, marque os vãos que são rede nova (1), se houver.',
    });
  }
  avisos.push(...semTipo);
  const aConfirmar = postesNovos.filter((p) => p.aConfirmar).length;
  if (aConfirmar > 0) {
    avisos.push({
      nivel: 'amarelo', codigo: 'POSTE_A_CONFIRMAR', texto: TEXTOS.posteAConfirmar,
      comoCorrigir: `No mapa, confira ${aConfirmar === 1 ? 'o ponto sem nome' : `os ${aConfirmar} pontos sem nome`} do KML de rede: se não for poste novo, tire o ponto do KML e abra o arquivo de novo.`,
    });
  }
  for (const iv of intervencoes) {
    if (iv.orgao === null) {
      avisos.push({
        nivel: 'amarelo', codigo: 'SEM_ORGAO', texto: `${iv.area.nome}: ${TEXTOS.semOrgao}`,
        comoCorrigir: `Pergunte ao P&M quem licencia e quem é o gestor de "${iv.area.nome}" e escreva isso no memorial; o site não tem regra para essa pasta do KMZ.`,
      });
    }
  }

  const proximas: Caso['proximas'] = [];
  for (const alvo of semCruzar) {
    try {
      perto100(alvo);
    } catch {
      naoConferiu(alvo.area);
    }
  }
  function perto100(alvo: Alvo) {
    const a = alvo.area as AreaProtegida; // confirmada nunca entra em semCruzar
    const dLinhas = a.linhas.map((l) => distRede(G.linha(l)));
    if (alvo.geo === null && Math.min(Infinity, ...dLinhas) <= TOL_JUNTA) {
      // provisório: texto a confirmar com o Italo
      avisos.push({
        nivel: 'amarelo', codigo: 'CRUZA_LINHA', texto: `${a.nome}: ${TEXTOS.cruzaLinha}`,
        comoCorrigir: `Pergunte ao P&M como tratar "${a.nome}", que no KMZ é só uma linha e a rede nova cruza; o site não calcula metros nem hectares para linha.`,
      });
      return;
    }
    const d = Math.min(Infinity, ...(alvo.geo ? [distRede(alvo.geo)] : []), ...dLinhas);
    if (d <= RAIO_PROXIMA) {
      proximas.push({ area: a, distancia: d });
      avisos.push({
        nivel: 'amarelo', codigo: 'PROXIMA', texto: `${a.nome}: ${TEXTOS.proxima}`,
        comoCorrigir: `Escreva no memorial que a obra não intervém em "${a.nome}", que fica a cerca de ${Math.round(d)} m da rede nova.`,
      });
    }
  }

  // possível APP: água da COGERH a até 100 m da rede nova, sem APP confirmada encostada nela
  for (const a of base.areas) {
    if (ehAgua(a) === null || !cruza(a.caixa, caixaPerto)) continue;
    if (a.defeito) { naoConferiu(a); continue; }
    let longe: boolean;
    try {
      const geos = [...a.poligonos.filter(aneisValidos).map(poligonoDe), ...a.linhas.map((l) => G.linha(l))];
      longe = !geos.length || Math.min(...geos.map(distRede)) > RAIO_PROXIMA;
    } catch {
      naoConferiu(a);
      continue;
    }
    if (longe) continue;
    if (confirmadas.some((c) => c.aguaId === a.id)) continue; // só a APP confirmada para ESTA água tira o aviso
    avisos.push({
      nivel: 'amarelo', codigo: 'APP_POSSIVEL', texto: `Rede nova a menos de 100 m de ${a.nome}. ${TEXTOS.appCampo}`,
      comoCorrigir: `Confira em campo se a margem de "${a.nome}" é APP; se for, aceite a APP proposta no mapa para ela entrar nos metros e nos hectares.`,
    });
  }

  // município: o que contém o meio da rede nova (sem vão novo, o primeiro poste novo)
  let meio: Pt = postesNovos[0]?.ponto ?? todosPts[0];
  if (novos.length) {
    let falta = novos.reduce((s, v) => s + comp(v.pts), 0) / 2;
    for (const v of novos) {
      const c = comp(v.pts);
      if (falta <= c || v === novos[novos.length - 1]) {
        meio = c > 0 ? G.noMeio(v.pts, Math.min(1, falta / c)) : v.pts[0];
        break;
      }
      falta -= c;
    }
  }
  const pMeio = G.ponto(meio);
  const ponto: Caixa = [meio[0], meio[1], meio[0], meio[1]];
  const poligonosDe = (m: AreaProtegida): Geo[] => m.poligonos.filter(aneisValidos).map(poligonoDe);
  let mun = base.municipios.find((m) => cruza(m.caixa, ponto) && poligonosDe(m).some((g) => G.contem(g, pMeio)));
  let incerto = false;
  if (!mun) {
    // o meio não cai em nenhum município: usa o mais perto e avisa
    incerto = true;
    let dMin = Infinity;
    for (const m of base.municipios) {
      for (const g of poligonosDe(m)) {
        const d = G.distancia(pMeio, g);
        if (d < dMin) { dMin = d; mun = m; }
      }
    }
  }
  const municipio = mun?.nome ?? null;
  if (incerto) {
    avisos.push({
      nivel: 'amarelo', codigo: 'MUNICIPIO_INCERTO', texto: 'O meio da rede não cai dentro de nenhum município do KMZ; confira o município da obra.',
      comoCorrigir: `Abra a rede no Google Earth, veja em que município ela está${municipio ? ` (o mais perto no KMZ é ${municipio})` : ''} e use esse nome no memorial.`,
    });
  }
  // litoral: qualquer município a até 100 m da rede nova que esteja na lista (a obra pode ficar na divisa)
  const ehLitoral = (nome: string): boolean => MUNICIPIOS_LITORAL.some((m) => semAcento(m) === semAcento(nome));
  const litoralPerto = base.municipios.filter(
    (m) => ehLitoral(m.nome) && cruza(m.caixa, caixaPerto) && poligonosDe(m).some((g) => distRede(g) <= RAIO_PROXIMA),
  );
  const litoral = litoralPerto.length > 0;
  if (litoral) {
    avisos.push({
      nivel: 'amarelo', codigo: 'LITORAL', texto: TEXTOS.litoral,
      comoCorrigir: `Confira no Google Earth se há duna, restinga ou beira-mar a menos de 100 m da rede nova em ${litoralPerto.map((m) => m.nome).join(', ')}.`,
    });
  }

  // área cujo desenho o conserto da leitura mudou além de 0,5%: amarelo quando a rede nova cruza ou passa a até 100 m
  // do pedaço consertado (`<=`, igual a PROXIMA e APP_POSSIVEL)
  // (decisão do Italo, 16/11: o pedaço que o conserto tirou fica colado na área). Vale também para água: a APP sai desse desenho.
  // Se a distância lançar, avisa assim mesmo: aviso a mais, nunca a menos.
  for (const a of base.areas) {
    if (a.consertoGrande === undefined || a.defeito || naoConferidas.has(a) || !cruza(a.caixa, caixaPerto)) continue;
    // mede só até os pedaços consertados; sem a lista (área montada à mão), mede até a área inteira: aviso a mais
    const pedacos = a.poligonosConsertados
      ? a.poligonosConsertados.map((i) => a.poligonos[i]).filter((p) => p !== undefined)
      : a.poligonos;
    let pertoDaRede: boolean;
    try {
      const geos = [...pedacos.filter(aneisValidos).map(poligonoDe), ...(a.poligonosConsertados ? [] : a.linhas.map((l) => G.linha(l)))];
      pertoDaRede = geos.length > 0 && Math.min(...geos.map(distRede)) <= RAIO_PROXIMA;
    } catch {
      pertoDaRede = true;
    }
    if (!pertoDaRede) continue;
    const pct = (100 * a.consertoGrande).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    avisos.push({
      nivel: 'amarelo', codigo: 'AREA_CONSERTADA', texto: `${a.nome}: ${TEXTOS.areaConsertada}`,
      comoCorrigir: `Abra o KMZ e a rede no Google Earth e veja por onde a rede nova passa em "${a.nome}": o site consertou o desenho de uma parte dessa área e essa parte mudou ${pct}% de área. Se a rede passa num pedaço que ficou fora da conta, meça os metros à mão e avise o responsável pelo site.`,
    });
  }

  for (const nome of naoConferidas.values()) {
    avisos.push({
      nivel: 'vermelho', codigo: 'AREA_NAO_CONFERIDA', texto: `${nome}: ${TEXTOS.areaNaoConferida}`,
      comoCorrigir: `Abra o KMZ e a rede no Google Earth e veja se a rede nova cruza "${nome}" ou passa a menos de 100 m dela; se cruzar, meça os metros à mão e avise o responsável pelo site.`,
    });
  }

  if (!semVao && intervencoes.length === 0 && avisos.length === 0) {
    avisos.push({
      nivel: 'amarelo', codigo: 'SEM_AREA', texto: TEXTOS.semArea,
      comoCorrigir: 'Confirme em campo se há APP (rio, lagoa, açude ou duna) perto da obra; o KMZ não cobre isso.',
    });
  }
  return { municipio, litoral, intervencoes, proximas, avisos };
}
