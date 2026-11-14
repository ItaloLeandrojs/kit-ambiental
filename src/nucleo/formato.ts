import type { Pt } from './tipos.ts';

// metros inteiros: "45"
export const metrosTexto = (m: number): string => String(Math.round(m));

// hectares com vírgula: mínimo 4 casas, máximo 7, sem zeros sobrando depois da 4ª
export function haTexto(ha: number): string {
  let s = ha.toFixed(7);
  while (s.endsWith('0') && s.length - s.indexOf('.') - 1 > 4) s = s.slice(0, -1);
  return s.replace('.', ',');
}

// "(0469418, 9161031)": E com 7 dígitos
export const coordTexto = (p: Pt): string => `(${String(Math.round(p[0])).padStart(7, '0')}, ${Math.round(p[1])})`;
