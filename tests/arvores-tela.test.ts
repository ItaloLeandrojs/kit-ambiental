// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { criarEstado, ERRO_ARVORE_SEM_PONTO, ERRO_LIMPEZA_CURTA, type Estado } from '../src/tela/estado.ts';
import { criarPainel } from '../src/tela/painel.ts';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas.ts';
import type { Pt } from '../src/nucleo/tipos.ts';
import { abrirZip } from '../src/nucleo/zip.ts';
import { bytesHeic, jpegComGps, jpegNoUtm, jpegSemExif } from './jpeg-gps.ts';

// tudo inventado, perto de (500000, 9500000)
const ret = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const area = (id: number, nome: string, pasta: string[], x0: number, y0: number, x1: number, y1: number): AreaProtegida => ({
  id, nome, pasta, atributos: {}, poligonos: [[ret(x0, y0, x1, y1)]], linhas: [], caixa: [x0, y0, x1, y1],
});
const BASE: BaseAreas = {
  revisao: '1', data: '01/01/2024',
  areas: [area(1, 'UC Inventada', ['Unidade de Conservação Estadual', 'Uso Sustentável'], 500000, 9500000, 500200, 9500100)],
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

const foto = (nome: string, bytes: Uint8Array) => ({ nome, bytes });
let raiz: HTMLElement;
let estado: Estado;
const passo = (n: number) => raiz.querySelectorAll('details.passo')[n - 1] as HTMLDetailsElement;
const botao = (rotulo: string, onde: ParentNode = raiz): HTMLButtonElement =>
  [...onde.querySelectorAll('button')].find((b) => b.textContent === rotulo) as HTMLButtonElement;

async function comCaso(comPainel = false) {
  estado = criarEstado({ lerAreas: async () => BASE });
  if (comPainel) criarPainel(raiz, estado, { salvar: () => {} });
  await estado.carregarKmz(new Uint8Array([1]), 'Areas_Rev1.kmz');
  await estado.carregarProjeto(DXF, 'obra.dxf', '0000000001');
}

beforeEach(() => {
  document.body.innerHTML = '<div id="passos"></div>';
  raiz = document.getElementById('passos')!;
});

describe('estado: árvores', () => {
  it('cada foto vira uma árvore: GPS dentro do Ceará põe o ponto; o resto fica sem ponto e com o aviso', async () => {
    await comCaso();
    const ids = estado.adicionarFotos([
      foto('com-gps.jpg', jpegNoUtm([500050, 9500050])),
      foto('sem-gps.jpg', jpegSemExif()),
      foto('celular.heic', bytesHeic()),
      foto('sao-paulo.jpg', jpegComGps({ lat: [23, 33, 0], lon: [46, 38, 0] })),
    ]);
    expect(ids).toHaveLength(4);
    const r = estado.ler();
    const [a, b, c, d] = r.arvores;
    expect(a.ponto![0]).toBeCloseTo(500050, 0);
    expect(a.ponto![1]).toBeCloseTo(9500050, 0);
    expect(r.infoFotos[a.id]).toEqual({ aviso: null, origem: 'gps' });
    for (const x of [b, c, d]) expect(x.ponto).toBeNull();
    expect(r.infoFotos[b.id].aviso).toBe('Esta foto não tem a posição. Clique no mapa onde está a árvore.');
    expect(r.infoFotos[c.id].aviso).toBe('Foto HEIC: o site não lê a posição. Clique no mapa onde está a árvore.');
    expect(r.infoFotos[d.id].aviso).toBe('A posição desta foto fica fora do Ceará. Clique no mapa onde está a árvore.');
    expect(r.arvoresSemPonto).toBe(3);
    expect(r.avisosArvores.find((x) => x.codigo === 'ARVORE_SEM_PONTO')?.nivel).toBe('vermelho');
  });

  it('árvore sem ponto trava o download; o clique no mapa libera', async () => {
    await comCaso();
    const [id] = estado.adicionarFotos([foto('sem-gps.jpg', jpegSemExif())]);
    expect(() => estado.baixarPacote()).toThrow(ERRO_ARVORE_SEM_PONTO);
    expect(() => estado.baixarGoogleEarth()).toThrow(ERRO_ARVORE_SEM_PONTO);
    estado.colocarArvore(id);
    expect(estado.ler().modoMapa).toEqual({ t: 'arvore', id });
    estado.clicarNoMapa([500040, 9500040]);
    const r = estado.ler();
    expect(r.arvores[0].ponto).toEqual([500040, 9500040]);
    expect(r.infoFotos[id].origem).toBe('mapa');
    expect(r.modoMapa).toBeNull();
    expect(() => estado.baixarPacote()).not.toThrow();
  });

  it('colocar a mesma árvore duas vezes cancela; sem modo, o clique não faz nada', async () => {
    await comCaso();
    const [id] = estado.adicionarFotos([foto('x.jpg', jpegSemExif())]);
    estado.clicarNoMapa([1, 1]);
    expect(estado.ler().arvores[0].ponto).toBeNull();
    estado.colocarArvore(id);
    estado.colocarArvore(id);
    expect(estado.ler().modoMapa).toBeNull();
  });

  it('o zip leva PODA e SUPRESSAO com a espécie, e o KML do Google Earth também', async () => {
    await comCaso();
    const [a, b] = estado.adicionarFotos([foto('a.jpg', jpegNoUtm([500040, 9500045])), foto('b.jpg', jpegNoUtm([500060, 9500045], 'II'))]);
    estado.mudarArvore(a, { especie: 'Mulungu' });
    estado.mudarArvore(b, { especie: 'Carnaúba', intervencao: 'supressao' });
    const { bytes } = estado.baixarPacote();
    const nomes = abrirZip(bytes).map((e) => e.caminho);
    for (const ext of ['kml', 'shp', 'dbf']) {
      const base = ext === 'kml' ? '0000000001 KML/' : '0000000001 SHAPEFILE/';
      expect(nomes).toContain(`${base}0000000001 PODA.${ext}`);
      expect(nomes).toContain(`${base}0000000001 SUPRESSAO.${ext}`);
    }
    const kml = new TextDecoder().decode(abrirZip(bytes).find((e) => e.caminho === '0000000001 KML/0000000001 SUPRESSAO.kml')!.bytes);
    expect(kml).toContain('Carnaúba');
    expect(estado.baixarGoogleEarth().texto).toContain('Mulungu');
    expect(estado.ler().avisosArvores.map((x) => x.codigo)).toEqual(['ARVORE_CARNAUBA']);
  });

  it('o zip com árvores passa na conferência sem vermelho de tipo', async () => {
    await comCaso();
    const [a] = estado.adicionarFotos([foto('a.jpg', jpegNoUtm([500040, 9500045]))]);
    estado.mudarArvore(a, { especie: 'Mulungu' });
    estado.comecarLimpeza();
    for (const p of [[500020, 9500060], [500080, 9500060], [500080, 9500080]] as Pt[]) estado.clicarNoMapa(p);
    estado.fecharLimpeza();
    const itens = estado.conferir(estado.baixarPacote().bytes);
    expect(itens.filter((i) => i.nivel === 'vermelho' && ['TIPO', 'NO_LUGAR', 'PAR'].includes(i.codigo))).toEqual([]);
  });

  it('limpeza de faixa: clica os cantos, fecha, vira camada; com menos de 3 cantos descarta e avisa', async () => {
    await comCaso();
    estado.comecarLimpeza();
    estado.clicarNoMapa([500020, 9500060]);
    estado.clicarNoMapa([500080, 9500060]);
    estado.fecharLimpeza();
    expect(estado.ler().limpeza).toEqual([]);
    expect(estado.ler().erroArvores).toBe(ERRO_LIMPEZA_CURTA);
    estado.comecarLimpeza();
    for (const p of [[500020, 9500060], [500080, 9500060], [500080, 9500080]] as Pt[]) estado.clicarNoMapa(p);
    expect(estado.ler().modoMapa).toMatchObject({ t: 'limpeza' });
    estado.fecharLimpeza();
    expect(estado.ler().limpeza).toHaveLength(1);
    const nomes = abrirZip(estado.baixarPacote().bytes).map((e) => e.caminho);
    expect(nomes).toContain('0000000001 KML/0000000001 LIMPEZA DE FAIXA.kml');
    expect(nomes).toContain('0000000001 SHAPEFILE/0000000001 LIMPEZA DE FAIXA.shp');
    estado.removerLimpeza(0);
    expect(estado.ler().limpeza).toEqual([]);
  });

  it('tirar a árvore tira o aviso vermelho; outro projeto zera as árvores', async () => {
    await comCaso();
    const [id] = estado.adicionarFotos([foto('x.jpg', jpegSemExif())]);
    estado.removerArvore(id);
    expect(estado.ler().arvores).toEqual([]);
    expect(estado.ler().avisosArvores).toEqual([]);
    estado.adicionarFotos([foto('y.jpg', jpegNoUtm([500040, 9500045]))]);
    await estado.carregarProjeto(DXF, 'obra.dxf', '0000000002');
    expect(estado.ler().arvores).toEqual([]);
  });

  it('mais de 20 árvores: aviso amarelo sugerindo a limpeza de faixa', async () => {
    await comCaso();
    estado.adicionarFotos(Array.from({ length: 21 }, (_, i) => foto(`f${i}.jpg`, jpegNoUtm([500040, 9500045]))));
    expect(estado.ler().avisosArvores.map((x) => x.codigo)).toEqual(['ARVORE_MUITAS', 'ARVORE_SEM_ESPECIE']);
  });
});

describe('estado: árvore em área protegida', () => {
  it('supressão dentro da UC avisa no estado; fora dela, não', async () => {
    await comCaso();
    const [a, b] = estado.adicionarFotos([foto('a.jpg', jpegNoUtm([500040, 9500045])), foto('b.jpg', jpegNoUtm([500300, 9500045]))]);
    estado.mudarArvore(a, { especie: 'Mulungu', intervencao: 'supressao' });
    estado.mudarArvore(b, { especie: 'Ipê' });
    expect(estado.ler().avisosEmArea.map((x) => x.texto)).toEqual(['Supressão dentro de UC Inventada: o órgão precisa saber; inclua no memorial']);
    estado.removerArvore(a);
    expect(estado.ler().avisosEmArea).toEqual([]);
  });

  it('limpeza dentro de uma APP confirmada avisa; os metros e hectares da rede não mudam', async () => {
    const base: BaseAreas = { ...BASE, areas: [...BASE.areas, area(3, 'Acude Inventado', ['Recursos Hídricos - COGERH', 'Açudes Monitorados'], 500170, 9500000, 500270, 9500100)] };
    estado = criarEstado({ lerAreas: async () => base });
    await estado.carregarKmz(new Uint8Array([1]), 'Areas_Rev1.kmz');
    await estado.carregarProjeto(DXF, 'obra.dxf', '0000000001');
    const i = estado.ler().apps.findIndex((a) => a.proposta.agua.id === 3);
    estado.confirmarApp(i, 100);
    const antes = JSON.stringify(estado.ler().caso!.intervencoes.map((x) => [x.area.nome, x.metros, x.hectares]));
    estado.comecarLimpeza();
    for (const p of [[500280, 9500020], [500320, 9500020], [500320, 9500060]] as Pt[]) estado.clicarNoMapa(p);
    estado.fecharLimpeza();
    const textos = estado.ler().avisosEmArea.map((x) => x.texto);
    expect(textos).toHaveLength(1);
    expect(textos[0]).toMatch(/^Limpeza de faixa dentro de .*Acude Inventado.*: o órgão precisa saber; inclua no memorial$/);
    expect(JSON.stringify(estado.ler().caso!.intervencoes.map((x) => [x.area.nome, x.metros, x.hectares]))).toBe(antes);
  });
});

describe('painel: passo 4, árvores', () => {
  it('digitar a espécie não refaz o cartão: o campo é o mesmo elemento e o foco continua nele', async () => {
    await comCaso(true);
    botao('Rede confirmada, seguir').click();
    estado.adicionarFotos([foto('a.jpg', jpegNoUtm([500040, 9500045])), foto('b.jpg', jpegNoUtm([500050, 9500045]))]);
    const campo = passo(4).querySelector('.arvore input[type="text"]') as HTMLInputElement;
    campo.focus();
    expect(document.activeElement).toBe(campo);
    campo.value = 'Ipê';
    campo.dispatchEvent(new Event('change', { bubbles: true }));
    const depois = passo(4).querySelector('.arvore input[type="text"]') as HTMLInputElement;
    expect(depois).toBe(campo);
    expect(depois.value).toBe('Ipê');
    expect(document.activeElement).toBe(depois);
    expect(passo(4).textContent).toContain('Há 1 árvore sem espécie.');
  });

  it('o foco do campo volta mesmo quando o cartão é refeito (mudou o ponto)', async () => {
    await comCaso(true);
    botao('Rede confirmada, seguir').click();
    const [a] = estado.adicionarFotos([foto('a.jpg', jpegSemExif())]);
    (passo(4).querySelector('.arvore input[type="text"]') as HTMLInputElement).focus();
    estado.colocarArvore(a);
    estado.clicarNoMapa([500040, 9500040]);
    const campo = passo(4).querySelector('.arvore input[type="text"]') as HTMLInputElement;
    expect(document.activeElement).toBe(campo);
  });

  it('o passo 5 mostra o aviso de árvore em área e a linha das árvores no resumo', async () => {
    await comCaso(true);
    botao('Rede confirmada, seguir').click();
    const [a] = estado.adicionarFotos([foto('a.jpg', jpegNoUtm([500040, 9500045]))]);
    estado.mudarArvore(a, { especie: 'Mulungu', intervencao: 'supressao' });
    botao('Seguir para o caso').click();
    const p5 = passo(5).textContent!;
    expect(p5).toContain('Árvore em área protegida');
    expect(p5).toContain('Supressão dentro de UC Inventada: o órgão precisa saber; inclua no memorial');
    expect(p5).toContain('Por que importa');
    expect(p5).toContain('Árvores: 1 supressão.');
  });

  it('carnaúba e árvore sem espécie chegam ao passo 5 e ao resumo copiado', async () => {
    await comCaso(true);
    botao('Rede confirmada, seguir').click();
    const [a] = estado.adicionarFotos([foto('a.jpg', jpegNoUtm([500300, 9500300])), foto('b.jpg', jpegNoUtm([500310, 9500310]))]);
    estado.mudarArvore(a, { especie: 'Carnaúba', intervencao: 'supressao' });
    botao('Seguir para o caso').click();
    const cods = [...passo(5).querySelectorAll('.cod')].map((c) => c.textContent);
    expect(cods).toContain('ARVORE_CARNAUBA');
    expect(cods).toContain('ARVORE_SEM_ESPECIE');
    const resumo = passo(5).querySelector('.resumo-txt')!.textContent!;
    expect(resumo).toContain('Aviso: Carnaúba é espécie protegida (Decreto estadual 27.413/2004).');
    expect(resumo).toContain('Aviso: Há 1 árvore sem espécie.');
  });

  it('"Rede confirmada, seguir" abre o passo 4, que mostra a zona de fotos; o passo 5 espera', async () => {
    await comCaso(true);
    expect(passo(4).classList.contains('bloqueado')).toBe(false);
    botao('Rede confirmada, seguir').click();
    expect(passo(4).hasAttribute('open')).toBe(true);
    expect(passo(5).hasAttribute('open')).toBe(false);
    expect(passo(4).querySelector('input[type="file"][multiple]')).not.toBeNull();
    expect(passo(4).textContent).not.toContain('próximas etapas');
    expect(passo(4).textContent).toContain('nenhuma árvore');
    botao('Seguir para o caso').click();
    expect(passo(5).hasAttribute('open')).toBe(true);
    expect(passo(4).hasAttribute('open')).toBe(false);
  });

  it('o passo 4 fica bloqueado sem caso', () => {
    estado = criarEstado({ lerAreas: async () => BASE });
    criarPainel(raiz, estado, { salvar: () => {} });
    expect(passo(4).classList.contains('bloqueado')).toBe(true);
  });

  it('lista com coordenada, espécie e intervenção; foto sem GPS pede o clique no mapa', async () => {
    await comCaso(true);
    botao('Rede confirmada, seguir').click();
    const [a, , c] = estado.adicionarFotos([
      foto('mulungu.jpg', jpegNoUtm([500040, 9500045])),
      foto('sem-gps.jpg', jpegSemExif()),
      foto('celular.heic', bytesHeic()),
    ]);
    estado.mudarArvore(a, { especie: 'Mulungu' });
    const cartoes = [...passo(4).querySelectorAll('.arvore[data-arvore]')];
    expect(cartoes).toHaveLength(3);
    expect(cartoes[0].textContent).toContain('GPS da foto');
    expect(cartoes[0].textContent).toMatch(/9\D?500\D?045 N/);
    expect((cartoes[0].querySelector('input[type="text"]') as HTMLInputElement).value).toBe('Mulungu');
    expect(cartoes[1].textContent).toContain('Esta foto não tem a posição. Clique no mapa onde está a árvore.');
    expect(cartoes[2].textContent).toContain('Foto HEIC');
    const opcoes = [...cartoes[0].querySelectorAll('option')].map((o) => o.textContent);
    expect(opcoes).toEqual(['Poda simples', 'Supressão']);
    // vermelho com "Por que importa"
    const vermelho = passo(4).querySelector('.aviso.vermelho')!;
    expect(vermelho.textContent).toContain('Há 2 árvores sem posição no mapa.');
    expect(vermelho.textContent).toContain('Por que importa');
    // clicar no botão liga o modo; o clique no mapa põe a árvore
    botao('Clicar no mapa', cartoes[2]).click();
    expect(estado.ler().modoMapa).toEqual({ t: 'arvore', id: c });
    expect(passo(4).textContent).toContain('Clique no mapa onde a árvore está.');
  });

  it('carnaúba mostra o aviso amarelo com "Por que importa"', async () => {
    await comCaso(true);
    botao('Rede confirmada, seguir').click();
    const [a] = estado.adicionarFotos([foto('c.jpg', jpegNoUtm([500040, 9500045]))]);
    estado.mudarArvore(a, { especie: 'Carnaúba', intervencao: 'supressao' });
    const amarelo = passo(4).querySelector('.aviso.amarelo')!;
    expect(amarelo.textContent).toContain('Carnaúba é espécie protegida (Decreto estadual 27.413/2004).');
    expect(amarelo.textContent).toContain('Por que importa');
    expect(amarelo.textContent).toContain('O que fazer');
  });

  it('digitar a espécie e trocar a intervenção chega ao estado', async () => {
    await comCaso(true);
    botao('Rede confirmada, seguir').click();
    estado.adicionarFotos([foto('c.jpg', jpegNoUtm([500040, 9500045]))]);
    const campo = passo(4).querySelector('.arvore input[type="text"]') as HTMLInputElement;
    campo.value = 'Ipê';
    campo.dispatchEvent(new Event('change', { bubbles: true }));
    expect(estado.ler().arvores[0].especie).toBe('Ipê');
    const sel = passo(4).querySelector('.arvore select') as HTMLSelectElement;
    sel.value = 'supressao';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(estado.ler().arvores[0].intervencao).toBe('supressao');
    expect(passo(4).textContent).toContain('1 árvore · 0 podas · 1 supressão');
  });

  it('soltar fotos (arrastar) lê o GPS e cria as árvores', async () => {
    await comCaso(true);
    botao('Rede confirmada, seguir').click();
    const f = new File([jpegNoUtm([500040, 9500045]) as BlobPart], 'solta.jpg', { type: 'image/jpeg' });
    const ev = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: { files: [f] } });
    passo(4).querySelector('label.soltar')!.dispatchEvent(ev);
    await new Promise((r) => setTimeout(r, 20));
    expect(estado.ler().arvores).toHaveLength(1);
    expect(estado.ler().arvores[0].foto).toBe('solta.jpg');
    expect(estado.ler().arvores[0].ponto).not.toBeNull();
  });

  it('desenhar a limpeza de faixa: botão liga o modo, "Fechar a área" fecha', async () => {
    await comCaso(true);
    botao('Rede confirmada, seguir').click();
    botao('Desenhar limpeza de faixa').click();
    expect(estado.ler().modoMapa).toMatchObject({ t: 'limpeza' });
    for (const p of [[500020, 9500060], [500080, 9500060], [500080, 9500080]] as Pt[]) estado.clicarNoMapa(p);
    expect(passo(4).textContent).toContain('3 cantos');
    botao('Fechar a área').click();
    expect(estado.ler().limpeza).toHaveLength(1);
    expect(passo(4).textContent).toContain('Limpeza de faixa 1');
  });

  it('com árvore sem ponto, o passo 6 desliga os dois botões de baixar e diz por quê', async () => {
    await comCaso(true);
    botao('Rede confirmada, seguir').click();
    estado.adicionarFotos([foto('sem-gps.jpg', jpegSemExif())]);
    botao('Seguir para o caso').click();
    botao('Seguir para baixar').click();
    expect(botao('Baixar KML e SHP').disabled).toBe(true);
    expect(botao('Abrir no Google Earth').disabled).toBe(true);
    expect(passo(6).textContent).toContain(ERRO_ARVORE_SEM_PONTO);
  });
});
