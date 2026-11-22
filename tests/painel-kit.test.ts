// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { criarEstado, type Armazem, type Estado } from '../src/tela/estado.ts';
import { criarEstadoKit, type EstadoKit } from '../src/tela/estado-kit.ts';
import { criarPainelKit } from '../src/tela/painel-kit.ts';
import { postesNovos, type Imagem, type Responsavel } from '../src/nucleo/obra.ts';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas.ts';
import type { Pt } from '../src/nucleo/tipos.ts';
import { TEXTOS_ESTADO_KIT } from '../src/regras/textos-memorial.ts';
import { lerPdfNoNode } from './ajuda/pdf-simples.ts';
import { planilhaInventada } from './ajuda/planilha-inventada.ts';
import { textoDoDocx } from '../src/nucleo/docx.ts';
import { montarZip } from '../src/nucleo/zip.ts';

// tudo inventado, perto de (500000, 9500000), como em tests/estado-kit.test.ts
const retangulo = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const area = (id: number, nome: string, pasta: string[], x0: number, y0: number, x1: number, y1: number): AreaProtegida => ({
  id, nome, pasta, atributos: {}, poligonos: [[retangulo(x0, y0, x1, y1)]], linhas: [], caixa: [x0, y0, x1, y1],
});
const BASE: BaseAreas = {
  revisao: '1', data: '01/01/2024',
  areas: [area(1, 'UC Inventada', ['Unidade de Conservação Estadual', 'Uso Sustentável'], 500000, 9500000, 500200, 9500100)],
  municipios: [area(2, 'Cidade Teste', ['Municípios_CE'], 495000, 9495000, 505000, 9505000)],
};
const bytesDe = (t: string) => new TextEncoder().encode(t);
type Par = [number, string | number];
const texto = (pares: Par[]) => pares.map(([c, v]) => `${String(c).padStart(3)}\n${v}`).join('\n') + '\n';
const dxf = (e: Par[]) =>
  bytesDe(texto([[0, 'SECTION'], [2, 'HEADER'], [9, '$ACADVER'], [1, 'AC1027'], [0, 'ENDSEC'], [0, 'SECTION'], [2, 'ENTITIES'], ...e, [0, 'ENDSEC'], [0, 'EOF']]));
const lado = (a: Pt, b: Pt): Par[] => [[0, 'LINE'], [8, 'LINHAMT'], [10, a[0]], [20, a[1]], [11, b[0]], [21, b[1]]];
const etiqueta = (p: Pt): Par[] => [[0, 'TEXT'], [8, 'ETIQ'], [10, p[0]], [20, p[1] + 2], [1, '(1)2AN00438']];
const bloco = (nome: string, p: Pt): Par[] => [[0, 'INSERT'], [8, 'UC'], [2, nome], [10, p[0]], [20, p[1]]];
const obra = (extras: Par[] = []) => dxf([
  ...lado([500010, 9500050], [500050, 9500050]), ...etiqueta([500030, 9500050]),
  ...lado([500050, 9500050], [500110, 9500050]), ...etiqueta([500080, 9500050]),
  ...extras,
]);
const OS = '0000000001';
// PNG mínimo: assinatura e cabeçalho IHDR de 1 x 1
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
const ASSINATURA: Imagem = { bytes: PNG, tipo: 'png', largura: 1, altura: 1 };
const RT: Responsavel = { nome: 'Beltrano Exemplo', registro: '000000', rnp: '0000000000', email: 'rt@exemplo.com', assinatura: ASSINATURA };

let raiz: HTMLElement;
let topo: HTMLElement;
let base: Estado;
let kit: EstadoKit;
let salvos: { nome: string; conteudo: Uint8Array | string }[];

function armazemEmMemoria(): Armazem {
  const dados = new Map<string, unknown>();
  return { guardar: async (k, v) => { dados.set(k, v); }, ler: async (k) => dados.get(k) };
}

async function montar(arquivo: Uint8Array | null = obra(), armazem?: Armazem) {
  base = criarEstado({ lerAreas: async () => BASE, armazem });
  await base.carregarKmz(bytesDe('x'), 'Areas_Rev1.kmz');
  if (arquivo) await base.carregarProjeto(arquivo, 'obra.dxf', OS);
  kit = criarEstadoKit(base, { lerPdf: lerPdfNoNode, armazem });
  criarPainelKit(raiz, kit, base, { salvar: (nome, conteudo) => { salvos.push({ nome, conteudo }); }, topo });
}

