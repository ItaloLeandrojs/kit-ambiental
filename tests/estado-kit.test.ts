import { describe, expect, it } from 'vitest';
import { criarEstado, type Armazem, type Estado } from '../src/tela/estado.ts';
import { criarEstadoKit } from '../src/tela/estado-kit.ts';
import { dadosVazios, metrosDaRede, postesNovos, type Empresa, type Imagem, type Responsavel } from '../src/nucleo/obra.ts';
import { assuntoTexto, partesDoAssunto } from '../src/nucleo/assunto.ts';
import { textoDoDocx } from '../src/nucleo/docx.ts';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas.ts';
import type { Pt } from '../src/nucleo/tipos.ts';
import { TEXTOS_CASO_SALVO, TEXTOS_ESTADO_KIT, TEXTOS_MEMORIAL } from '../src/regras/textos-memorial.ts';
import { lerPdfNoNode, pdfDeTexto } from './ajuda/pdf-simples.ts';
import { planilhaInventada } from './ajuda/planilha-inventada.ts';
import { lerPlanilha } from '../src/nucleo/planilha.ts';
import { gravarCelulas, gravarXlsx, lerCelulas } from '../src/nucleo/xlsx.ts';
import { abrirZip, montarZip } from '../src/nucleo/zip.ts';
import type { ItemConferencia } from '../src/nucleo/conferir.ts';

// tudo inventado, perto de (500000, 9500000), no jeito de tests/estado.test.ts
const retangulo = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const area = (id: number, nome: string, pasta: string[], x0: number, y0: number, x1: number, y1: number): AreaProtegida => ({
  id, nome, pasta, atributos: {}, poligonos: [[retangulo(x0, y0, x1, y1)]], linhas: [], caixa: [x0, y0, x1, y1],
});
const UC_AREA = area(1, 'UC Inventada', ['Unidade de Conservação Estadual', 'Uso Sustentável'], 500000, 9500000, 500200, 9500100);
const BASE: BaseAreas = {
  revisao: '1', data: '01/01/2024', areas: [UC_AREA],
  municipios: [area(2, 'Cidade Teste', ['Municípios_CE'], 495000, 9495000, 505000, 9505000)],
};
const lerBase = async () => BASE;
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
const DXF_OBRA = obra();
const DXF_COM_UC = obra(bloco('UC A IMPLANTAR', [500060, 9500080]));
const OS = '0000000001';

function armazemEmMemoria(): Armazem & { dados: Map<string, unknown> } {
  const dados = new Map<string, unknown>();
  return {
    dados,
    guardar: async (k, v) => { dados.set(k, v); },
    ler: async (k) => dados.get(k),
  };
}

async function comProjeto(arquivo = DXF_OBRA, armazem?: Armazem): Promise<Estado> {
  const e = criarEstado({ lerAreas: lerBase, armazem });
  await e.carregarKmz(bytesDe('x'), 'Areas_Rev1.kmz');
  await e.carregarProjeto(arquivo, 'obra.dxf', OS);
  return e;
}

const png: Imagem = { bytes: new Uint8Array([1, 2, 3]), tipo: 'png', largura: 40, altura: 20 };
const EMPRESA: Empresa = { nome: 'Empresa Exemplo Ltda', cnpj: '00.000.000/0001-00', endereco: 'Rua Exemplo, 1', municipio: 'Cidade Exemplo', telefone: '(00) 0000-0000', email: 'contato@exemplo.com', logo: null };
const RT: Responsavel = { nome: 'Beltrano Exemplo', registro: '000000', rnp: '0000000000', email: 'rt@exemplo.com', assinatura: png };

// postes por tipo somando os postes novos da rede: sem isso os dados têm o vermelho POSTES_NAO_BATEM
function postesCertos(base: Estado) {
  const n = postesNovos(base.ler().rede!);
  return n > 0 ? [{ altura: 11, daN: 300, quantidade: n }] : [];
}

