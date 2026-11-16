// Faixas da rede e limites do cruzamento (desenho §6.3). Larguras de APP e de faixa de domínio entram na Tarefa 8.
import type { TipoRede } from '../nucleo/tipos.ts';

export const FAIXA: Record<TipoRede, number> = { MT: 6, BT: 3, CONJ: 6 }; // metros de largura da intervenção
export const M2_POSTE_SEM_REDE = 2.856; // m² por poste novo em área sem vão novo (editável na tela)
export const RAIO_PROXIMA = 100; // metros: área a menos disso da rede nova, sem cruzar, vira aviso
export const MIN_DENTRO = 0.5; // metros: pedaço menor que isso só encosta, não é intervenção
// larguras de APP propostas em volta da água (Código Florestal, Lei 12.651, art. 4º); a confirmar com o P&M
export const LARGURA_APP = { acude: 100, lagoa: 100, rio: 30 } as const; // metros

// faixa de domínio: metros de CADA lado do eixo, sempre a maior largura conhecida (o órgão confirma o valor do trecho)
export const LARGURA_FAIXA = { DNIT: 30, SOP: 35, FERROVIA: 22.5 } as const;
