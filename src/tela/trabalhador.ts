// Web Worker: lê o KMZ de Áreas Protegidas fora da tela, para a página não travar.
import { lerAreasProtegidas } from '../nucleo/areas.ts';

export interface PedidoKmz { bytes: Uint8Array; nome: string }
export type RespostaKmz = { ok: true; base: ReturnType<typeof lerAreasProtegidas> } | { ok: false; erro: string };

self.onmessage = (e: MessageEvent<PedidoKmz>) => {
  let r: RespostaKmz;
  try {
    r = { ok: true, base: lerAreasProtegidas(e.data.bytes, e.data.nome) };
  } catch (err) {
    r = { ok: false, erro: err instanceof Error ? err.message : String(err) };
  }
  (self as unknown as { postMessage(m: unknown): void }).postMessage(r);
};
