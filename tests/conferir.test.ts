import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { abrirZip, montarZip, type ArquivoZip } from '../src/nucleo/zip.ts';
import { gravarShp, type CamadaKit } from '../src/nucleo/shp.ts';
import { gravarKml } from '../src/nucleo/kml-saida.ts';
import { montarPacote } from '../src/nucleo/pacote.ts';
import { deUtm } from '../src/nucleo/utm.ts';
import { conferirZip, nomeNormalizado, type ItemConferencia } from '../src/nucleo/conferir.ts';
import { TEXTOS } from '../src/regras/textos.ts';

// tudo inventado, em metros, perto de (500000, 9500000)
const OS = '0000000001';
const X = 500000;
const Y = 9500000;
const enc = new TextEncoder();
const dec = new TextDecoder();

const rede: CamadaKit = {
  nome: `${OS} REDE BT`,
  tipo: 'linha',
  feicoes: [
    { name: 'v1', geometria: [{ t: 'linha', pts: [[X, Y], [X + 50, Y]] }] },
    { name: 'v2', geometria: [{ t: 'linha', pts: [[X + 50, Y], [X + 50, Y + 40]] }] },
  ],
};
const postes: CamadaKit = {
  nome: `${OS} POSTES`,
  tipo: 'ponto',
  feicoes: [{ name: '1', geometria: [{ t: 'ponto', p: [X, Y] }] }, { name: '2', geometria: [{ t: 'ponto', p: [X + 50, Y] }] }],
};
const appPoligono = (nome: string): CamadaKit => ({
  nome,
  tipo: 'poligono',
  feicoes: [{ name: 'APP', geometria: [{ t: 'poligono', aneis: [[[X + 10, Y - 20], [X + 90, Y - 20], [X + 90, Y + 20], [X + 10, Y + 20], [X + 10, Y - 20]]] }] }],
});
const NOME_APP = `${OS} APP DO AÇUDE`;
const camadas = (app: CamadaKit = appPoligono(NOME_APP)): CamadaKit[] => [rede, postes, app];

const DOCUMENTOS = ['MEMORIAL.pdf', 'ART.pdf', 'CVT.pdf', 'PLANTA.dwg', 'PLANTA.pdf', 'CAD.dwg', 'CAD.pdf', 'PLANILHA PADRAO.xlsx', 'REGULARIDADE.pdf'];
const vazios = (nomes: string[]): ArquivoZip[] => nomes.map((n) => ({ caminho: n, bytes: new Uint8Array(0) }));

const kitArquivos = (cs: CamadaKit[] = camadas(), docs: string[] = DOCUMENTOS): ArquivoZip[] => [...abrirZip(montarPacote(OS, cs)), ...vazios(docs)];
const kit = (cs?: CamadaKit[], docs?: string[]): Uint8Array => montarZip(kitArquivos(cs, docs));

const codigos = (r: ItemConferencia[], nivel: string): string[] => r.filter((i) => i.nivel === nivel).map((i) => i.codigo);
const vermelhos = (r: ItemConferencia[]): string[] => codigos(r, 'vermelho');
const trocar = (arqs: ArquivoZip[], caminho: string, bytes: Uint8Array): ArquivoZip[] => arqs.map((a) => (a.caminho === caminho ? { caminho, bytes } : a));

describe('nomeNormalizado', () => {
  it('tira acento, prefixo de OS, _ e -, palavras KML/SHP e parênteses', () => {
    expect(nomeNormalizado('0000000002_APP_DO_AÇUDE')).toBe('app do acude');
    expect(nomeNormalizado('0000000001 APP DO AÇUDE')).toBe('app do acude');
    expect(nomeNormalizado('APP-DO-AÇUDE (KML) shp')).toBe('app do acude');
    expect(nomeNormalizado('00000001  REDE   BT')).toBe('rede bt');
  });
});

describe('conferirZip: kit inventado bom', () => {
  const r = conferirZip(kit());
  it('não sai vermelho nem amarelo', () => {
    expect(vermelhos(r)).toEqual([]);
    expect(codigos(r, 'amarelo')).toEqual([]);
  });
  it('as regras todas aparecem em verde', () => {
    expect(new Set(codigos(r, 'verde'))).toEqual(new Set(['SHP_INCOMPLETO', 'PAR', 'UNIFICADO', 'PRJ', 'NO_LUGAR', 'TIPO', 'COMPRIMENTO', 'DOCUMENTOS']));
  });
  it('todo item tem texto próprio, sem travessão', () => {
    for (const i of r) {
      expect(i.titulo && i.porque && i.comoCorrigir).toBeTruthy();
      expect(`${i.titulo}${i.porque}${i.comoCorrigir}`).not.toMatch(/[—–]/);
    }
  });
});

