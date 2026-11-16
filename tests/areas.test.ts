import { describe, expect, it } from 'vitest';
import { strToU8 } from 'fflate';
import { montarZip } from '../src/nucleo/zip.ts';
import { lerAreasProtegidas, orgaoDaArea, ehAgua, type AreaProtegida } from '../src/nucleo/areas.ts';

const quadrado = (lon: number, lat: number, l = 0.05) =>
  `${lon},${lat} ${lon + l},${lat} ${lon + l},${lat + l} ${lon},${lat + l} ${lon},${lat}`;
const poligono = (lon: number, lat: number) =>
  `<Polygon><outerBoundaryIs><LinearRing><coordinates>${quadrado(lon, lat)}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
const placemark = (nome: string, geo: string, dados: Record<string, string> = {}) =>
  `<Placemark><name>${nome}</name><ExtendedData>${Object.entries(dados)
    .map(([k, v]) => `<Data name="${k}"><value>${v}</value></Data>`)
    .join('')}</ExtendedData>${geo}</Placemark>`;
const pasta = (nome: string, filhos: string) => `<Folder><name>${nome}</name>${filhos}</Folder>`;

function kml(corpo: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Raiz</name>${corpo}</Document></kml>`;
}
function kmz(corpo: string): Uint8Array {
  return montarZip([{ caminho: 'doc.kml', bytes: strToU8(kml(corpo)) }]);
}

const municipios = (n = 100) =>
  pasta(
    'Municípios_CE',
    Array.from({ length: n }, (_, i) =>
      placemark(`Município ${i + 1}`, poligono(-40 + (i % 10) * 0.1, -5 + Math.floor(i / 10) * 0.1)),
    ).join(''),
  );

const NOME = 'Teste - Rev. 37 - 12.11.2024.kmz';

const corpoCompleto = () =>
  municipios() +
  pasta(
    'Unidade de Conservação_CE',
    pasta('Unidade de Conservação Estadual', pasta('Uso Sustentável', placemark('APA Inventada', poligono(-39.5, -4.5)))) +
      pasta(
        'Unidade de Conservação Federal',
        pasta('Proteção Integral', placemark('RESEX Batoque Inventada', poligono(-39.4, -4.5))) +
          pasta('Uso Sustentável', placemark('FLONA Qualquer', poligono(-39.3, -4.5))),
      ),
  ) +
  pasta('Macrozoneamento Ambiental - Prefeitura', pasta('Zona Teste.kml', placemark('', poligono(-39.2, -4.5), { nome_zona: 'ZPA Inventada' }))) +
  pasta('Corredor Ecológico Inventado', placemark('Corredor X', poligono(-39.1, -4.5))) +
  pasta(
    'Recursos Hídricos - COGERH_CE',
    pasta(
      'Açudes Monitorados',
      placemark('Açude Fulano', `<MultiGeometry><Point><coordinates>-39.0,-4.5</coordinates></Point>${poligono(-39, -4.5)}</MultiGeometry>`) +
        placemark('Lagoa Sicrana', poligono(-38.9, -4.5)),
    ) +
      pasta(
        'Eixos de Integração',
        pasta('Rede Hidrográfica', placemark('Rio Beltrano', '<LineString><coordinates>-38.8,-4.5 -38.7,-4.4</coordinates></LineString>')),
      ) +
      pasta('Rios', placemark('Ponto de rio', '<Point><coordinates>-38.6,-4.5</coordinates></Point>')),
  );

const achar = (areas: AreaProtegida[], nome: string) => areas.find((a) => a.nome === nome)!;