const passo = (id: string) => raiz.querySelector<HTMLDetailsElement>(`details.passo[data-passo="${id}"]`)!;
function abrir(id: string) {
  if (!passo(id).hasAttribute('open')) passo(id).querySelector('summary')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return passo(id);
}
const botao = (dentro: ParentNode, rotulo: string): HTMLButtonElement =>
  [...dentro.querySelectorAll('button')].find((b) => b.textContent === rotulo || b.getAttribute('aria-label') === rotulo) as HTMLButtonElement;
// um poste a mais do que a rede nova tem: o vermelho POSTES_NAO_BATEM
const postesErrados = () => {
  const n = postesNovos(base.ler().rede!);
  kit.mudarDados((d) => { d.rede.postes = [{ altura: 11, daN: 300, quantidade: n + 1 }]; });
};
const postesCertos = () => {
  const n = postesNovos(base.ler().rede!);
  kit.mudarDados((d) => { d.rede.postes = [{ altura: 11, daN: 300, quantidade: n }]; });
};
// o input de arquivo não deixa escrever em files: a propriedade é trocada, como faz o navegador ao escolher
function escolherArquivos(entrada: HTMLInputElement, arquivos: { nome: string; bytes: Uint8Array }[]) {
  Object.defineProperty(entrada, 'files', { value: arquivos.map((a) => new File([a.bytes as BlobPart], a.nome)), configurable: true });
  entrada.dispatchEvent(new Event('change', { bubbles: true }));
}
const esperar = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
// espera uma conta assíncrona de verdade (o hash do projeto usa o crypto do sistema)
const ate = async (pronto: () => boolean) => { for (let i = 0; i < 200 && !pronto(); i++) await new Promise((r) => setTimeout(r, 10)); };

beforeEach(() => {
  document.body.innerHTML = '<header id="topo"></header><div id="passos"></div>';
  raiz = document.getElementById('passos')!;
  topo = document.getElementById('topo')!;
  salvos = [];
});

describe('painel da Parte 2: numeração e travas', () => {
  it('os passos 5a, 5b, 6a e 7 entram na numeração e o 8 é o conferir', async () => {
    await montar();
    expect([...raiz.querySelectorAll('details.passo')].map((d) => d.getAttribute('data-passo'))).toEqual(['1', '2', '3', '4', '5', '5a', '5b', '6', '6a', '7', '8']);
    expect(passo('8').textContent).toContain('Conferir um zip');
  });

  it('sem caso os passos 5a a 7 ficam travados; o 8 abre', async () => {
    await montar(null);
    for (const id of ['5a', '5b', '6', '6a', '7']) expect(passo(id).classList.contains('bloqueado')).toBe(true);
    expect(passo('6').querySelector('button')).toBeNull();
    expect(abrir('8').hasAttribute('open')).toBe(true);
  });

  it('do passo 5 em diante, "seguir" abre o próximo passo', async () => {
    await montar();
    botao(raiz, 'Rede confirmada, seguir').click();
    botao(raiz, 'Seguir para o caso').click();
    botao(raiz, 'Seguir para a UC').click();
    expect(passo('5a').hasAttribute('open')).toBe(true);
    botao(passo('5a'), 'Seguir para os dados da obra').click();
    expect(passo('5b').hasAttribute('open')).toBe(true);
    expect(passo('5a').classList.contains('feito')).toBe(true);
  });
});

