// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarEstado, type Estado } from '../src/tela/estado.ts';
import { criarPainel } from '../src/tela/painel.ts';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas.ts';
import type { Pt } from '../src/nucleo/tipos.ts';
import { abrirZip } from '../src/nucleo/zip.ts';

// tudo inventado, perto de (500000, 9500000)
const ret = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const area = (id: number, nome: string, pasta: string[], x0: number, y0: number, x1: number, y1: number): AreaProtegida => ({
  id, nome, pasta, atributos: {}, poligonos: [[ret(x0, y0, x1, y1)]], linhas: [], caixa: [x0, y0, x1, y1],
});
const UC = area(1, 'UC Inventada', ['Unidade de Conservação Estadual', 'Uso Sustentável'], 500000, 9500000, 500200, 9500100);
const DNOCS = area(4, 'Perimetro Inventado', ['Perímetros Irrigados DNOCS'], 500000, 9500000, 500200, 9500100);
const ACUDE = area(3, 'Acude Inventado', ['Recursos Hídricos - COGERH', 'Açudes Monitorados'], 500170, 9500000, 500270, 9500100);
const BASE: BaseAreas = {
  revisao: '1', data: '01/01/2024', areas: [UC, DNOCS, ACUDE],
  municipios: [area(2, 'Cidade Teste', ['Municípios_CE'], 495000, 9495000, 505000, 9505000)],
};

type Par = [number, string | number];
const texto = (pares: Par[]) => pares.map(([c, v]) => `${String(c).padStart(3)}\n${v}`).join('\n') + '\n';
const DXF = new TextEncoder().encode(texto([
  [0, 'SECTION'], [2, 'HEADER'], [9, '$ACADVER'], [1, 'AC1027'], [0, 'ENDSEC'], [0, 'SECTION'], [2, 'ENTITIES'],
  [0, 'LINE'], [8, 'LINHAMT'], [10, 500010], [20, 9500050], [11, 500110], [21, 9500050],
  [0, 'TEXT'], [8, 'ETIQ'], [10, 500060], [20, 9500052], [1, '(1)2AN00438'],
  [0, 'ENDSEC'], [0, 'EOF'],
]));

let raiz: HTMLElement;
let estado: Estado;
const salvos: { nome: string; conteudo: Uint8Array | string }[] = [];
const salvar = (nome: string, conteudo: Uint8Array | string) => { salvos.push({ nome, conteudo }); };
const passo = (n: number) => raiz.querySelectorAll('details.passo')[n - 1] as HTMLDetailsElement;
const clicarPasso = (n: number) => passo(n).querySelector('summary')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
const botao = (rotulo: string): HTMLButtonElement =>
  [...raiz.querySelectorAll('button')].find((b) => b.textContent === rotulo) as HTMLButtonElement;

async function noCaso() {
  estado = criarEstado({ lerAreas: async () => BASE });
  criarPainel(raiz, estado, { salvar });
  await estado.carregarKmz(new Uint8Array([1]), 'Areas_Rev1.kmz');
  await estado.carregarProjeto(DXF, 'obra.dxf', '0000000001');
  botao('Rede confirmada, ver o caso').click();
}

beforeEach(() => {
  document.body.innerHTML = '<div id="passos"></div>';
  raiz = document.getElementById('passos')!;
  salvos.length = 0;
});

