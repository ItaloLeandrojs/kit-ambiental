// Rede subterrânea: a empresa nunca tem. Se o projeto tiver, o site dá vermelho e trava o kit.
import { semAcento } from './areas.ts';
import type { DxfGeo } from './dxf.ts';
import type { Aviso, Feicao } from './tipos.ts';
import { TEXTOS } from '../regras/textos.ts';

export const AVISO_SUBTERRANEA: Aviso = {
  nivel: 'vermelho', codigo: 'REDE_SUBTERRANEA', texto: TEXTOS.subterranea,
  comoCorrigir: 'Tire a rede subterrânea do projeto, ou monte este kit à mão.',
};

// SUBT, SUBTERR... ou DUTO como palavra inteira: antes, nada de letra ou número (sublinhado separa);
// depois, nada de letra (número pode: DUTO2, SUBT1). SUBESTACAO e SUBTOTAL não entram
const RE_SUBTERRANEA = /(?<![A-Z0-9])(SUBT|SUBTERR[A-Z]*|DUTOS?)(?![A-Z])/;
const ehSubterranea = (nome: string): boolean => RE_SUBTERRANEA.test(semAcento(nome));
const unicos = (xs: string[]): string[] => [...new Set(xs)];

/** Camadas do DXF com linha cujo nome indica rede subterrânea. */
export function temSubterraneaDxf(d: DxfGeo): string[] {
  return unicos(d.linhas.map((l) => l.camada).filter(ehSubterranea));
}

/** Pastas ou nomes de feição do KML que indicam rede subterrânea. */
export function temSubterraneaKml(f: Feicao[]): string[] {
  const achados: string[] = [];
  for (const x of f) {
    for (const p of x.pasta) if (ehSubterranea(p)) achados.push(p);
    if (ehSubterranea(x.nome)) achados.push(x.nome);
  }
  return unicos(achados);
}