describe('conferirZip: cópias estragadas, uma por teste', () => {
  const base = kitArquivos();

  it('SHP da rede deslocado 45 m: NO_LUGAR vermelho com o texto do órgão', () => {
    const movida: CamadaKit = { ...rede, feicoes: rede.feicoes.map((f) => ({ ...f, geometria: f.geometria.map((g) => (g.t === 'linha' ? { t: 'linha' as const, pts: g.pts.map(([x, y]): [number, number] => [x + 45, y]) } : g)) })) };
    const s = gravarShp(movida);
    const r = conferirZip(montarZip(trocar(base, `${OS} SHAPEFILE/${OS} REDE BT.shp`, s.shp)));
    const it = r.find((i) => i.codigo === 'NO_LUGAR' && i.nivel === 'vermelho');
    expect(it).toBeDefined();
    expect(it!.porque).toBe(TEXTOS.shpDeslocado);
    expect(r[0].nivel).toBe('vermelho');
  });

  it('deslocado 10 m: amarelo', () => {
    const movida: CamadaKit = { ...rede, feicoes: rede.feicoes.map((f) => ({ ...f, geometria: f.geometria.map((g) => (g.t === 'linha' ? { t: 'linha' as const, pts: g.pts.map(([x, y]): [number, number] => [x + 10, y + 10]) } : g)) })) };
    const r = conferirZip(montarZip(trocar(base, `${OS} SHAPEFILE/${OS} REDE BT.shp`, gravarShp(movida).shp)));
    expect(codigos(r, 'amarelo')).toContain('NO_LUGAR');
    expect(vermelhos(r)).not.toContain('NO_LUGAR');
  });

  it('.prj apagado: SHP_INCOMPLETO', () => {
    const r = conferirZip(montarZip(base.filter((a) => a.caminho !== `${OS} SHAPEFILE/${OS} POSTES.prj`)));
    expect(vermelhos(r)).toEqual(['SHP_INCOMPLETO']);
  });

  it('só o .cpg apagado: amarelo', () => {
    const r = conferirZip(montarZip(base.filter((a) => a.caminho !== `${OS} SHAPEFILE/${OS} POSTES.cpg`)));
    expect(vermelhos(r)).toEqual([]);
    expect(codigos(r, 'amarelo')).toEqual(['SHP_INCOMPLETO']);
  });

  it('KML da rede com um vão a mais: COMPRIMENTO', () => {
    const maior: CamadaKit = { ...rede, feicoes: [...rede.feicoes, { name: 'v3', geometria: [{ t: 'linha', pts: [[X + 50, Y + 40], [X + 50, Y + 90]] }] }] };
    const r = conferirZip(montarZip(trocar(base, `${OS} KML/${OS} REDE BT.kml`, enc.encode(gravarKml(maior)))));
    expect(vermelhos(r)).toContain('COMPRIMENTO');
  });

  it('APP gravada como linha: TIPO', () => {
    const linha: CamadaKit = { nome: NOME_APP, tipo: 'linha', feicoes: [{ name: 'APP', geometria: [{ t: 'linha', pts: [[X + 10, Y - 20], [X + 90, Y - 20], [X + 90, Y + 20]] }] }] };
    const r = conferirZip(kit(camadas(linha)));
    const it = r.find((i) => i.codigo === 'TIPO');
    expect(it?.nivel).toBe('vermelho');
    expect(it?.titulo).toContain('APP DO AÇUDE desenhada como linha');
  });

  it('sem o unificado: UNIFICADO nos dois formatos', () => {
    const r = conferirZip(montarZip(base.filter((a) => !/UNIFICADO/.test(a.caminho))));
    expect(vermelhos(r).filter((c) => c === 'UNIFICADO')).toHaveLength(2);
  });

  it('rede só no SHP ou só no KML: PAR vermelho', () => {
    const r1 = conferirZip(montarZip(base.filter((a) => a.caminho !== `${OS} KML/${OS} REDE BT.kml`)));
    expect(vermelhos(r1)).toEqual(['PAR']);
    const r2 = conferirZip(montarZip(base.filter((a) => !a.caminho.startsWith(`${OS} SHAPEFILE/${OS} REDE BT.`))));
    expect(vermelhos(r2)).toEqual(['PAR']);
  });

  it('outra camada só no SHP ou só no KML: PAR amarelo, confira se é sobra', () => {
    for (const r of [
      conferirZip(montarZip(base.filter((a) => a.caminho !== `${OS} KML/${OS} POSTES.kml`))),
      conferirZip(montarZip(base.filter((a) => !a.caminho.startsWith(`${OS} SHAPEFILE/${OS} POSTES.`)))),
    ]) {
      expect(vermelhos(r)).toEqual([]);
      const it = r.find((i) => i.codigo === 'PAR');
      expect(it?.nivel).toBe('amarelo');
      expect(it?.titulo).toContain('confira se é sobra');
      expect(it?.porque).not.toBe('');
    }
  });

  it('.shx solto, sem o .shp: SHP_INCOMPLETO amarelo, como sobra', () => {
    const solto = { caminho: `${OS} SHAPEFILE/${OS} RIACHO.shx`, bytes: base.find((a) => a.caminho === `${OS} SHAPEFILE/${OS} POSTES.shx`)!.bytes };
    const r = conferirZip(montarZip([...base, solto]));
    expect(vermelhos(r)).toEqual([]);
    expect(codigos(r, 'amarelo')).toEqual(['SHP_INCOMPLETO']);
    expect(r.find((i) => i.codigo === 'SHP_INCOMPLETO')?.titulo).toContain('sem o .shp');
  });

  it('com o .shp e sem o .shx: SHP_INCOMPLETO continua vermelho', () => {
    const r = conferirZip(montarZip(base.filter((a) => a.caminho !== `${OS} SHAPEFILE/${OS} POSTES.shx`)));
    expect(vermelhos(r)).toEqual(['SHP_INCOMPLETO']);
  });

  it('KML de rede com o shapefile sem .shp: a rede fica sem par, vermelho', () => {
    const r = conferirZip(montarZip(base.filter((a) => a.caminho !== `${OS} SHAPEFILE/${OS} REDE BT.shp`)));
    expect(vermelhos(r)).toEqual(['PAR']);
    expect(codigos(r, 'amarelo')).toContain('SHP_INCOMPLETO');
  });

  it('SHP sem KML com o desenho igual ao de outro SHP: amarelo, arquivo repetido', () => {
    const extra = ['shp', 'shx', 'dbf', 'prj', 'cpg'].map((e) => ({ caminho: `${OS} SHAPEFILE/${OS} OUTRO NOME.${e}`, bytes: base.find((a) => a.caminho === `${OS} SHAPEFILE/${OS} REDE BT.${e}`)!.bytes }));
    const r = conferirZip(montarZip([...base, ...extra]));
    expect(vermelhos(r)).toEqual([]);
    const it = r.find((i) => i.codigo === 'PAR');
    expect(it?.nivel).toBe('amarelo');
    expect(it?.titulo).toContain('repetido');
  });

  it('.prj de outro sistema: amarelo; SHP em graus (WGS84) não dá falso NO_LUGAR', () => {
    const [lon, lat] = deUtm([X, Y]);
    const [lon2, lat2] = deUtm([X + 20, Y]);
    const geo: CamadaKit = { nome: `${OS} POSTES`, tipo: 'ponto', feicoes: [{ name: '1', geometria: [{ t: 'ponto', p: [lon, lat] }] }, { name: '2', geometria: [{ t: 'ponto', p: [lon2, lat2] }] }] };
    const kmlPostes: CamadaKit = { nome: `${OS} POSTES`, tipo: 'ponto', feicoes: [{ name: '1', geometria: [{ t: 'ponto', p: [X, Y] }] }, { name: '2', geometria: [{ t: 'ponto', p: [X + 20, Y] }] }] };
    const wgs = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
    let arqs = trocar(base, `${OS} SHAPEFILE/${OS} POSTES.shp`, gravarShp(geo).shp);
    arqs = trocar(arqs, `${OS} SHAPEFILE/${OS} POSTES.prj`, enc.encode(wgs));
    arqs = trocar(arqs, `${OS} KML/${OS} POSTES.kml`, enc.encode(gravarKml(kmlPostes)));
    const r = conferirZip(montarZip(arqs));
    expect(vermelhos(r)).toEqual([]);
    expect(codigos(r, 'amarelo')).toEqual(['PRJ']);
  });

  it('documentos faltando: vermelho para memorial, ART, CVT, planta e projeto; amarelo para planilha e regularidade', () => {
    const r = conferirZip(kit(camadas(), []));
    expect(vermelhos(r).filter((c) => c === 'DOCUMENTOS')).toHaveLength(7);
    expect(codigos(r, 'amarelo').filter((c) => c === 'DOCUMENTOS')).toHaveLength(2);
    const so = conferirZip(kit(camadas(), ['pasta/PLANTA_OBRA.dwg', 'x/memorial-final.docx', 'ART_123.pdf', 'cvt.pdf', 'CAD 01.dwg', 'CAD 01.pdf']));
    expect(so.filter((i) => i.codigo === 'DOCUMENTOS').map((i) => i.titulo)).toEqual(['Falta: Planta em PDF', 'Falta: Planilha Padrão', 'Falta: Documento de regularidade do cliente']);
  });

  it('não é zip: ZIP vermelho com o texto exato', () => {
    const r = conferirZip(strToU8('isto não é um zip'));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ nivel: 'vermelho', codigo: 'ZIP', titulo: 'Este arquivo não é um zip' });
  });

  it('vermelhos primeiro, depois amarelos, depois verdes', () => {
    const r = conferirZip(kit(camadas(), []));
    const ordem = r.map((i) => ({ vermelho: 0, amarelo: 1, verde: 2 })[i.nivel]);
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
  });
});