describe('estado da Parte 2: armazém', () => {
  it('a empresa guardada volta num estado novo; os dados da obra começam vazios', async () => {
    const armazem = armazemEmMemoria();
    const base = await comProjeto(DXF_OBRA, armazem);
    const kit = criarEstadoKit(base, { armazem, lerPdf: lerPdfNoNode });
    await kit.guardarEmpresa(EMPRESA);
    await kit.guardarRt(RT);

    const outro = criarEstadoKit(await comProjeto(DXF_OBRA, armazem), { armazem, lerPdf: lerPdfNoNode });
    expect(outro.ler().empresa).toBeNull();
    await outro.iniciar();
    expect(outro.ler().empresa).toEqual(EMPRESA);
    expect(outro.ler().rt).toEqual(RT);
    expect(outro.ler().dados).toEqual(dadosVazios());
  });

  it('a planilha guardada é o arquivo original e é lida de novo ao iniciar', async () => {
    const armazem = armazemEmMemoria();
    const kit = criarEstadoKit(await comProjeto(DXF_OBRA, armazem), { armazem, lerPdf: lerPdfNoNode });
    await kit.carregarPlanilha(planilhaInventada({ linhaCabecalho: 4 }), 'Planilha Inventada_REV 09_20.03.2026.xlsm');
    expect(kit.ler().planilha).toEqual({ nome: 'Planilha Inventada_REV 09_20.03.2026.xlsm', revisao: 'REV 09 · 20/03/2026' });

    const outro = criarEstadoKit(await comProjeto(DXF_OBRA, armazem), { armazem, lerPdf: lerPdfNoNode });
    await outro.iniciar();
    expect(outro.ler().planilha?.nome).toBe('Planilha Inventada_REV 09_20.03.2026.xlsm');
    const p = outro.baixarPlanilha();
    expect(p.nome.startsWith(`SOB ${OS}_`)).toBe(true);
    expect(p.bytes.length).toBeGreaterThan(0);
  });

  it('planilha que não é a da Enel fica no erroPlanilha e não vai ao armazém', async () => {
    const armazem = armazemEmMemoria();
    const kit = criarEstadoKit(await comProjeto(DXF_OBRA, armazem), { armazem, lerPdf: lerPdfNoNode });
    await kit.carregarPlanilha(bytesDe('lixo'), 'lixo.xlsx');
    expect(kit.ler().erroPlanilha).not.toBeNull();
    expect(kit.ler().planilha).toBeNull();
    expect(armazem.dados.has('planilha')).toBe(false);
  });

  it('os dados do cliente não vão ao armazém: só empresa, rt, planilha e as chaves da Parte 1', async () => {
    const armazem = armazemEmMemoria();
    const base = await comProjeto(DXF_OBRA, armazem);
    const kit = criarEstadoKit(base, { armazem, lerPdf: lerPdfNoNode });
    await kit.guardarEmpresa(EMPRESA);
    await kit.guardarRt(RT);
    await kit.carregarPlanilha(planilhaInventada({ linhaCabecalho: 4 }), 'Planilha Inventada_REV 09.xlsm');
    kit.mudarDados((d) => {
      d.interessado = { nome: 'Fulano de Tal', endereco: 'Sítio Inventado, s/n', bairro: 'Zona rural', cep: '00000-000' };
      d.obra.endereco = 'Estrada Inventada';
    });
    kit.marcarUcNoMapa();
    kit.clicarNoMapa([500060, 9500080]);
    await kit.salvarCaso();
    expect(kit.ler().dados.interessado.nome).toBe('Fulano de Tal');

    const chaves = [...armazem.dados.keys()];
    for (const k of chaves) expect(['empresa', 'rt', 'planilha', 'base', 'malha-DNIT', 'malha-SOP', 'malha-FERROVIA']).toContain(k);
    expect(chaves).toEqual(expect.arrayContaining(['empresa', 'rt', 'planilha']));
    const tudo = JSON.stringify([...armazem.dados.entries()].map(([k, v]) => [k, k === 'planilha' ? (v as { nome: string }).nome : v]));
    expect(tudo).not.toContain('Fulano de Tal');
    expect(tudo).not.toContain('Estrada Inventada');
  });
});

describe('estado da Parte 2: UC', () => {
  it('bloco de UC perto da rede: um candidato, e escolherUc(0) preenche a UC', async () => {
    const kit = criarEstadoKit(await comProjeto(DXF_COM_UC), { lerPdf: lerPdfNoNode });
    expect(kit.ler().candidatosUc).toHaveLength(1);
    expect(kit.ler().uc).toBeNull();
    kit.escolherUc(0);
    expect(kit.ler().uc?.ponto).toEqual([500060, 9500080]);
    expect(kit.ler().uc?.dentro.map((a) => a.nome)).toEqual(['UC Inventada']);
  });

  it('sem bloco: marcarUcNoMapa e o clique preenchem e devolvem true; sem o modo, o clique é da Parte 1', async () => {
    const kit = criarEstadoKit(await comProjeto(DXF_OBRA), { lerPdf: lerPdfNoNode });
    expect(kit.ler().candidatosUc).toEqual([]);
    expect(kit.clicarNoMapa([500300, 9500300])).toBe(false);
    kit.marcarUcNoMapa();
    expect(kit.ler().escolhendoUc).toBe(true);
    expect(kit.clicarNoMapa([500300, 9500300])).toBe(true);
    expect(kit.ler().escolhendoUc).toBe(false);
    expect(kit.ler().uc?.ponto).toEqual([500300, 9500300]);
    expect(kit.ler().uc?.dentro).toEqual([]);
    expect(kit.clicarNoMapa([500301, 9500301])).toBe(false);
  });

  it('outro projeto aberto: a UC de antes some', async () => {
    const base = await comProjeto(DXF_OBRA);
    const kit = criarEstadoKit(base, { lerPdf: lerPdfNoNode });
    kit.marcarUcNoMapa();
    kit.clicarNoMapa([500300, 9500300]);
    await base.carregarProjeto(DXF_COM_UC, 'outra.dxf', OS);
    expect(kit.ler().uc).toBeNull();
    expect(kit.ler().candidatosUc).toHaveLength(1);
  });
});