describe('painel: caso', () => {
  it('"ver o caso" fecha o passo 3, abre o 5 e o passo 3 vira resumo', async () => {
    await noCaso();
    expect(passo(3).hasAttribute('open')).toBe(false);
    expect(passo(5).hasAttribute('open')).toBe(true);
    expect(passo(5).querySelectorAll('.cartao').length).toBeGreaterThan(0);
  });

  it('cartão mostra "Protocolar em" e "Anuência", com a nota de a confirmar no DNOCS', async () => {
    await noCaso();
    const cartoes = [...passo(5).querySelectorAll('article.cartao')];
    const uc = cartoes.find((c) => c.textContent!.includes('UC Inventada'))!;
    expect(uc.textContent).toContain('Protocolar em: SEMACE');
    expect(uc.textContent).toContain('Anuência: SEMA');
    expect(uc.textContent).not.toContain('a confirmar');
    const dnocs = cartoes.find((c) => c.textContent!.includes('Perimetro Inventado'))!;
    expect(dnocs.textContent).toContain('Protocolar em: Município · Anuência: DNOCS');
    expect(dnocs.textContent).toContain('Município a confirmar');
    expect(dnocs.className).toContain('atencao');
  });

  it('o cartão tem o nome exato da área, os metros e os hectares do padrão', async () => {
    await noCaso();
    const uc = [...passo(5).querySelectorAll('article.cartao')].find((c) => c.textContent!.includes('UC Inventada'))!;
    expect(uc.querySelector('h3')!.textContent).toBe('UC Inventada');
    expect(uc.querySelector('.nums')!.textContent).toContain('100 m');
    expect(uc.querySelector('.ha')!.textContent).toContain('0,0600 ha'); // 100 m × 6 m
  });

  it('a APP proposta traz "O que é / Por que importa / O que fazer" visíveis e a largura a confirmar', async () => {
    await noCaso();
    const app = passo(5).querySelector('.aviso.amarelo')!;
    expect(app.textContent).toContain('O que é');
    expect(app.textContent).toContain('Por que importa');
    expect(app.textContent).toContain('O que fazer');
    expect(app.textContent).toContain('Largura padrão de 100 m: a confirmar com o P&M.');
    expect(passo(5).querySelectorAll('.cod')).toHaveLength(1); // o cartão de APP faz o papel do APP_POSSIVEL
    expect(passo(5).querySelector('.cod')!.textContent).toBe('APP_POSSIVEL');
  });

  it('confirmar a APP vira cartão confirmado, e desfazer volta', async () => {
    await noCaso();
    expect(passo(5).querySelector('.pilula.am')!.textContent).toBe('1 avisos para conferir');
    botao('Confirmar APP').click();
    expect(estado.ler().apps[0].resposta).toBe('confirmada');
    expect(passo(5).textContent).toContain('APP confirmada: Acude Inventado');
    expect(passo(5).querySelector('.pilula.am')).toBeNull();
    botao('Desfazer').click();
    expect(estado.ler().apps[0].resposta).toBe('pendente');
  });

  it('APP vazia mostra o erro do núcleo e continua pendente', async () => {
    await noCaso();
    const campo = passo(5).querySelector<HTMLInputElement>('.larg input')!;
    campo.value = '1e-12';
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    botao('Confirmar APP').click();
    expect(passo(5).querySelector('.erro')!.textContent).toBe('A APP ficou vazia. Aumente a largura e tente de novo.');
    expect(estado.ler().appsPendentes).toBe(1);
  });

  it('copiar resumo usa a área de transferência; se falhar, seleciona o texto para Ctrl+C', async () => {
    await noCaso();
    const escrever = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escrever }, configurable: true });
    botao('Copiar resumo').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(escrever).toHaveBeenCalledOnce();
    expect(escrever.mock.calls[0][0]).toContain('OS 0000000001');
    expect(passo(5).textContent).toContain('Resumo copiado.');

    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('negado')) }, configurable: true });
    botao('Copiar resumo').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(passo(5).textContent).toContain('use Ctrl+C');
    expect(window.getSelection()!.toString()).toContain('OS 0000000001');
  });
});

describe('painel: baixar', () => {
  it('desligado com APP sem resposta, e com o aviso', async () => {
    await noCaso();
    botao('Seguir para baixar').click();
    expect(passo(6).hasAttribute('open')).toBe(true);
    expect(botao('Baixar KML e SHP').disabled).toBe(true);
    expect(botao('Abrir no Google Earth').disabled).toBe(true);
    expect(passo(6).textContent).toContain('Responda as APPs propostas antes de baixar');
  });

  it('depois de responder, baixa o zip e o KML com os nomes do kit', async () => {
    await noCaso();
    botao('Confirmar APP').click();
    botao('Seguir para baixar').click();
    expect(botao('Baixar KML e SHP').disabled).toBe(false);
    botao('Baixar KML e SHP').click();
    expect(salvos[0].nome).toBe('kit-0000000001-espacial.zip');
    expect(abrirZip(salvos[0].conteudo as Uint8Array).some((a) => a.caminho.includes('REDE EM APP'))).toBe(true);
    botao('Abrir no Google Earth').click();
    expect(salvos[1].nome).toBe('0000000001 UNIFICADO.kml');
    expect(typeof salvos[1].conteudo).toBe('string');
  });
});

describe('painel: conferir um zip', () => {
  const soltar = (f: File) => {
    const alvo = passo(7).querySelector('label.soltar')!;
    const ev = new Event('drop', { bubbles: true, cancelable: true });
    (ev as unknown as { dataTransfer: unknown }).dataTransfer = { files: [f] };
    alvo.dispatchEvent(ev);
  };
  const esperar = () => new Promise((r) => setTimeout(r, 30));

  it('zip do próprio site: itens verdes e nenhum vermelho de par ou de lugar', async () => {
    await noCaso();
    botao('Confirmar APP').click();
    const zip = estado.baixarPacote().bytes;
    clicarPasso(7);
    soltar(new File([zip as BlobPart], 'kit.zip'));
    await esperar();
    expect(passo(7).querySelectorAll('.item').length).toBeGreaterThan(0);
    const ruins = [...passo(7).querySelectorAll('.item.vermelho')].filter((i) => /NO_LUGAR|PAR|TIPO|COMPRIMENTO/.test(i.textContent!));
    expect(ruins).toHaveLength(0);
    expect(passo(7).querySelector('.item.verde')).not.toBeNull();
  });

  it('arquivo que não é zip: item vermelho com "Como corrigir" visível, primeiro da lista', async () => {
    await noCaso();
    clicarPasso(7);
    soltar(new File(['isto não é zip'], 'lixo.zip'));
    await esperar();
    const v = passo(7).querySelector('.item')!;
    expect(v.classList.contains('vermelho')).toBe(true);
    expect(v.textContent).toContain('Como corrigir:');
  });
});