describe('conferirZip: kit de verdade (nomes, pastas, zip dentro de zip)', () => {
  const base = kitArquivos();

  it('APP_DO_AÇUDE.prj e APP DO AÇUDE.kml, com prefixo de OS diferente, maiúsculas e minúsculas, fazem par', () => {
    const arqs = base.map((a) => {
      if (a.caminho.startsWith(`${OS} SHAPEFILE/`)) {
        const nome = a.caminho.slice(`${OS} SHAPEFILE/`.length).replace(OS, '0000000002').replace(/ /g, '_');
        const ext = nome.slice(nome.lastIndexOf('.'));
        return { caminho: `shapefile/${nome.slice(0, -ext.length).toLowerCase()}${ext.toUpperCase()}`, bytes: a.bytes };
      }
      return a;
    });
    expect(arqs.some((a) => a.caminho === 'shapefile/0000000002_app_do_açude.PRJ')).toBe(true);
    const r = conferirZip(montarZip(arqs));
    expect(vermelhos(r)).toEqual([]);
    expect(codigos(r, 'verde')).toContain('PAR');
  });

  it('pastas a mais por cima do kit', () => {
    const r = conferirZip(montarZip(base.map((a) => ({ caminho: `ENTREGA FINAL/${a.caminho}`, bytes: a.bytes }))));
    expect(vermelhos(r)).toEqual([]);
  });

  it('zip dentro de zip, com o nome cp850 de um lado e UTF-8 do outro', () => {
    const shpDe = base.filter((a) => a.caminho.startsWith(`${OS} SHAPEFILE/`));
    const interno: Record<string, Uint8Array> = {};
    for (const a of shpDe) interno[a.caminho.replace('Ç', '_')] = a.bytes;
    const z = zipSync(interno);
    const alvo = strToU8('A_UDE.');
    for (let i = 0; i + alvo.length <= z.length; i++) {
      if (alvo.every((b, k) => z[i + k] === b)) z[i + 1] = 0x80; // "_" vira "Ç" em cp850
    }
    const fora = base.filter((a) => !a.caminho.startsWith(`${OS} SHAPEFILE/`));
    const externo = montarZip([...fora, { caminho: 'SHAPEFILE.zip', bytes: z }]);
    const nomes = abrirZip(externo).map((a) => a.caminho);
    expect(nomes).toContain(`SHAPEFILE.zip/${OS} SHAPEFILE/${OS} APP DO AÇUDE.shp`);
    const r = conferirZip(externo);
    expect(vermelhos(r)).toEqual([]);
    expect(codigos(r, 'verde')).toContain('PAR');
  });
});