describe('estado da Parte 2: assinatura e memorial', () => {
  it('caso com vermelho: assinar é false e o memorial tem a nota de não assinado', async () => {
    const base = await comProjeto(DXF_OBRA);
    const kit = criarEstadoKit(base, { lerPdf: lerPdfNoNode });
    await kit.guardarRt(RT);
    kit.mudarDados((d) => { d.rede.postes = postesCertos(base); });
    expect(kit.ler().assinar).toBe(true);
    const assinado = kit.baixarMemorial();
    expect(assinado.nome).toBe(`${OS} MEMORIAL DESCRITIVO.docx`);
    expect(textoDoDocx(assinado.bytes)).not.toContain(TEXTOS_MEMORIAL.naoAssinado);

    // vão novo sem tipo: vermelho no caso
    base.marcarVao(base.ler().rede!.vaos[0].id, { tipo: null });
    expect(base.ler().caso?.avisos.some((a) => a.nivel === 'vermelho')).toBe(true);
    expect(kit.ler().assinar).toBe(false);
    expect(textoDoDocx(kit.baixarMemorial().bytes)).toContain(TEXTOS_MEMORIAL.naoAssinado);
  });

  it('vermelho nos dados (postes que não batem) também tira a assinatura', async () => {
    const base = await comProjeto(DXF_OBRA);
    const kit = criarEstadoKit(base, { lerPdf: lerPdfNoNode });
    await kit.guardarRt(RT);
    kit.mudarDados((d) => { d.rede.postes = [{ altura: 11, daN: 300, quantidade: postesNovos(base.ler().rede!) + 1 }]; });
    expect(kit.ler().avisosDados.some((a) => a.codigo === 'POSTES_NAO_BATEM' && a.nivel === 'vermelho')).toBe(true);
    expect(kit.ler().assinar).toBe(false);
  });

  it('RT sem assinatura (ou apagada) não assina', async () => {
    const base = await comProjeto(DXF_OBRA);
    const kit = criarEstadoKit(base, { lerPdf: lerPdfNoNode });
    await kit.guardarRt(RT);
    kit.mudarDados((d) => { d.rede.postes = postesCertos(base); });
    await kit.apagarAssinatura();
    expect(kit.ler().rt?.assinatura).toBeNull();
    expect(kit.ler().assinar).toBe(false);
  });

  // revisão final (I2): a nota diz o motivo certo e leva a marca que a conferência do passo 7 acha
  it('sem a imagem guardada e sem vermelho: o memorial pede a assinatura com [PREENCHER] e não fala de vermelhos', async () => {
    const base = await comProjeto(DXF_OBRA);
    const kit = criarEstadoKit(base, { lerPdf: lerPdfNoNode });
    await kit.guardarRt({ ...RT, assinatura: null });
    kit.mudarDados((d) => { d.rede.postes = postesCertos(base); });
    expect(kit.ler().assinar).toBe(false);
    const t = textoDoDocx(kit.baixarMemorial().bytes);
    expect(t).toContain(TEXTOS_MEMORIAL.semAssinatura);
    expect(t).toContain('[PREENCHER: assinatura');
    expect(t).toContain('5b');
    expect(t).not.toContain('corrija os vermelhos');
    // com vermelho, a nota é a dos vermelhos, também com a marca
    base.marcarVao(base.ler().rede!.vaos[0].id, { tipo: null });
    const v = textoDoDocx(kit.baixarMemorial().bytes);
    expect(v).toContain(TEXTOS_MEMORIAL.naoAssinado);
    expect(v).toContain('[PREENCHER: assinatura');
  });

  it('as figuras saem do caso e a associação fica no retrato depois de soltar as imagens', async () => {
    const base = await comProjeto(DXF_OBRA);
    const kit = criarEstadoKit(base, { lerPdf: lerPdfNoNode });
    expect(kit.ler().figuras.map((f) => f.numero)).toEqual([1, 2, 3]);
    // PNG mínimo: assinatura e cabeçalho IHDR de 1 x 1
    const pngMinimo = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
    kit.soltarImagens([{ nome: 'Figura 2.png', bytes: pngMinimo }]);
    expect(kit.ler().associacoes).toEqual([{ figura: 2, arquivo: 'Figura 2.png', erro: null }]);
    expect(kit.baixarFiguras().nome).toBe(`${OS} FIGURAS.kmz`);
  });
});

