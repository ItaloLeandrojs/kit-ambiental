// Copia os dados reais para casos-privados/ (fora do git). Todos os caminhos de origem vêm por argumento.
// Uso: node scripts/preparar-casos.ts --kmz <kmz> --kits <zip> --dxf <pasta> --malhas <zip>
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = join(RAIZ, 'casos-privados');

function argumento(nome: string): string {
  const i = process.argv.indexOf('--' + nome);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v) {
    console.error('Faltou o argumento --' + nome + '. Uso: node scripts/preparar-casos.ts --kmz <kmz> --kits <zip> --dxf <pasta> --malhas <zip>');
    process.exit(1);
  }
  return v;
}

function gravar(destino: string, bytes: Uint8Array): void {
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, bytes);
}

const lerBytes = (p: string): Uint8Array => new Uint8Array(readFileSync(p));
// Só os arquivos de um zip que passam no filtro (os outros nem são descompactados).
const extrair = (bytes: Uint8Array, quer: (nome: string) => boolean): Record<string, Uint8Array> =>
  unzipSync(bytes, { filter: (f) => quer(f.name) });

// 1. KMZ de áreas protegidas
const kmz = argumento('kmz');
mkdirSync(SAIDA, { recursive: true });
copyFileSync(kmz, join(SAIDA, 'areas-protegidas.kmz'));
console.log('areas-protegidas.kmz copiado');

// 2. Kits aprovados: os zips de dentro da pasta "MODELOS DE PROCESSOS VALIDADOS"
const kitsZip = lerBytes(argumento('kits'));
const internos = extrair(kitsZip, (n) => /MODELOS DE PROCESSOS VALIDADOS\/[^/]+\.zip$/i.test(n));
const usados = new Set<string>();
let kits = 0;
for (const [nome, bytes] of Object.entries(internos)) {
  const base = basename(nome).replace(/\.zip$/i, '');
  const digitos = /^\d+/.exec(base)?.[0];
  let id = digitos ?? base.replace(/[^A-Za-z0-9_-]+/g, '_');
  if (!digitos) console.warn('Sem dígitos no começo do nome, usei nome limpo: ' + id);
  while (usados.has(id)) id += '_';
  usados.add(id);
  gravar(join(SAIDA, 'kits', id + '.zip'), bytes);
  kits++;
}
console.log(kits + ' kits copiados');

// 3. DXFs: <pasta>/<subpasta>/obra.dxf -> dxf/<subpasta>.dxf (a pasta "referencia" não é caso de DXF)
const pastaDxf = argumento('dxf');
let dxfs = 0;
mkdirSync(join(SAIDA, 'dxf'), { recursive: true });
for (const sub of readdirSync(pastaDxf)) {
  const arq = join(pastaDxf, sub, 'obra.dxf');
  if (sub === 'referencia' || !statSync(join(pastaDxf, sub)).isDirectory() || !existsSync(arq)) continue;
  copyFileSync(arq, join(SAIDA, "dxf", sub + '.dxf'));
  dxfs++;
}
console.log(dxfs + ' DXFs copiados');

// 4. Malhas: o .kml do DNIT e o .kmz da SOP
const malhasZip = lerBytes(argumento('malhas'));
const malhas = extrair(malhasZip, (n) => /\.(kml|kmz)$/i.test(n));
let nMalhas = 0;
for (const [nome, bytes] of Object.entries(malhas)) {
  const destino = /DNIT/i.test(nome) && /\.kml$/i.test(nome) ? 'DNIT.kml' : /SOP/i.test(nome) && /\.kmz$/i.test(nome) ? 'SOP.kmz' : null;
  if (!destino) { console.warn('Malha ignorada: ' + basename(nome)); continue; }
  gravar(join(SAIDA, 'malhas', destino), bytes);
  nMalhas++;
}
console.log(nMalhas + ' malhas copiadas');
