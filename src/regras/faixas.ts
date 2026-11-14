// Faixas da rede e limites do cruzamento (desenho §6.3). Larguras de APP e de faixa de domínio entram na Tarefa 8.
import type { TipoRede } from '../nucleo/tipos.ts';

export const FAIXA: Record<TipoRede, number> = { MT: 6, BT: 3, CONJ: 6 }; // metros de largura da intervenção
export const M2_POSTE_SEM_REDE = 2.856; // m² por poste novo em área sem vão novo (editável na tela)
export const RAIO_PROXIMA = 100; // metros: área a menos disso da rede nova, sem cruzar, vira aviso
export const MIN_DENTRO = 0.5; // metros: pedaço menor que isso só encosta, não é intervenção
