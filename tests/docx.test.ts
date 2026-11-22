import { describe, expect, it } from 'vitest';
import { gravarDocx, lerImagem, textoDoDocumento, textoDoDocx, type Documento } from '../src/nucleo/docx';
import { abrirZip } from '../src/nucleo/zip';
import { percorrerXml } from '../src/nucleo/xml';
import { LARGURA_UTIL_EMU } from '../src/regras/memorial-estilo';
import type { Imagem } from '../src/nucleo/obra';

// PNG inventado: só assinatura e IHDR bastam para o gravador (largura × altura em px).
function png(largura: number, altura: number): Imagem {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, largura);
  dv.setUint32(20, altura);
  return { bytes: b, tipo: 'png', largura, altura };
}

const doc = (blocos: Documento['blocos'], cab: Documento['cabecalho'] = { linhas: ['Empresa Exemplo Ltda'], logo: null }): Documento => ({ cabecalho: cab, blocos });
const nomes = (b: Uint8Array): string[] => abrirZip(b).map((a) => a.caminho);
const leia = (b: Uint8Array, caminho: string): string => new TextDecoder().decode(abrirZip(b).find((a) => a.caminho === caminho)!.bytes);

describe('gravarDocx', () => {
  it('um parágrafo gera as partes mínimas do .docx', () => {
    const z = gravarDocx(doc([{ t: 'paragrafo', textos: [{ texto: 'Olá' }] }]));
    for (const n of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels', 'word/header1.xml', 'word/settings.xml']) {
      expect(nomes(z)).toContain(n);
    }
  });

  it('o texto lido do .docx é igual ao texto do documento (todos os blocos)', () => {
    const d = doc([
      { t: 'titulo', textos: [{ texto: 'MEMORIAL ' }, { texto: 'EXEMPLO', negrito: true }] },
      { t: 'secao', texto: '1. Objetivo' },
      { t: 'paragrafo', textos: [{ texto: 'Texto ' }, { texto: 'com amarelo', amarelo: true }, { texto: ' e fim.' }] },
      { t: 'tabela', cabecalho: ['Trecho', 'Metros'], linhas: [[[{ texto: 'A' }], [{ texto: '1.036' }]], [[{ texto: 'B' }], [{ texto: '12', negrito: true }]]] },
      { t: 'figura', numero: 1, legenda: 'Mapa da área', imagem: null },
      { t: 'assinatura', nome: 'Fulano de Tal', registro: 'CREA 000000/D', rnp: 'RNP 0000000000', imagem: null, nota: 'Assinar à mão' },
    ]);
    expect(textoDoDocx(gravarDocx(d))).toBe(textoDoDocumento(d));
    expect(textoDoDocumento(d)).toContain('[PREENCHER: solte a imagem da Figura 1 no site]');
  });

  it('nome com & < > aspas e acento passa igual e o XML é lido sem erro', () => {
    const nome = 'Fulano & Filhos <Ltda> "ME" d\'Água São João';
    const d = doc([{ t: 'paragrafo', textos: [{ texto: nome }] }, { t: 'secao', texto: nome }], { linhas: [nome], logo: null });
    const z = gravarDocx(d);
    expect(textoDoDocx(z)).toBe(`${nome}\n${nome}`);
    for (const parte of ['word/document.xml', 'word/header1.xml', 'word/footer1.xml']) {
      expect(() => percorrerXml(leia(z, parte), { abre() {}, fecha() {}, texto() {} })).not.toThrow();
    }
    expect(leia(z, 'word/document.xml')).not.toContain('<Ltda>');
  });

  it('texto só de espaço entre duas corridas não se perde', () => {
    const d = doc([{ t: 'paragrafo', textos: [{ texto: 'um' }, { texto: ' ' }, { texto: 'dois', negrito: true }] }]);
    expect(textoDoDocx(gravarDocx(d))).toBe('um dois');
  });

  it('amarelo gera highlight yellow', () => {
    const z = gravarDocx(doc([{ t: 'paragrafo', textos: [{ texto: 'campo', amarelo: true }] }]));
    expect(leia(z, 'word/document.xml')).toContain('<w:highlight w:val="yellow"/>');
  });

  it('figura com PNG de 200 × 100 sai na largura útil, na mesma proporção, e o PNG vai em word/media', () => {
    const z = gravarDocx(doc([{ t: 'figura', numero: 2, legenda: 'Detalhe', imagem: png(200, 100) }]));
    const xml = leia(z, 'word/document.xml');
    expect(xml).toContain(`<wp:extent cx="${LARGURA_UTIL_EMU}" cy="${LARGURA_UTIL_EMU / 2}"/>`);
    expect(nomes(z).some((n) => n.startsWith('word/media/') && n.endsWith('.png'))).toBe(true);
    expect(leia(z, '[Content_Types].xml')).toContain('Extension="png"');
    expect(leia(z, 'word/_rels/document.xml.rels')).toContain('media/');
    expect(textoDoDocx(z)).toBe('Figura 2: Detalhe');
  });

  it('logo no cabeçalho vai para header1.xml.rels com o mesmo arquivo de mídia', () => {
    const z = gravarDocx(doc([{ t: 'paragrafo', textos: [{ texto: 'x' }] }], { linhas: ['L1', 'L2'], logo: png(300, 100) }));
    expect(nomes(z)).toContain('word/_rels/header1.xml.rels');
    expect(leia(z, 'word/header1.xml')).toContain('r:embed="rId101"');
    expect(leia(z, 'word/_rels/header1.xml.rels')).toContain('Id="rId101"');
  });

  it('o rodapé tem os campos PAGE e NUMPAGES', () => {
    const z = gravarDocx(doc([]));
    const r = leia(z, 'word/footer1.xml');
    expect(r).toContain('PAGE');
    expect(r).toContain('NUMPAGES');
  });
});

describe('lerImagem', () => {
  it('8 bytes quaisquer não são imagem', () => {
    expect(lerImagem(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });
  it('lê PNG', () => {
    const i = png(200, 100);
    expect(lerImagem(i.bytes)).toMatchObject({ tipo: 'png', largura: 200, altura: 100 });
  });
  it('lê JPEG (SOF0)', () => {
    const b = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 50, 0, 80, 3, 1, 0x22, 0]);
    expect(lerImagem(b)).toMatchObject({ tipo: 'jpeg', largura: 80, altura: 50 });
  });
  it('JPEG cortado é null', () => {
    expect(lerImagem(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4]))).toBeNull();
  });
});
