// Web Worker: lê o KMZ de Áreas Protegidas e as malhas de faixa de domínio fora da tela, para a página não travar.
import { lerAreasProtegidas } from '../nucleo/areas.ts';
import { lerMalha, type Malha, type TipoMalha } from '../nucleo/faixa.ts';

export type PedidoTrabalho =
  | { tipo: 'kmz'; bytes: Uint8Array; nome: string }
  | { tipo: 'malha'; bytes: Uint8Array; nome: string; tipoMalha: TipoMalha };
export type RespostaTrabalho =
  | { ok: true; tipo: 'kmz'; base: ReturnType<typeof lerAreasProtegidas> }
  | { ok: true; tipo: 'malha'; malha: Malha }
  | { ok: false; erro: string };

self.onmessage = (e: MessageEvent<PedidoTrabalho>) => {
  let r: RespostaTrabalho;
  try {
    const p = e.data;
    r = p.tipo === 'kmz'
      ? { ok: true, tipo: 'kmz', base: lerAreasProtegidas(p.bytes, p.nome) }
      : { ok: true, tipo: 'malha', malha: lerMalha(p.bytes, p.nome, p.tipoMalha) };
  } catch (err) {
    r = { ok: false, erro: err instanceof Error ? err.message : String(err) };
  }
  (self as unknown as { postMessage(m: unknown): void }).postMessage(r);
};
