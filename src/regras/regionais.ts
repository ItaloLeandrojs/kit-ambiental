import { semAcento } from '../nucleo/areas.ts';
import type { Regional } from '../nucleo/obra.ts';

// Município -> regional da pasta do kit. Chave = semAcento(município).
//
// ORIGEM: "MAPA CEARA COM REGIONAIS.pdf" (WorkShop), lido em 19/11/2026. O mapa é de 2006
// ("Atualização 2006", Coelce), desenhado por cores, e o texto do PDF só traz os nomes dos
// municípios, sem dizer a regional de cada um. Além disso o mapa não bate com as pastas dos kits
// aprovados: ele pinta Beberibe em METROPOLITANA, mas o kit aprovado de Beberibe está na pasta
// FORTALEZA; e o mapa tem "CENTRO NORTE", que não existe na lista de regionais da pasta.
// Por isso só entra aqui o que é certo: Fortaleza (única área amarela do mapa, igual ao nome da pasta).
// Os demais municípios ficam FORA da tabela: o projetista escolhe a regional na lista.
export const REGIONAL_DO_MUNICIPIO: Record<string, Regional> = {
  FORTALEZA: 'FORTALEZA',
};

export function regionalSugerida(municipio: string): Regional | null {
  return REGIONAL_DO_MUNICIPIO[semAcento(municipio.trim())] ?? null;
}
