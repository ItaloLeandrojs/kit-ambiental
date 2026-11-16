import { describe, expect, it } from 'vitest';
import type { AreaProtegida } from '../src/nucleo/areas.ts';
import { avisosArvores, camadasArvores, posicaoDaFoto, type Arvore } from '../src/nucleo/arvores.ts';
import { gravarKml } from '../src/nucleo/kml-saida.ts';
import { paraUtm } from '../src/nucleo/utm.ts';
import { bytesHeic, jpegComGps, jpegSemExif } from './jpeg-gps.ts';

// município inventado em volta de (lon -38,5; lat -3,72)
const [e0, n0] = paraUtm(-38.5, -3.72);
const anel: [number, number][] = [[e0 - 5000, n0 - 5000], [e0 + 5000, n0 - 5000], [e0 + 5000, n0 + 5000], [e0 - 5000, n0 + 5000], [e0 - 5000, n0 - 5000]];
const MUNICIPIO: AreaProtegida = { id: 0, nome: 'Município Inventado', pasta: ['Municípios'], atributos: {}, poligonos: [[anel]], linhas: [], caixa: [e0 - 5000, n0 - 5000, e0 + 5000, n0 + 5000] };

const arvore = (id: string, p: Partial<Arvore> = {}): Arvore => ({ id, foto: `${id}.jpg`, ponto: [e0, n0], especie: 'Mulungu', intervencao: 'poda', ...p });

describe('posicaoDaFoto', () => {
  it('GPS dentro do município vira ponto UTM', () => {
    const r = posicaoDaFoto(jpegComGps(), [MUNICIPIO]);
    expect(r.aviso).toBeNull();
    expect(r.ponto![0]).toBeCloseTo(e0, 3);
    expect(r.ponto![1]).toBeCloseTo(n0, 3);
  });

  it('GPS em São Paulo: sem ponto e pede o clique', () => {
    const sp = jpegComGps({ lat: [23, 33, 0], lon: [46, 38, 0] });
    expect(posicaoDaFoto(sp, [MUNICIPIO])).toEqual({
      ponto: null,
      aviso: 'A posição desta foto fica fora do Ceará. Clique no mapa onde está a árvore.',
    });
  });

  it('HEIC: sem ponto e pede o clique', () => {
    expect(posicaoDaFoto(bytesHeic(), [MUNICIPIO])).toEqual({
      ponto: null,
      aviso: 'Foto HEIC: o site não lê a posição. Clique no mapa onde está a árvore.',
    });
  });

  it('sem GPS (JPEG sem Exif, ou GPS 0,0): sem ponto e pede o clique', () => {
    const esperado = { ponto: null, aviso: 'Esta foto não tem a posição. Clique no mapa onde está a árvore.' };
    expect(posicaoDaFoto(jpegSemExif(), [MUNICIPIO])).toEqual(esperado);
    expect(posicaoDaFoto(jpegComGps({ lat: [0, 0, 0], lon: [0, 0, 0], latRef: 'N', lonRef: 'E' }), [MUNICIPIO])).toEqual(esperado);
    expect(posicaoDaFoto(new Uint8Array([1, 2, 3]), [MUNICIPIO])).toEqual(esperado);
  });

  it('nunca devolve ponto sem município que o contenha', () => {
    expect(posicaoDaFoto(jpegComGps(), []).ponto).toBeNull();
  });
});

describe('avisosArvores', () => {
  it('carnaúba, com ou sem acento e em qualquer caixa: amarelo', () => {
    for (const especie of ['Carnaúba', 'carnauba', 'CARNAÚBA do sertão']) {
      const a = avisosArvores([arvore('a', { especie })]);
      expect(a).toHaveLength(1);
      expect(a[0]).toMatchObject({ nivel: 'amarelo', texto: 'Carnaúba é espécie protegida (Decreto estadual 27.413/2004).' });
    }
  });

  it('21 árvores: amarelo; 20: nada', () => {
    const muitas = Array.from({ length: 21 }, (_, i) => arvore(`a${i}`));
    expect(avisosArvores(muitas)).toEqual([expect.objectContaining({
      nivel: 'amarelo', texto: 'Com mais de 20 árvores, desenhe a área de limpeza de faixa em vez de árvore por árvore.',
    })]);
    expect(avisosArvores(muitas.slice(0, 20))).toEqual([]);
  });

  it('árvore sem ponto: vermelho', () => {
    const a = avisosArvores([arvore('a'), arvore('b', { ponto: null })]);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ nivel: 'vermelho', codigo: 'ARVORE_SEM_PONTO' });
  });

  it('sem árvores: nenhum aviso', () => {
    expect(avisosArvores([])).toEqual([]);
  });
});

describe('camadasArvores', () => {
  const as = [
    arvore('a', { especie: 'Mulungu' }),
    arvore('b', { especie: 'Carnaúba', intervencao: 'supressao', ponto: [e0 + 10, n0] }),
    arvore('c', { ponto: null }),
  ];
  const limpeza: [number, number][][] = [[[0, 0], [10, 0], [10, 10]]];

  it('saem PODA, SUPRESSAO e LIMPEZA DE FAIXA com o nome da espécie', () => {
    const cs = camadasArvores('0000000001', as, limpeza);
    expect(cs.map((c) => [c.nome, c.tipo])).toEqual([
      ['0000000001 PODA', 'ponto'],
      ['0000000001 SUPRESSAO', 'ponto'],
      ['0000000001 LIMPEZA DE FAIXA', 'poligono'],
    ]);
    expect(cs[0].feicoes.map((f) => f.name)).toEqual(['Mulungu']);
    expect(cs[1].feicoes.map((f) => f.name)).toEqual(['Carnaúba']);
  });

  it('árvore sem ponto não vira feição; camada vazia não sai', () => {
    expect(camadasArvores('1', [arvore('c', { ponto: null })])).toEqual([]);
    expect(camadasArvores('1', as).map((c) => c.nome)).toEqual(['1 PODA', '1 SUPRESSAO']);
  });

  it('o polígono da limpeza sai fechado e vira KML', () => {
    const l = camadasArvores('1', [], limpeza)[0];
    const anelFechado = (l.feicoes[0].geometria[0] as { aneis: [number, number][][] }).aneis[0];
    expect(anelFechado[0]).toEqual(anelFechado[anelFechado.length - 1]);
    expect(anelFechado).toHaveLength(4);
    expect(gravarKml(l)).toContain('<Polygon>');
  });

  it('área com menos de 3 vértices não sai', () => {
    expect(camadasArvores('1', [], [[[0, 0], [1, 1]]])).toEqual([]);
  });
});