describe('conferirZip: TIPO só onde o nome manda', () => {
  const poli = (nome: string): CamadaKit => appPoligono(nome);
  it('área em polígono com UC ou REDE no nome e água em linha, como o site grava, não dão TIPO vermelho', () => {
    const agua: CamadaKit = { nome: `${OS} AÇUDE SECO`, tipo: 'linha', feicoes: [{ name: 'A', geometria: [{ t: 'linha', pts: [[X + 10, Y - 20], [X + 90, Y - 20]] }] }] };
    const cs = [rede, postes, poli(`${OS} UC SERRA AZUL`), poli(`${OS} RESERVA REDE UC`), poli(`${OS} PARQUE REDEMOINHO`), agua];
    const r = conferirZip(kit(cs));
    expect(r.filter((i) => i.codigo === 'TIPO' && i.nivel === 'vermelho')).toEqual([]);
    expect(vermelhos(r)).toEqual([]);
  });
  it('UC também aceita ponto', () => {
    const uc: CamadaKit = { nome: `${OS} UC`, tipo: 'ponto', feicoes: [{ name: 'UC', geometria: [{ t: 'ponto', p: [X + 5, Y + 5] }] }] };
    expect(vermelhos(conferirZip(kit([rede, postes, uc])))).toEqual([]);
  });
  it('APP em linha continua vermelha', () => {
    const linha: CamadaKit = { nome: `${OS} APP DO RIO`, tipo: 'linha', feicoes: [{ name: 'APP', geometria: [{ t: 'linha', pts: [[X, Y], [X + 9, Y]] }] }] };
    expect(vermelhos(conferirZip(kit([rede, postes, linha])))).toContain('TIPO');
  });
});