describe('lerAreasProtegidas', () => {
  const base = lerAreasProtegidas(kmz(corpoCompleto()), NOME);

  it('tira revisão e data do nome do arquivo', () => {
    expect(base.revisao).toBe('37');
    expect(base.data).toBe('12/11/2024');
    expect(lerAreasProtegidas(kmz(corpoCompleto()), 'areas.kmz').revisao).toBe('?');
  });

  it('separa municípios e deixa ponto sozinho fora', () => {
    expect(base.municipios).toHaveLength(100);
    expect(base.areas.map((a) => a.nome)).not.toContain('Ponto de rio');
    expect(base.areas).toHaveLength(8);
  });

  it('usa o nome_zona quando o nome está vazio e preenche caixa e id', () => {
    const a = achar(base.areas, 'ZPA Inventada');
    expect(a.id).toBeGreaterThanOrEqual(0);
    expect(a.caixa[2]).toBeGreaterThan(a.caixa[0]);
    expect(a.poligonos).toHaveLength(1);
    expect(base.areas.every((x) => x.nome !== '')).toBe(true);
  });

  it('cai na pasta mais próxima (sem .kml) quando nada dá nome', () => {
    const b = lerAreasProtegidas(kmz(municipios() + pasta('Zona Sem Nome.kml', placemark('', poligono(-39, -4)))), NOME);
    expect(b.areas[0].nome).toBe('Zona Sem Nome');
  });

  it('no fallback da pasta pula ids internos e sobe até o nome legível', () => {
    const corpo = pasta('Macrozoneamento', pasta('Zona de Orla', pasta('ZONA DE ORLA VII.kml', pasta('zo_vii', placemark('', poligono(-39, -4))))));
    const b = lerAreasProtegidas(kmz(municipios() + corpo), NOME);
    expect(b.areas[0].nome).toBe('ZONA DE ORLA VII');
  });

  it('município sem nome usa o atributo Municipio', () => {
    const b = lerAreasProtegidas(kmz(municipios(99) + pasta('Municípios_CE', placemark('', poligono(-38.5, -4), { Municipio: 'Cidade Inventada' }))), NOME);
    expect(b.municipios[99].nome).toBe('Cidade Inventada');
  });

  it('anel aberto fecha repetindo o 1º ponto', () => {
    const aberto = `<Polygon><outerBoundaryIs><LinearRing><coordinates>-39,-4 -38.95,-4 -38.95,-3.95 -39,-3.95</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
    const b = lerAreasProtegidas(kmz(municipios() + pasta('Açudes', placemark('Aberto', aberto))), NOME);
    const anel = achar(b.areas, 'Aberto').poligonos[0][0];
    expect(anel).toHaveLength(5);
    expect(anel[4]).toEqual(anel[0]);
  });

  it('vértice fora do Ceará sai antes da caixa; anel que fica curto sai', () => {
    // um vértice com longitude 10 cai a milhões de metros, como o erro de digitação do KMZ real
    const absurdo = `<Polygon><outerBoundaryIs><LinearRing><coordinates>-39,-4 -38.95,-4 10,-4 -38.95,-3.95 -39,-3.95 -39,-4</coordinates></LinearRing></outerBoundaryIs>` +
      `<innerBoundaryIs><LinearRing><coordinates>-38.99,-3.99 10,-3.99 -38.98,-3.98 -38.99,-3.99</coordinates></LinearRing></innerBoundaryIs></Polygon>`;
    const b = lerAreasProtegidas(kmz(municipios() + pasta('Açudes', placemark('Absurdo', absurdo))), NOME);
    const a = achar(b.areas, 'Absurdo');
    expect(a.poligonos).toHaveLength(1);
    expect(a.poligonos[0]).toHaveLength(1); // o buraco ficou com 3 pontos e saiu
    expect(a.poligonos[0][0]).toHaveLength(5);
    expect(a.caixa[2]).toBeLessThan(900_000);
    expect(a.caixa[2] - a.caixa[0]).toBeLessThan(10_000);
  });

  it('dá o erro exato em KML de rede, sem a pasta de municípios ou com poucos municípios', () => {
    const msg = 'Este arquivo não é o KMZ de Áreas Protegidas do Ceará.';
    const rede = strToU8(kml(placemark('Vão 1', '<LineString><coordinates>-38.5,-3.7 -38.51,-3.71</coordinates></LineString>')));
    expect(() => lerAreasProtegidas(rede, NOME)).toThrow(msg);
    expect(() => lerAreasProtegidas(kmz(pasta('Outra', placemark('A', poligono(-39, -4)))), NOME)).toThrow(msg);
    expect(() => lerAreasProtegidas(kmz(municipios(99)), NOME)).toThrow(msg);
  });
});

describe('orgaoDaArea', () => {
  const { areas } = lerAreasProtegidas(kmz(corpoCompleto()), NOME);

  it('UC estadual: SEMACE licencia, SEMA é o gestor, categoria leva o grupo', () => {
    expect(orgaoDaArea(achar(areas, 'APA Inventada'))).toEqual({
      categoria: 'UC (Uso Sustentável)',
      esfera: 'estadual',
      licencia: 'SEMACE',
      gestor: 'SEMA',
    });
  });

  it('UC federal com nome de exceção vira só ICMBio; as outras só têm gestor ICMBio', () => {
    expect(orgaoDaArea(achar(areas, 'RESEX Batoque Inventada'))).toEqual({
      categoria: 'UC (Proteção Integral)',
      esfera: 'federal',
      licencia: 'ICMBio',
      gestor: 'ICMBio',
      soIcmbio: true,
    });
    const o = orgaoDaArea(achar(areas, 'FLONA Qualquer'))!;
    expect(o.licencia).toBe('SEMACE');
    expect(o.gestor).toBe('ICMBio');
    expect(o.soIcmbio).toBeUndefined();
  });

  it('macrozona de Fortaleza: SEUMA', () => {
    const o = orgaoDaArea(achar(areas, 'ZPA Inventada'))!;
    expect(o.categoria).toBe('Macrozona de Fortaleza');
    expect([o.licencia, o.gestor]).toEqual(['SEUMA', 'SEUMA']);
  });

  it('Corredor e COGERH ficam sem órgão (nunca chutar)', () => {
    expect(orgaoDaArea(achar(areas, 'Corredor X'))).toBeNull();
    expect(orgaoDaArea(achar(areas, 'Açude Fulano'))).toBeNull();
  });

  it('reconhece as outras categorias pelo trecho da pasta, sem acento', () => {
    const mk = (p: string): AreaProtegida => ({ id: 0, nome: 'X', pasta: ['Raiz', p], atributos: {}, poligonos: [], linhas: [], caixa: [0, 0, 0, 0] });
    const esperado: Record<string, [string, string]> = {
      'Terras Indígenas_CE': ['Terra indígena', 'FUNAI'],
      'Áreas de Quilombolas_CE': ['Quilombola', 'INCRA'],
      'Assentamentos Rurais_CE': ['Assentamento', 'INCRA'],
      'Patrimônio Histórico e Artistico - IPHAN_CE': ['Patrimônio', 'IPHAN'],
      'Perímetros Irrigáveis DNOCS': ['Perímetro DNOCS', 'DNOCS'],
      RPPN: ['RPPN', 'O gestor particular'],
    };
    for (const [p, [cat, gestor]] of Object.entries(esperado)) {
      const o = orgaoDaArea(mk(p))!;
      expect([o.categoria, o.gestor]).toEqual([cat, gestor]);
      // perímetro DNOCS: licenciador municipal, como nas Planilhas Padrão (decisão do Italo)
      expect(o.licencia).toBe(gestor === 'DNOCS' ? 'Município' : 'SEMACE');
    }
  });
});

describe('ehAgua', () => {
  const { areas } = lerAreasProtegidas(kmz(corpoCompleto()), NOME);
  it('classifica só dentro da pasta COGERH', () => {
    expect(ehAgua(achar(areas, 'Açude Fulano'))).toBe('acude');
    expect(ehAgua(achar(areas, 'Lagoa Sicrana'))).toBe('lagoa');
    expect(ehAgua(achar(areas, 'Rio Beltrano'))).toBe('rio');
    expect(ehAgua(achar(areas, 'APA Inventada'))).toBeNull();
  });
});