describe('estado da Parte 2: kit completo', { timeout: 30000 }, () => {
  const falso = new Uint8Array([1, 2, 3]);
  const memorial = pdfDeTexto([['Memorial descritivo inventado da OS 0000000001']]);

  it('montarKit sem a ART devolve null e a conferência tem o vermelho', async () => {
    const base = await comProjeto(DXF_OBRA);
    const kit = criarEstadoKit(base, { lerPdf: lerPdfNoNode });
    kit.mudarDados((d) => { d.regional = 'LESTE'; d.rede.postes = postesCertos(base); });
    kit.soltarArquivos([
      { nome: 'memorial descritivo.pdf', bytes: memorial },
      { nome: 'cvt.pdf', bytes: falso },
      { nome: 'projeto.dwg', bytes: falso },
      { nome: 'CAD obra.pdf', bytes: falso },
      { nome: 'planta georref.dwg', bytes: falso },
      { nome: 'planta georref.pdf', bytes: falso },
      { nome: 'SOB 0000000001_Planilha Inventada_REV 09.xlsm', bytes: planilhaInventada({ linhaCabecalho: 4 }) },
      { nome: 'SOB 0000000001_Planilha Inventada_REV 09.pdf', bytes: falso },
    ]);
    expect(kit.ler().soltos.every((s) => s.papel !== null)).toBe(true);
    expect(await kit.montarKit()).toBeNull();
    const c = kit.ler().conferencia!;
    expect(c.some((i) => i.nivel === 'vermelho' && i.titulo === 'Falta: ART')).toBe(true);
    expect(kit.ler().ocupado).toBe(false);
  });

  // revisão final (I3): o vermelho que tira a assinatura também trava o kit
  it('vermelho nos dados da obra (postes que não batem) trava o "Conferir e montar o kit"', async () => {
    const base = await comProjeto(DXF_OBRA);
    const kit = criarEstadoKit(base, { lerPdf: lerPdfNoNode });
    kit.mudarDados((d) => { d.regional = 'LESTE'; d.rede.postes = [{ altura: 11, daN: 300, quantidade: postesNovos(base.ler().rede!) + 1 }]; });
    expect(kit.ler().avisosDados.some((a) => a.codigo === 'POSTES_NAO_BATEM' && a.nivel === 'vermelho')).toBe(true);
    kit.soltarArquivos([{ nome: 'memorial descritivo.pdf', bytes: memorial }]);
    expect(await kit.montarKit()).toBeNull();
    expect(kit.ler().erro).toBe(TEXTOS_ESTADO_KIT.vermelhoAntesDoKit);
    expect(kit.ler().conferencia).toBeNull();
  });

  it('arquivo sem papel trava o kit até o projetista dizer o que é', async () => {
    const base = await comProjeto(DXF_OBRA);
    const kit = criarEstadoKit(base, { lerPdf: lerPdfNoNode });
    kit.mudarDados((d) => { d.regional = 'LESTE'; d.rede.postes = postesCertos(base); });
    kit.soltarArquivos([{ nome: 'documento.pdf', bytes: falso }]);
    expect(kit.ler().soltos[0].papel).toBeNull();
    expect(await kit.montarKit()).toBeNull();
    expect(kit.ler().conferencia).toEqual([expect.objectContaining({ nivel: 'vermelho', titulo: TEXTOS_ESTADO_KIT.papelFaltando, arquivos: ['documento.pdf'] })]);
    kit.mudarPapel('documento.pdf', 'art');
    expect(kit.ler().soltos[0].papel).toBe('art');
    expect(kit.ler().conferencia).toBeNull();
  });

  it('conferirZip (passo 8) com um zip qualquer não estoura e diz que não é zip', async () => {
    const kit = criarEstadoKit(criarEstado({ lerAreas: lerBase }), { lerPdf: lerPdfNoNode });
    const itens = await kit.conferirZip(bytesDe('isto não é zip'));
    expect(itens.some((i) => i.nivel === 'vermelho')).toBe(true);
  });
});

