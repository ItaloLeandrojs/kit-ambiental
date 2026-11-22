import type { CamadaKit } from './shp.ts';
import { gravarShp } from './shp.ts';
import { gravarKml } from './kml-saida.ts';
import { montarZip, type ArquivoZip } from './zip.ts';
import { nomeDeArquivo, unificar } from './camadas.ts';

const enc = new TextEncoder();

/**
 * Os arquivos espaciais do kit: cada camada na pasta do KML e na do SHAPEFILE, mais o unificado.
 * O KML e o SHP saem da mesma geometria. Pastas padrão: `<OS> KML` e `<OS> SHAPEFILE` (baixar separado da Parte 1);
 * o zip final (kit.ts) passa as pastas `KML` e `SHAPEFILE` dentro da pasta do kit.
 * Dois nomes de arquivo iguais dão erro (o zip sobrescreveria um deles em silêncio).
 */
export function arquivosDoPacote(os: string, cs: CamadaKit[], pastas: { kml: string; shp: string } = { kml: `${os} KML`, shp: `${os} SHAPEFILE` }): ArquivoZip[] {
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
  for (const c of kmls) poe(`${pastas.kml}/${nomeDeArquivo(c.nome)}.kml`, enc.encode(gravarKml(c)));
  for (const c of shps) {
    const s = gravarShp(c);
    const base = `${pastas.shp}/${nomeDeArquivo(c.nome)}`;
    poe(`${base}.shp`, s.shp);
    poe(`${base}.shx`, s.shx);
    poe(`${base}.dbf`, s.dbf);
    poe(`${base}.prj`, enc.encode(s.prj));
    poe(`${base}.cpg`, enc.encode(s.cpg));
  }
  return arquivos;
}

/** Zip espacial do kit (quem baixa vê `kit-<OS>-espacial.zip`): `<OS> KML/` e `<OS> SHAPEFILE/`. */
export function montarPacote(os: string, cs: CamadaKit[]): Uint8Array {
  return montarZip(arquivosDoPacote(os, cs));
}
