import './estilo.css';
import { carregarBase, type Buscar } from '../nucleo/base.ts';
import type { Pt } from '../nucleo/tipos.ts';
import type { BaseAreas } from '../nucleo/areas.ts';
import { guardar, ler } from './armazem.ts';
import { criarEstado } from './estado.ts';
import { criarEstadoKit } from './estado-kit.ts';
import { criarMapa, ligarEstradas, type EntradaMapa } from './mapa.ts';
import { criarStatus } from './painel.ts';
import { criarPainelKit } from './painel-kit.ts';
import { lerPdfNoNavegador } from './pdf.ts';
import type { Malha, TipoMalha } from '../nucleo/faixa.ts';
import type { PedidoTrabalho, RespostaTrabalho } from './trabalhador.ts';

// o KMZ e as malhas são lidos num Web Worker: a página não trava com 40 MB (KMZ) ou 168 MB (malha do DNIT)
function noTrabalhador(pedido: PedidoTrabalho, falha: string): Promise<RespostaTrabalho & { ok: true }> {
  return new Promise((resolve, reject) => {
    const t = new Worker(new URL('./trabalhador.ts', import.meta.url), { type: 'module' });
    t.onmessage = (e: MessageEvent<RespostaTrabalho>) => {
      t.terminate();
      if (e.data.ok) resolve(e.data);
      else reject(new Error(e.data.erro));
    };
    t.onerror = () => { t.terminate(); reject(new Error(falha)); };
    t.postMessage(pedido, [pedido.bytes.buffer]);
  });
}

async function lerNoTrabalhador(bytes: Uint8Array, nome: string): Promise<BaseAreas> {
  const r = await noTrabalhador({ tipo: 'kmz', bytes, nome }, 'Não consegui ler o KMZ. Tente de novo.');
  if (r.tipo !== 'kmz') throw new Error('Resposta inesperada do leitor.');
  return r.base;
}

async function lerMalhaNoTrabalhador(bytes: Uint8Array, nome: string, tipoMalha: TipoMalha): Promise<Malha> {
  const r = await noTrabalhador({ tipo: 'malha', bytes, nome, tipoMalha }, 'Não consegui ler a malha. Tente de novo.');
  if (r.tipo !== 'malha') throw new Error('Resposta inesperada do leitor.');
  return r.malha;
}

// única chamada de rede: os arquivos de estradas do próprio site
const buscar: Buscar = async (caminho) => {
  const r = await fetch(`${import.meta.env.BASE_URL}base/${caminho}`);
  if (!r.ok) throw new Error(caminho);
  return r.json();
};

const armazem = { guardar, ler };
const estado = criarEstado({ lerAreas: lerNoTrabalhador, lerMalha: lerMalhaNoTrabalhador, armazem });
// a Parte 2 fica em cima da Parte 1; o pdf.js só é carregado quando a conferência lê um PDF
const kit = criarEstadoKit(estado, { armazem, lerPdf: lerPdfNoNavegador });
const barra = criarStatus(document.getElementById('status')!, estado);
const mapa = criarMapa(document.getElementById('palco')!, {
  marcarVao: (id) => estado.marcarVao(id),
  // o clique vai primeiro para a UC (5a); se ela não estiver esperando o clique, vai para a Parte 1 (árvore, limpeza)
  clicarNoMapa: (p) => { if (!kit.clicarNoMapa(p)) estado.clicarNoMapa(p); },
  fecharLimpeza: () => estado.fecharLimpeza(),
}, (p: Pt | null) => barra.cursor(p));
criarPainelKit(document.getElementById('passos')!, kit, estado, { topo: document.getElementById('caso-salvo') });
document.getElementById('ajustar')!.addEventListener('click', () => mapa.ajustar());

// o mapa recebe a Parte 1 e a UC da Parte 2; o estado da Parte 2 avisa também quando a Parte 1 muda
const entradaDoMapa = (): EntradaMapa => {
  const k = kit.ler();
  return { ...estado.ler(), uc: k.uc?.ponto ?? null, candidatosUc: k.candidatosUc.map((c) => c.ponto), marcandoUc: k.escolhendoUc };
};

// botão "Marcar UC" no mapa: o mesmo do passo 5a
const marcarUc = document.getElementById('marcar-uc') as HTMLButtonElement;
marcarUc.addEventListener('click', () => { if (kit.ler().escolhendoUc) kit.cancelarUc(); else kit.marcarUcNoMapa(); });
kit.aoMudar(() => {
  const marcando = kit.ler().escolhendoUc;
  marcarUc.hidden = !estado.ler().caso;
  marcarUc.classList.toggle('ativo', marcando);
  marcarUc.setAttribute('aria-pressed', String(marcando));
  marcarUc.textContent = marcando ? 'Cancelar o clique' : 'Marcar UC';
});

// estradas: busca de novo só quando a obra muda de lugar; resposta de janela velha é ignorada
ligarEstradas({ ler: entradaDoMapa, aoMudar: (f) => kit.aoMudar(f) }, mapa, (t) => barra.aviso(t), async (janela) => (await carregarBase(janela, buscar, 10000)).arestas);

void estado.iniciar();
void kit.iniciar();
