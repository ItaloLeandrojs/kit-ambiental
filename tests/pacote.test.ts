import { describe, expect, it } from 'vitest';
import { abrirZip } from '../src/nucleo/zip.ts';
import { gravarShp, lerShp, PRJ_SIRGAS_24S, type CamadaKit } from '../src/nucleo/shp.ts';
import { gravarKml } from '../src/nucleo/kml-saida.ts';
import { montarPacote } from '../src/nucleo/pacote.ts';
import { unificar } from '../src/nucleo/camadas.ts';

const OS = '0000000001';
const l = (nome: string): CamadaKit => ({ nome, tipo: 'linha', feicoes: [{ name: 'a', geometria: [{ t: 'linha', pts: [[500000, 9500000], [500010, 9500000]] }] }] });
const p: CamadaKit = { nome: `${OS} POSTES`, tipo: 'ponto', feicoes: [{ name: '1', geometria: [{ t: 'ponto', p: [500000, 9500000] }] }] };
const pol: CamadaKit = { nome: `${OS} UC / Teste`, tipo: 'poligono', feicoes: [{ name: 'UC', geometria: [{ t: 'poligono', aneis: [[[0, 0], [10, 0], [10, 10], [0, 0]]] }] }] };
const cs = [l(`${OS} REDE BT`), p, pol];

describe('montarPacote', () => {
  const arqs = abrirZip(montarPacote(OS, cs));
  const caminhos = arqs.map((a) => a.caminho);
  const get = (c: string) => arqs.find((a) => a.caminho === c)!.bytes;

  it('tem as duas pastas, com o unificado nas duas', () => {
    expect(caminhos).toContain(`${OS} KML/${OS} REDE BT.kml`);
    expect(caminhos).toContain(`${OS} KML/${OS} UNIFICADO.kml`);
    for (const e of ['shp', 'shx', 'dbf', 'prj', 'cpg']) expect(caminhos).toContain(`${OS} SHAPEFILE/${OS} UNIFICADO.${e}`);
  });

  it('cinco arquivos por camada SHP e um KML por camada', () => {
    for (const c of cs) {
      const nome = c.nome.replace(/[\\/:*?"<>|]/g, ' ');
      expect(caminhos).toContain(`${OS} KML/${nome}.kml`);
      for (const e of ['shp', 'shx', 'dbf', 'prj', 'cpg']) expect(caminhos).toContain(`${OS} SHAPEFILE/${nome}.${e}`);
    }
    expect(caminhos.filter((c) => c.startsWith(`${OS} SHAPEFILE/`))).toHaveLength(5 * (cs.length + 1));
    expect(caminhos.filter((c) => c.startsWith(`${OS} KML/`))).toHaveLength(cs.length + 1);
  });

  it('caracteres proibidos no nome do arquivo viram espaço', () => {
    expect(caminhos).toContain(`${OS} KML/${OS} UC   Teste.kml`);
  });

  it('o conteúdo é o mesmo que gravarShp e gravarKml dão (mesma geometria)', () => {
    expect(get(`${OS} SHAPEFILE/${OS} POSTES.shp`)).toEqual(gravarShp(p).shp);
    expect(new TextDecoder().decode(get(`${OS} KML/${OS} POSTES.kml`))).toBe(gravarKml(p));
    expect(new TextDecoder().decode(get(`${OS} SHAPEFILE/${OS} POSTES.prj`))).toBe(PRJ_SIRGAS_24S);
    expect(new TextDecoder().decode(get(`${OS} SHAPEFILE/${OS} POSTES.cpg`))).toBe('UTF-8');
    const u = unificar(OS, cs).shp;
    const lido = lerShp(get(`${OS} SHAPEFILE/${OS} UNIFICADO.shp`), get(`${OS} SHAPEFILE/${OS} UNIFICADO.dbf`), 'UTF-8');
    expect(lido.tipo).toBe('linha');
    expect(lido.feicoes).toHaveLength(u.feicoes.length);
  });

  it('dois nomes de arquivo iguais: erro, em vez de um sobrescrever o outro', () => {
    expect(() => montarPacote(OS, [l(`${OS} A:B`), l(`${OS} A B`)])).toThrow(/repetid/i);
  });
});