describe('conferirZip: pareamento pela geometria', () => {
  it('nomes sem par, mesma caixa a até 5 m: fazem par, sem vermelho PAR', () => {
    const nome = `${OS} SHAPEFILE/${OS} APP DO AÇUDE`;
    const antigo = camadas()[2];
    const mexida: CamadaKit = { ...antigo, feicoes: antigo.feicoes.map((f) => ({ ...f, geometria: f.geometria.map((g) => (g.t === 'poligono' ? { t: 'poligono' as const, aneis: g.aneis.map((a) => a.map(([x, y]): [number, number] => [x + 3, y])) } : g)) })) };
    const g = gravarShp(mexida);
    const novos: Record<string, Uint8Array> = { shp: g.shp, shx: g.shx, dbf: g.dbf, prj: enc.encode(g.prj), cpg: enc.encode(g.cpg) };
    const arqs = kitArquivos().map((a) => {
      const e = a.caminho.slice(a.caminho.lastIndexOf('.') + 1);
      return a.caminho.startsWith(nome + '.') ? { caminho: `${OS} SHAPEFILE/NOME QUALQUER ${OS}.${e}`, bytes: novos[e] } : a;
    });
    const r = conferirZip(montarZip(arqs));
    expect(vermelhos(r)).toEqual([]);
    expect(codigos(r, 'verde')).toContain('PAR');
  });
});

describe('conferirZip: metros contra o DXF', () => {
  type Par = [number, string | number];
  const texto = (pares: Par[]) => pares.map(([c, v]) => `${String(c).padStart(3)}\n${v}`).join('\n') + '\n';
  // um vão BT novo por LINE, com cota "(1)<>" em cima
  const vao = (x0: number, y0: number, x1: number, y1: number): Par[] => [
    [0, 'LINE'], [8, 'LINHABT'], [10, x0], [20, y0], [11, x1], [21, y1],
    [0, 'DIMENSION'], [8, 'COTAS'], [3, 'EST1'], [13, x0], [23, y0], [14, x1], [24, y1], [42, Math.hypot(x1 - x0, y1 - y0)],
  ];
  const dxf = (vaos: Par[]): Uint8Array =>
    enc.encode(texto([
      [0, 'SECTION'], [2, 'HEADER'], [9, '$ACADVER'], [1, 'AC1027'], [0, 'ENDSEC'],
      [0, 'SECTION'], [2, 'TABLES'], [0, 'DIMSTYLE'], [2, 'EST1'], [3, '(1)<>'], [0, 'ENDSEC'],
      [0, 'SECTION'], [2, 'ENTITIES'], ...vaos, [0, 'ENDSEC'], [0, 'EOF'],
    ]));
  const igual = [...vao(X, Y, X + 50, Y), ...vao(X + 50, Y, X + 50, Y + 40)]; // 90 m, como a rede do kit
  it('DXF com os mesmos 90 m: COMPRIMENTO verde, com o DXF na conta', () => {
    const r = conferirZip(kit(), dxf(igual));
    expect(vermelhos(r)).toEqual([]);
    expect(r.find((i) => i.codigo === 'COMPRIMENTO')?.porque).toContain('DXF');
  });
  it('DXF com um vão a mais: COMPRIMENTO vermelho', () => {
    const r = conferirZip(kit(), dxf([...igual, ...vao(X + 50, Y + 40, X + 50, Y + 90)]));
    const it = r.find((i) => i.codigo === 'COMPRIMENTO');
    expect(it?.nivel).toBe('vermelho');
    expect(it?.titulo).toContain('DXF');
  });
});
