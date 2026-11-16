import './estilo.css';
import { carregarBase, type Buscar } from '../nucleo/base.ts';
import type { Pt } from '../nucleo/tipos.ts';
import type { BaseAreas } from '../nucleo/areas.ts';
import { guardar, ler } from './armazem.ts';
import { criarEstado } from './estado.ts';
import { criarMapa } from './mapa.ts';
import { criarPainel, criarStatus } from './painel.ts';
import type { RespostaKmz } from './trabalhador.ts';

// o KMZ é lido num Web Worker: a página não trava com 40 MB
function lerNoTrabalhador(bytes: Uint8Array, nome: string): Promise<BaseAreas> {
  return new Promise((resolve, reject) => {
    const t = new Worker(new URL('./trabalhador.ts', import.meta.url), { type: 'module' });
    t.onmessage = (e: MessageEvent<RespostaKmz>) => {
      t.terminate();
      if (e.data.ok) resolve(e.data.base);
      else reject(new Error(e.data.erro));
    };
    t.onerror = () => { t.terminate(); reject(new Error('Não consegui ler o KMZ. Tente de novo.')); };
    t.postMessage({ bytes, nome }, [bytes.buffer]);
  });
}

// única chamada de rede: os arquivos de estradas do próprio site
const buscar: Buscar = async (caminho) => {
  const r = await fetch(`${import.meta.env.BASE_URL}base/${caminho}`);
  if (!r.ok) throw new Error(caminho);
  return r.json();
};

const estado = criarEstado({ lerAreas: lerNoTrabalhador, armazem: { guardar, ler } });
const barra = criarStatus(document.getElementById('status')!, estado);
const mapa = criarMapa(document.getElementById('palco')!, { marcarVao: (id) => estado.marcarVao(id) }, (p: Pt | null) => barra.cursor(p));
criarPainel(document.getElementById('passos')!, estado);
document.getElementById('ajustar')!.addEventListener('click', () => mapa.ajustar());

// estradas: busca de novo só quando a obra muda de lugar
let chaveEstradas = '';
estado.aoMudar(() => {
  const r = estado.ler();
  mapa.atualizar(r);
  if (!r.rede) { chaveEstradas = ''; return; }
  const pts = [...r.rede.vaos.flatMap((v) => v.pts), ...r.rede.postes.map((p) => p.ponto)];
  if (!pts.length) return;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const janela = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  const chave = [janela.x0, janela.y0, janela.x1, janela.y1].map((n) => Math.round(n / 1000)).join(',');
  if (chave === chaveEstradas) return;
  chaveEstradas = chave;
  carregarBase(janela, buscar, 10000).then((b) => mapa.definirEstradas(b.arestas), () => { /* estrada é só referência: sem ela o mapa segue */ });
});

void estado.iniciar();
