import type { CamadaKit } from './shp.ts';
import { gravarShp } from './shp.ts';
import { gravarKml } from './kml-saida.ts';
import { montarZip, type ArquivoZip } from './zip.ts';
import { nomeDeArquivo, unificar } from './camadas.ts';

const enc = new TextEncoder();

/**
 * Zip espacial do kit (quem baixa vê `kit-<OS>-espacial.zip`): `<OS> KML/` e `<OS> SHAPEFILE/`,
 * cada camada nas duas pastas, mais o unificado. O KML e o SHP saem da mesma geometria.
 * Dois nomes de arquivo iguais dão erro (o zip sobrescreveria um deles em silêncio).
 */
export function montarPacote(os: string, cs: CamadaKit[]): Uint8Array {
  const arquivos: ArquivoZip[] = [];
  const vistos = new Set<string>();
  const poe = (caminho: string, bytes: Uint8Array): void => {
    const k = caminho.toLowerCase();
    if (vistos.has(k)) throw new Error(`Nome de arquivo repetido no kit: ${caminho}`);
    vistos.add(k);
    arquivos.push({ caminho, bytes });
  };
  const u = unificar(os, cs);
  const kmls = [...cs, u.kml];
  const shps = [...cs, u.shp];
  for (const c of kmls) poe(`${os} KML/${nomeDeArquivo(c.nome)}.kml`, enc.encode(gravarKml(c)));
  for (const c of shps) {
    const s = gravarShp(c);
    const base = `${os} SHAPEFILE/${nomeDeArquivo(c.nome)}`;
    poe(`${base}.shp`, s.shp);
    poe(`${base}.shx`, s.shx);
    poe(`${base}.dbf`, s.dbf);
    poe(`${base}.prj`, enc.encode(s.prj));
    poe(`${base}.cpg`, enc.encode(s.cpg));
  }
  return montarZip(arquivos);
}