describe('painel da Parte 2: 5b dados da obra', () => {
  it('o formulário mostra o CEP com o amarelo quando vazio, e o amarelo sai quando se digita', async () => {
    await montar();
    const p = abrir('5b');
    const cep = p.querySelector<HTMLInputElement>('input[data-foco="interessado.cep"]')!;
    expect(cep).not.toBeNull();
    expect(p.querySelector('label[for="interessado.cep"]')!.textContent).toBe('CEP');
    expect([...p.querySelectorAll('.aviso.amarelo')].some((a) => a.textContent!.includes('CEP_VAZIO'))).toBe(true);
    cep.value = '60000-000';
    cep.dispatchEvent(new Event('input', { bubbles: true }));
    expect(kit.ler().dados.interessado.cep).toBe('60000-000');
    expect(passo('5b').textContent).not.toContain('CEP_VAZIO');
    // o campo que a pessoa usa continua com o foco depois do redesenho
    expect(passo('5b').querySelector<HTMLInputElement>('input[data-foco="interessado.cep"]')!.value).toBe('60000-000');
  });

  it('postes que não batem: pílula vermelha na seção Rede e o vermelho no 5b', async () => {
    await montar();
    postesErrados();
    const p = abrir('5b');
    expect(p.textContent).toContain('POSTES_NAO_BATEM');
    expect(p.querySelector('.secao[data-secao="rede"] .pilula.verm')).not.toBeNull();
    postesCertos();
    expect(passo('5b').textContent).not.toContain('POSTES_NAO_BATEM');
  });

  it('empresa e RT ficam na última seção ("Guardado neste computador") e vão ao armazém', async () => {
    await montar(obra(), armazemEmMemoria());
    const p = abrir('5b');
    const secoes = [...p.querySelectorAll('.secao')];
    expect(secoes[secoes.length - 1].querySelector('summary')!.textContent).toContain('Guardado neste computador');
    const campo = (k: string) => p.querySelector<HTMLInputElement>(`input[data-foco="${k}"]`)!;
    campo('empresa.nome').value = 'Empresa Exemplo Ltda';
    campo('empresa.nome').dispatchEvent(new Event('input', { bubbles: true }));
    botao(passo('5b'), 'Guardar a empresa').click();
    await esperar();
    expect(kit.ler().empresa?.nome).toBe('Empresa Exemplo Ltda');
    expect(passo('5b').textContent).toContain('Empresa Exemplo Ltda');
  });
});

describe('painel da Parte 2: 5a UC do cliente', () => {
  it('bloco de UC perto da rede: confirmar mostra a coordenada do memorial', async () => {
    await montar(obra(bloco('UC A IMPLANTAR', [500060, 9500080])));
    const p = abrir('5a');
    expect(p.textContent).toContain('UC A IMPLANTAR');
    botao(p, 'Confirmar a UC 1').click();
    expect(kit.ler().uc?.ponto).toEqual([500060, 9500080]);
    expect(passo('5a').textContent).toContain('(0500060, 9500080)');
    expect(passo('5a').textContent).toContain('UC Inventada');
  });

  it('sem bloco: amarelo e "Marcar no mapa" liga e desliga o modo de clique', async () => {
    await montar();
    const p = abrir('5a');
    expect(p.textContent).toContain('UC_NAO_ACHADA');
    botao(p, 'Marcar no mapa').click();
    expect(kit.ler().escolhendoUc).toBe(true);
    expect(passo('5a').textContent).toContain('Clique no mapa onde fica a UC.');
    botao(passo('5a'), 'Cancelar o clique').click();
    expect(kit.ler().escolhendoUc).toBe(false);
  });
});