describe('estado da Parte 2: caso salvo', () => {
  it('salvar e abrir de novo repõe dados, UC, marcas e árvores, sem amarelo', async () => {
    const base = await comProjeto(DXF_OBRA);
    const kit = criarEstadoKit(base, { lerPdf: lerPdfNoNode });
    kit.mudarDados((d) => { d.interessado.nome = 'Fulano de Tal'; d.regional = 'NORTE'; });
    kit.marcarUcNoMapa();
    kit.clicarNoMapa([500300, 9500300]);
    const vao = base.ler().rede!.vaos[0].id;
    base.marcarVao(vao, { tipo: 'BT' });
    const [id] = base.adicionarFotos([{ nome: 'arvore.jpg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) }]);
    base.colocarArvore(id);
    base.clicarNoMapa([500040, 9500060]);
    base.mudarArvore(id, { especie: 'Mangueira' });
    const salvo = await kit.salvarCaso();
    expect(salvo.nome).toBe(`${OS}.kitambiental`);

    const base2 = await comProjeto(DXF_OBRA);
    const kit2 = criarEstadoKit(base2, { lerPdf: lerPdfNoNode });
    let avisos = 0;
    kit2.aoMudar(() => { avisos++; });
    await kit2.abrirCaso(salvo.texto);
    expect(kit2.ler().erro).toBeNull();
    expect(avisos).toBe(1);
    expect(kit2.ler().dados.interessado.nome).toBe('Fulano de Tal');
    expect(kit2.ler().dados.regional).toBe('NORTE');
    expect(kit2.ler().uc?.ponto).toEqual([500300, 9500300]);
    expect(kit2.ler().avisosDados.some((a) => a.codigo === 'CASO_OUTRO_PROJETO')).toBe(false);
    expect(base2.ler().rede!.vaos.find((v) => v.id === vao)?.tipo).toBe('BT');
    expect(base2.ler().arvores).toEqual([expect.objectContaining({ id, especie: 'Mangueira', ponto: [500040, 9500060] })]);
    // a próxima foto não repete o id da árvore reposta
    expect(base2.adicionarFotos([{ nome: 'outra.jpg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) }])).not.toContain(id);
  });

  it('abrirCaso com hash diferente do projeto aberto mostra o amarelo', async () => {
    const kit = criarEstadoKit(await comProjeto(DXF_OBRA), { lerPdf: lerPdfNoNode });
    const salvo = await kit.salvarCaso();
    const kit2 = criarEstadoKit(await comProjeto(obra([[0, 'POINT'], [8, 'NOTA'], [10, 500500], [20, 9500500]])), { lerPdf: lerPdfNoNode });
    await kit2.abrirCaso(salvo.texto);
    const amarelo = kit2.ler().avisosDados.find((a) => a.codigo === 'CASO_OUTRO_PROJETO');
    expect(amarelo?.nivel).toBe('amarelo');
    expect(amarelo?.texto).toBe('este caso foi salvo com outro arquivo de projeto; confira a rede');
    expect(kit2.ler().erro).toBeNull();
  });

  // revisão final (I4): a liberação da etiqueta longe só volta com o mesmo arquivo de projeto
  it('abrirCaso de outro arquivo não repõe a liberação da etiqueta; com o mesmo arquivo, repõe', async () => {
    const longe = (dist: number) => dxf([
      ...lado([500010, 9500050], [500050, 9500050]), ...etiqueta([500030, 9500050]),
      [0, 'MTEXT'], [8, 'ETIQ'], [10, 500010], [20, 9500050], [1, `(1)1234/12\\P(${String(500010 + dist).padStart(7, '0')}, 9500050)`],
    ]);
    const base = await comProjeto(longe(3000));
    expect(base.ler().bloqueio?.codigo).toBe('ETIQUETA_LONGE');
    base.liberarEtiqueta(true);
    const salvo = await criarEstadoKit(base, { lerPdf: lerPdfNoNode }).salvarCaso();
    expect(JSON.parse(salvo.texto).liberado).toBe(true);

    const outra = await comProjeto(longe(4000));
    await criarEstadoKit(outra, { lerPdf: lerPdfNoNode }).abrirCaso(salvo.texto);
    expect(outra.ler().liberado).toBe(false);
    expect(outra.ler().bloqueio?.codigo).toBe('ETIQUETA_LONGE');

    const mesma = await comProjeto(longe(3000));
    await criarEstadoKit(mesma, { lerPdf: lerPdfNoNode }).abrirCaso(salvo.texto);
    expect(mesma.ler().liberado).toBe(true);
    expect(mesma.ler().bloqueio).toBeNull();
  });

  it('arquivo que não é caso, ou malformado por dentro, vira erro em português, sem exceção', async () => {
    const kit = criarEstadoKit(await comProjeto(DXF_OBRA), { lerPdf: lerPdfNoNode });
    await expect(kit.abrirCaso('{"x": 1')).resolves.toBeUndefined();
    expect(kit.ler().erro).toBe(TEXTOS_CASO_SALVO.naoEhCaso);
    const bom = JSON.parse((await kit.salvarCaso()).texto);
    await kit.abrirCaso(JSON.stringify({ ...bom, arvores: [{ id: 1 }] }));
    expect(kit.ler().erro).toBe(TEXTOS_CASO_SALVO.naoEhCaso);
    await kit.abrirCaso(JSON.stringify({ ...bom, versao: 2 }));
    expect(kit.ler().erro).toBe(TEXTOS_CASO_SALVO.versaoNova);
  });

  it('sem projeto aberto, abrirCaso pede o projeto', async () => {
    const kit = criarEstadoKit(criarEstado({ lerAreas: lerBase }), { lerPdf: lerPdfNoNode });
    await kit.abrirCaso('{}');
    expect(kit.ler().erro).toBe(TEXTOS_CASO_SALVO.semProjeto);
  });
});

// ---------- rodada 1 da revisão ----------

const planilhaComA1 = (a1: string): Uint8Array => {
  const p = lerPlanilha(planilhaInventada({ linhaCabecalho: 4 }), 'Planilha Inventada_REV 09.xlsm');
  return gravarXlsx(gravarCelulas(p.pasta, p.aba, { A1: { t: 'texto', v: a1 } }));
};
// memorial inventado com mais de 200 letras (o pdf.js só conta como texto acima disso)
const memorialInventado = (os: string): Uint8Array => pdfDeTexto([[
  'MEMORIAL DESCRITIVO INVENTADO PARA TESTE',
  `Obra da SOB ${os}, no município de Cidade Teste, para atender a unidade consumidora do interessado.`,
  'Serão construídos 100 metros de rede de média tensão com cabo inventado, em postes de concreto.',
  'Não haverá poda de árvores. Não haverá supressão de vegetação. Não haverá limpeza de faixa.',
  'A obra não está inserida em nenhuma área protegida e não haverá abertura de vias de acesso.',
]]);
const codigos = (itens: ItemConferencia[], codigo: string) => itens.filter((i) => i.codigo === codigo);

describe('estado da Parte 2: correções da revisão', { timeout: 30000 }, () => {
  it('caso com campo de tipo errado nos dados: erro em português e o estado de antes fica', async () => {
    const base = await comProjeto(DXF_OBRA);
    const kit = criarEstadoKit(base, { lerPdf: lerPdfNoNode });
    kit.mudarDados((d) => { d.interessado.nome = 'Antes'; });
    const bom = JSON.parse((await kit.salvarCaso()).texto);
    for (const dados of [
      { ...bom.dados, interessado: { ...bom.dados.interessado, cep: 5 } },
      { ...bom.dados, obra: { ...bom.dados.obra, municipio: null } },
      { ...bom.dados, retirada: { ...bom.dados.retirada, metros: { MT: 'dez' } } },
      { ...bom.dados, tipoAgua: { 7: 3 } },
    ]) {
      await expect(kit.abrirCaso(JSON.stringify({ ...bom, dados: { ...dados, interessado: { ...dados.interessado, nome: 'Depois' } } }))).resolves.toBeUndefined();
      expect(kit.ler().erro).toBe(TEXTOS_CASO_SALVO.naoEhCaso);
      expect(kit.ler().dados.interessado.nome).toBe('Antes');
    }
    // o estado segue de pé: mudar os dados e a Parte 1 avisarem não estoura
    expect(() => kit.mudarDados((d) => { d.interessado.cep = '00000-000'; })).not.toThrow();
    expect(() => base.marcarVao(base.ler().rede!.vaos[0].id, { tipo: 'BT' })).not.toThrow();
  });

  it('caso com camada que o projeto aberto não tem: mensagem própria e a rede não muda', async () => {
    const base = await comProjeto(DXF_OBRA);
    const kit = criarEstadoKit(base, { lerPdf: lerPdfNoNode });
    const bom = JSON.parse((await kit.salvarCaso()).texto);
    const antes = base.ler().rede;
    await kit.abrirCaso(JSON.stringify({ ...bom, camadasIncluidas: [{ camada: 'CAMADA QUE NAO EXISTE', tipo: 'MT' }] }));
    expect(kit.ler().erro).toBe(TEXTOS_CASO_SALVO.naoBate);
    expect(base.ler().rede).toBe(antes);
  });

  it('erro na conferência do passo 8 vai para o erro do retrato, sem exceção', async () => {
    const base = criarEstado({ lerAreas: lerBase });
    // -1 = não quebra; 1 = deixa passar uma leitura (o aviso de ocupado) e quebra a seguinte (dentro da conferência)
    let pular = -1;
    const quebradico: Estado = {
      ...base,
      ler: () => {
        if (pular === 0) { pular = -1; throw new Error('boom'); }
        if (pular > 0) pular--;
        return base.ler();
      },
    };
    const kit = criarEstadoKit(quebradico, { lerPdf: lerPdfNoNode });
    pular = 1;
    const itens = await kit.conferirZip(montarZip([{ caminho: 'a.txt', bytes: bytesDe('x') }]));
    expect(kit.ler().erro).toBe(TEXTOS_ESTADO_KIT.conferenciaFalhou);
    expect(itens.some((i) => i.nivel === 'vermelho')).toBe(true);
    expect(kit.ler().ocupado).toBe(false);
  });

  it('passo 8 sem a OS no nome da pasta: nada de conferência de OS, só um amarelo', async () => {
    const kit = criarEstadoKit(criarEstado({ lerAreas: lerBase }), { lerPdf: lerPdfNoNode });
    const zip = montarZip([
      // 10 dígitos que não são a pasta do kit não valem como OS
      { caminho: 'obra 1234567890 fotos/memorial descritivo.pdf', bytes: memorialInventado('0000000099') },
      { caminho: 'obra 1234567890 fotos/SOB 0000000099_Planilha Inventada_REV 09.xlsm', bytes: planilhaComA1('Obs:\nSOB 0000000099_PROCESSO DOCUMENTAL_REDE EM APP') },
    ]);
    const itens = await kit.conferirZip(zip);
    expect(codigos(itens, 'OS').map((i) => i.nivel)).toEqual(['amarelo']);
    expect(codigos(itens, 'OS')[0].titulo).toBe('OS do kit não conferida');
    expect(codigos(itens, 'PLANILHA_ASSUNTO').some((i) => i.nivel === 'vermelho')).toBe(false);
  });

  it('passo 8 sem caso: metros, árvores e poda saem amarelo de não conferidos, nunca verde', async () => {
    const kit = criarEstadoKit(criarEstado({ lerAreas: lerBase }), { lerPdf: lerPdfNoNode });
    const pasta = '0000000001_PROCESSO DOCUMENTAL_LESTE';
    const zip = montarZip([
      { caminho: `${pasta}/MEMORIAL/0000000001 MEMORIAL DESCRITIVO.pdf`, bytes: memorialInventado('0000000001') },
      { caminho: `${pasta}/KML/0000000001 PODA.kml`, bytes: bytesDe('<kml><Document><Placemark><name>Mangueira</name><Point><coordinates>-39,-5</coordinates></Point></Placemark></Document></kml>') },
    ]);
    const itens = await kit.conferirZip(zip);
    expect(codigos(itens, 'OS').map((i) => i.nivel)).toEqual(['verde']);
    expect(codigos(itens, 'METROS').map((i) => i.nivel)).toEqual(['amarelo']);
    expect(codigos(itens, 'ARVORE').map((i) => i.nivel)).toContain('amarelo');
    // NAO_TEM fica de fora: "não haverá abertura de vias" vale sem o caso
    for (const c of ['CONTRADICAO', 'ARVORE', 'METROS']) expect(codigos(itens, c).some((i) => i.nivel === 'verde')).toBe(false);
  });

  it('UC não marcada no 5a: o assunto "UC E REDE EM ..." do kit não vira vermelho falso', async () => {
    const base = await comProjeto(DXF_OBRA);
    const kit = criarEstadoKit(base, { lerPdf: lerPdfNoNode });
    kit.mudarDados((d) => { d.regional = 'LESTE'; d.rede.postes = postesCertos(base); });
    const assunto = assuntoTexto(OS, partesDoAssunto(base.ler().caso!, null, metrosDaRede(base.ler().rede!)))!;
    expect(assunto).toMatch(/_PROCESSO DOCUMENTAL_REDE EM /);
    for (const a1 of [assunto, assunto.replace('_REDE EM ', '_UC E REDE EM ')]) {
      kit.soltarArquivos([
        { nome: 'memorial descritivo.pdf', bytes: memorialInventado(OS) },
        { nome: `SOB ${OS}_Planilha Inventada_REV 09.xlsm`, bytes: planilhaComA1(`Obs:\n${a1}`) },
      ]);
      await kit.montarKit();
      // revisão final (I1): sem a UC, nem vermelho falso nem verde: amarelo
      const c = codigos(kit.ler().conferencia!, 'PLANILHA_ASSUNTO');
      expect(c.map((i) => i.nivel)).toEqual(['amarelo']);
    }
  });

  // revisão final (I1): a planilha baixada sem a UC marcada não chuta "UC fora" na A1
  it('UC não marcada no 5a: a planilha baixada deixa a A1 como estava e dá o amarelo do assunto', async () => {
    const base = await comProjeto(DXF_OBRA);
    const kit = criarEstadoKit(base, { lerPdf: lerPdfNoNode });
    kit.mudarDados((d) => { d.rede.postes = postesCertos(base); });
    const vazia = planilhaInventada({ linhaCabecalho: 4 });
    await kit.carregarPlanilha(vazia, 'Planilha Inventada_REV 09.xlsm');
    const sem = kit.baixarPlanilha();
    const a1 = (b: Uint8Array) => { const p = lerPlanilha(b, 'x.xlsm'); return lerCelulas(p.pasta, p.aba).get('A1'); };
    expect(a1(sem.bytes)).toBe(a1(vazia));
    expect(sem.avisos.filter((a) => a.codigo === 'PLANILHA_ASSUNTO').map((a) => a.nivel)).toEqual(['amarelo']);
    // marcada a UC (dentro da UC Inventada), a A1 ganha o assunto com a UC
    kit.marcarUcNoMapa();
    kit.clicarNoMapa([500100, 9500080]);
    const com = kit.baixarPlanilha();
    expect(a1(com.bytes)!.split('\n').pop()).toMatch(/_PROCESSO DOCUMENTAL_UC E REDE EM /);
    expect(com.avisos.filter((a) => a.codigo === 'PLANILHA_ASSUNTO')).toEqual([]);
  });
});

// ---------- Tarefa 19: o que a tela precisa ----------

describe('estado da Parte 2: o que a tela do passo 6a e do 5a usa', () => {
  const pngMinimo = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  const solta = (nome: string) => ({ nome, bytes: pngMinimo });

  it('escolherImagem troca as imagens de duas figuras; soltar imagens de novo desfaz a troca', async () => {
    const kit = criarEstadoKit(await comProjeto(DXF_OBRA), { lerPdf: lerPdfNoNode });
    kit.soltarImagens([solta('Figura 1.png'), solta('print.png')]);
    const de = () => Object.fromEntries(kit.ler().associacoes.map((a) => [a.arquivo, a.figura]));
    expect(de()).toEqual({ 'Figura 1.png': 1, 'print.png': 2 });
    kit.escolherImagem(1, 'print.png');
    expect(de()).toEqual({ 'Figura 1.png': 2, 'print.png': 1 });
    // figura sem imagem: a imagem só muda de lugar
    kit.escolherImagem(3, 'print.png');
    expect(de()).toEqual({ 'Figura 1.png': 2, 'print.png': 3 });
    // imagem que não está em figura nenhuma, ou figura que não existe: nada muda
    kit.escolherImagem(9, 'print.png');
    kit.escolherImagem(1, 'nao-existe.png');
    expect(de()).toEqual({ 'Figura 1.png': 2, 'print.png': 3 });
    kit.soltarImagens([solta('outra.png')]);
    expect(de()).toEqual({ 'Figura 1.png': 1, 'outra.png': 2, 'print.png': 3 });
  });

  it('o memorial leva a imagem para a figura escolhida', async () => {
    const base = await comProjeto(DXF_OBRA);
    const kit = criarEstadoKit(base, { lerPdf: lerPdfNoNode });
    kit.soltarImagens([solta('Figura 2.png')]);
    kit.escolherImagem(1, 'Figura 2.png');
    const texto = textoDoDocx(kit.baixarMemorial().bytes);
    expect(texto).not.toContain('[PREENCHER: solte a imagem da Figura 1 no site]');
    expect(texto).toContain('[PREENCHER: solte a imagem da Figura 2 no site]');
  });

  it('baixarMemorial({ semFiguras: true }) deixa a marca de cada figura, mesmo com imagem solta', async () => {
    const kit = criarEstadoKit(await comProjeto(DXF_OBRA), { lerPdf: lerPdfNoNode });
    kit.soltarImagens([solta('Figura 2.png')]);
    expect(textoDoDocx(kit.baixarMemorial({ semFiguras: true }).bytes)).toContain('[PREENCHER: solte a imagem da Figura 2 no site]');
    expect(textoDoDocx(kit.baixarMemorial().bytes)).not.toContain('[PREENCHER: solte a imagem da Figura 2 no site]');
  });

  it('cancelarUc sai do modo de clique sem mudar a UC', async () => {
    const kit = criarEstadoKit(await comProjeto(DXF_OBRA), { lerPdf: lerPdfNoNode });
    kit.marcarUcNoMapa();
    kit.cancelarUc();
    expect(kit.ler().escolhendoUc).toBe(false);
    expect(kit.ler().uc).toBeNull();
    expect(kit.clicarNoMapa([500300, 9500300])).toBe(false);
  });

  it('baixarPacote: o KML e o SHP da Parte 1, agora com a camada da UC', async () => {
    const base = await comProjeto(DXF_OBRA);
    const kit = criarEstadoKit(base, { lerPdf: lerPdfNoNode });
    const sem = abrirZip(kit.baixarPacote().bytes).map((a) => a.caminho);
    expect(sem.some((c) => c.includes(`/${OS} UC.`))).toBe(false);
    kit.marcarUcNoMapa();
    kit.clicarNoMapa([500300, 9500300]);
    const p = kit.baixarPacote();
    expect(p.nome).toBe(base.baixarPacote().nome);
    const com = abrirZip(p.bytes).map((a) => a.caminho);
    expect(com.length).toBeGreaterThan(sem.length);
    expect(com.filter((c) => !sem.includes(c)).every((c) => c.includes(`/${OS} UC.`))).toBe(true);
  });
});