describe('painel da Parte 2: 6 baixar', () => {
  it('"Baixar memorial" fica desabilitado sem o caso pronto (árvore sem posição)', async () => {
    await montar();
    base.adicionarFotos([{ nome: 'arvore.jpg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) }]);
    const p = abrir('6');
    expect(botao(p, 'Baixar o memorial em Word').disabled).toBe(true);
  });

  it('com vermelho no caso, aparece "não assinado: corrija os vermelhos"; sem vermelho, assinado', async () => {
    await montar();
    await kit.guardarRt(RT);
    postesErrados();
    let p = abrir('6');
    expect(p.textContent).toContain('não assinado: corrija os vermelhos');
    expect(p.querySelector('.pilula.verm')!.textContent).toBe('não assinado');
    postesCertos();
    p = passo('6');
    expect(p.textContent).not.toContain('não assinado: corrija os vermelhos');
    expect(p.querySelector('.pilula.ok')!.textContent).toBe('assinado');
    // vão novo sem tipo: vermelho no próprio caso
    base.marcarVao(base.ler().rede!.vaos[0].id, { tipo: null });
    expect(passo('6').textContent).toContain('não assinado: corrija os vermelhos');
  });

  it('baixa o memorial em Word com o nome do kit', async () => {
    await montar();
    botao(abrir('6'), 'Baixar o memorial em Word').click();
    expect(salvos.map((s) => s.nome)).toEqual([`${OS} MEMORIAL DESCRITIVO.docx`]);
  });
});

describe('painel da Parte 2: 6a figuras', () => {
  it('soltar "Figura 2.jpg" mostra "Figura 2 ← Figura 2.jpg"; o baixar trava até "Conferi"', async () => {
    await montar();
    const p = abrir('6a');
    escolherArquivos(p.querySelector<HTMLInputElement>('input[type="file"]')!, [{ nome: 'Figura 2.jpg', bytes: PNG }]);
    await esperar();
    expect(passo('6a').textContent).toContain('Figura 2 ← Figura 2.jpg');
    const baixar = () => botao(passo('6a'), 'Baixar o memorial com as figuras');
    expect(baixar().disabled).toBe(true);
    const conferi = () => passo('6a').querySelector<HTMLInputElement>('input[type="checkbox"][data-foco="conferi-figuras"]')!;
    conferi().checked = true;
    conferi().dispatchEvent(new Event('change', { bubbles: true }));
    expect(baixar().disabled).toBe(false);
    baixar().click();
    expect(salvos.map((s) => s.nome)).toEqual([`${OS} MEMORIAL DESCRITIVO.docx`]);
    // outra imagem: o "Conferi" volta a desmarcado
    escolherArquivos(passo('6a').querySelector<HTMLInputElement>('input[type="file"]')!, [{ nome: 'print.png', bytes: PNG }]);
    await esperar();
    expect(conferi().checked).toBe(false);
    expect(baixar().disabled).toBe(true);
  });
});

describe('painel da Parte 2: 7 montar o kit', () => {
  it('"Montar o kit" com vermelho mostra a lista e não baixa', async () => {
    await montar();
    postesCertos();
    const p = abrir('7');
    escolherArquivos(p.querySelector<HTMLInputElement>('input[type="file"]')!, [{ nome: 'ART contrato.pdf', bytes: new Uint8Array([1]) }]);
    await esperar();
    botao(passo('7'), 'Conferir e montar o kit').click();
    await esperar();
    expect(passo('7').querySelector('.item.vermelho')!.textContent).toContain(TEXTOS_ESTADO_KIT.semRegional);
    expect(salvos).toEqual([]);
    expect(botao(passo('7'), 'Baixar o kit').disabled).toBe(true);
  });

  it('arquivo sem papel fica no alto e trava; escolher o papel libera e atualiza o resumo do passo', async () => {
    await montar();
    const p = abrir('7');
    escolherArquivos(p.querySelector<HTMLInputElement>('input[type="file"]')!, [
      { nome: 'desenho final.dwg', bytes: new Uint8Array([1]) },
      { nome: 'ART contrato.pdf', bytes: new Uint8Array([1]) },
    ]);
    await esperar();
    const q = passo('7');
    expect(q.querySelector('.sem-papel')!.textContent).toContain('desenho final.dwg');
    expect(q.querySelector('details.secao')!.hasAttribute('open')).toBe(false);
    expect(botao(q, 'Conferir e montar o kit').disabled).toBe(true);
    expect(q.querySelector('summary small')!.textContent).toBe('2 arquivos soltos · 1 sem papel');
    const sel = q.querySelector<HTMLSelectElement>('.sem-papel select')!;
    sel.value = 'cad-dwg';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const r = passo('7');
    expect(kit.ler().soltos.find((s) => s.nome === 'desenho final.dwg')?.papel).toBe('cad-dwg');
    expect(botao(r, 'Conferir e montar o kit').disabled).toBe(false);
    expect(r.querySelector('summary small')!.textContent).toBe('2 arquivos soltos · 0 sem papel');
    expect(r.textContent).toContain('Todos os arquivos têm papel');
  });
});

describe('painel da Parte 2: caso salvo no topo', () => {
  it('"Salvar o caso" entrega o .kitambiental; abrir com outro projeto mostra só o amarelo', async () => {
    await montar();
    botao(topo, 'Salvar o caso').click();
    await ate(() => salvos.length > 0);
    expect(salvos.map((s) => s.nome)).toEqual([`${OS}.kitambiental`]);
    const salvo = salvos[0].conteudo as string;
    await montar(obra([[0, 'POINT'], [8, 'NOTA'], [10, 500500], [20, 9500500]]));
    escolherArquivos(topo.querySelector<HTMLInputElement>('input[type="file"]')!, [{ nome: `${OS}.kitambiental`, bytes: bytesDe(salvo) }]);
    await ate(() => (topo.textContent ?? '').includes('CASO_OUTRO_PROJETO'));
    expect(topo.textContent).toContain('CASO_OUTRO_PROJETO');
    expect(topo.querySelector('.aviso.amarelo input[type="checkbox"]')).toBeNull();
  });
});

describe('cores da rede na tela (iguais às figuras)', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/tela/estilo.css'), 'utf8');
  const regra = (seletor: string): string => {
    const i = css.indexOf(`${seletor} {`);
    return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
  };

  it('MT vermelha, BT verde e conjugada azul', () => {
    expect(css).toMatch(/--mt: #ff5d5d;/);
    expect(css).toMatch(/--bt: #3f8f2a;/);
    expect(css).toMatch(/--conj: #4cc9f0;/);
  });

  it('cada legenda sai com a cor da rede: MT, BT e conjugada no passo 3 e no mapa (cor calculada pela cascata)', async () => {
    // o estilo de verdade na página e a legenda do mapa do index.html; o happy-dom resolve a cascata e o var()
    const estilo = document.createElement('style');
    estilo.textContent = css;
    document.head.replaceChildren(estilo);
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const camadas = html.slice(html.indexOf('<div class="camadas"'), html.indexOf('</div>', html.indexOf('<div class="camadas"')) + 6);
    const mapa = document.createElement('div');
    mapa.innerHTML = camadas;
    document.body.append(mapa);
    await montar(); // o passo 3 abre com a legenda das cores
    const cor = (onde: ParentNode, classe: string) => {
      const i = onde.querySelector<HTMLElement>(`i.${classe}`);
      expect(i, classe).not.toBeNull();
      return getComputedStyle(i!).borderTopColor.toLowerCase();
    };
    const esperado = { 'c-mt': '#ff5d5d', 'c-bt': '#3f8f2a', 'c-conj': '#4cc9f0' };
    for (const [onde, el] of [['passo 3', passo('3').querySelector('.legenda')!], ['mapa', mapa.querySelector('.camadas')!]] as const) {
      for (const [classe, hex] of Object.entries(esperado)) expect(cor(el, classe), `${onde} ${classe}`).toBe(hex);
    }
    // a prova não é falso verde: uma cor cinza na regra da legenda faz a cor mudar
    estilo.textContent = `${css}\n.legenda i { border-top-color: #aab3bd; }\n.camadas .l i { border-color: #aab3bd; }`;
    expect(cor(passo('3').querySelector('.legenda')!, 'c-bt')).not.toBe('#3f8f2a');
    expect(cor(mapa.querySelector('.camadas')!, 'c-bt')).not.toBe('#3f8f2a');
    document.head.replaceChildren();
  });

  it('o texto da pílula de BT é preto sobre o verde (5,17:1)', () => {
    expect(regra('.tipo.bt')).toMatch(/color: #000;/);
  });
});

describe('painel da Parte 2: correções da rodada 1', () => {
  const PNG_2X2 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 2, 8, 2, 0, 0, 0]);
  const conferi = () => passo('6a').querySelector<HTMLInputElement>('input[type="checkbox"][data-foco="conferi-figuras"]')!;
  const marcarConferi = () => { conferi().checked = true; conferi().dispatchEvent(new Event('change', { bubbles: true })); };
  const soltarNo6a = async (nome: string, bytes: Uint8Array) => {
    escolherArquivos(abrir('6a').querySelector<HTMLInputElement>('input[type="file"]')!, [{ nome, bytes }]);
    await esperar();
  };

  it('o passo 6 baixa o memorial sem as imagens do 6a; só o 6a, com "Conferi", põe as imagens', async () => {
    await montar();
    await soltarNo6a('Figura 2.jpg', PNG);
    botao(abrir('6'), 'Baixar o memorial em Word').click();
    const marca = '[PREENCHER: solte a imagem da Figura 2 no site]';
    expect(textoDoDocx(salvos[0].conteudo as Uint8Array)).toContain(marca);
    expect(passo('6').textContent).toContain('Ainda sem as imagens: elas entram no passo 6a.');
    marcarConferi();
    botao(passo('6a'), 'Baixar o memorial com as figuras').click();
    expect(textoDoDocx(salvos[1].conteudo as Uint8Array)).not.toContain(marca);
  });

  it('soltar de novo a MESMA imagem (mesmo nome, outros bytes) desmarca o "Conferi"', async () => {
    await montar();
    await soltarNo6a('Figura 2.jpg', PNG);
    marcarConferi();
    expect(conferi().checked).toBe(true);
    await soltarNo6a('Figura 2.jpg', PNG_2X2);
    expect(conferi().checked).toBe(false);
    expect(botao(passo('6a'), 'Baixar o memorial com as figuras').disabled).toBe(true);
  });

  it('mudar os dados depois de baixar a planilha: os avisos dela saem e a tela pede para baixar de novo', async () => {
    await montar();
    await kit.carregarPlanilha(planilhaInventada({ linhaCabecalho: 4 }), 'Planilha Inventada_REV 09_20.03.2026.xlsm');
    botao(abrir('6'), 'Baixar a Planilha Padrão preenchida').click();
    const codigos = () => [...passo('6').querySelectorAll('.aviso .cod')].map((c) => c.textContent).filter((c) => c!.startsWith('PLANILHA_'));
    expect(codigos().length).toBeGreaterThan(0);
    // o CEP digitado no 5b (pela tela, como a pessoa faz)
    const cep = abrir('5b').querySelector<HTMLInputElement>('input[data-foco="interessado.cep"]')!;
    cep.value = '60000-000';
    cep.dispatchEvent(new Event('input', { bubbles: true }));
    expect(codigos()).toEqual([]);
    expect(passo('6').querySelector('.baixa .selos')!.textContent).not.toMatch(/para escolher/);
    expect(passo('6').textContent).toContain('baixe a planilha de novo');
  });

  it('outro caso aberto: os avisos da planilha e a conferência do passo 8 saem da tela', async () => {
    await montar();
    await kit.carregarPlanilha(planilhaInventada({ linhaCabecalho: 4 }), 'Planilha Inventada_REV 09_20.03.2026.xlsm');
    botao(abrir('6'), 'Baixar a Planilha Padrão preenchida').click();
    escolherArquivos(abrir('8').querySelector<HTMLInputElement>('input[type="file"]')!, [{ nome: 'kit.zip', bytes: montarZip([{ caminho: 'a.txt', bytes: bytesDe('x') }]) }]);
    await ate(() => passo('8').querySelectorAll('.item').length > 0);
    const salvo = await kit.salvarCaso();
    await kit.abrirCaso(salvo.texto);
    expect([...abrir('6').querySelectorAll('.aviso .cod')].some((c) => c.textContent!.startsWith('PLANILHA_'))).toBe(false);
    expect(abrir('8').querySelectorAll('.item')).toHaveLength(0);
  });

  it('outro projeto aberto: avisos da planilha, conferência do passo 8, seções abertas e arquivos escolhidos saem da tela', async () => {
    await montar();
    await kit.carregarPlanilha(planilhaInventada({ linhaCabecalho: 4 }), 'Planilha Inventada_REV 09_20.03.2026.xlsm');
    botao(abrir('6'), 'Baixar a Planilha Padrão preenchida').click();
    // passo 8 com um zip qualquer
    escolherArquivos(abrir('8').querySelector<HTMLInputElement>('input[type="file"]')!, [{ nome: 'kit.zip', bytes: montarZip([{ caminho: 'a.txt', bytes: bytesDe('x') }]) }]);
    await ate(() => passo('8').querySelectorAll('.item').length > 0);
    // passo 7: um arquivo sem papel escolhido à mão fica no alto; a seção dos reconhecidos aberta
    escolherArquivos(abrir('7').querySelector<HTMLInputElement>('input[type="file"]')!, [
      { nome: 'desenho final.dwg', bytes: new Uint8Array([1]) }, { nome: 'ART contrato.pdf', bytes: new Uint8Array([1]) },
    ]);
    await esperar();
    const sel = passo('7').querySelector<HTMLSelectElement>('.sem-papel select')!;
    sel.value = 'cad-dwg';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const sec = passo('7').querySelector<HTMLDetailsElement>('details.secao[data-secao="reconhecidos"]')!;
    sec.open = true;
    sec.dispatchEvent(new Event('toggle'));
    expect(passo('7').querySelector('.lista > .solto .orig')!.textContent).toBe('desenho final.dwg');

    await base.carregarProjeto(obra([[0, 'POINT'], [8, 'NOTA'], [10, 500500], [20, 9500500]]), 'outra.dxf', OS);
    expect([...abrir('6').querySelectorAll('.aviso .cod')].some((c) => c.textContent!.startsWith('PLANILHA_'))).toBe(false);
    expect(abrir('8').querySelectorAll('.item')).toHaveLength(0);
    expect(passo('8').querySelector('summary small')!.textContent).toBe('kit feito fora do site, antes de mandar ao órgão');
    const p7 = abrir('7');
    expect(p7.querySelector('details.secao[data-secao="reconhecidos"]')!.hasAttribute('open')).toBe(false);
    expect([...p7.querySelectorAll(':scope .corpo > .lista > .solto .orig')].map((x) => x.textContent)).not.toContain('desenho final.dwg');
  });
});
