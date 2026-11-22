import { describe, expect, it } from 'vitest';
import { linhasDaPagina, normalizar } from '../src/nucleo/pdf-texto';
import { lerPdfNoNode, pdfDeTexto } from './ajuda/pdf-simples';

describe('leitura de PDF', () => {
  it('lê as linhas de uma página, com pouco texto', async () => {
    const r = await lerPdfNoNode(pdfDeTexto([['MEMORIAL DESCRITIVO', 'com cerca de 308 metros']]));
    expect(r.paginas).toEqual(['MEMORIAL DESCRITIVO\ncom cerca de 308 metros']);
    expect(r.temTexto).toBe(false);
  });
  it('com 300 letras, temTexto é verdadeiro', async () => {
    const r = await lerPdfNoNode(pdfDeTexto([Array.from({ length: 6 }, () => 'a'.repeat(50))]));
    expect(r.temTexto).toBe(true);
  });
  it('mantém os acentos', async () => {
    const r = await lerPdfNoNode(pdfDeTexto([['Área de Preservação']]));
    expect(r.paginas[0]).toBe('Área de Preservação');
  });
  it('lê várias páginas', async () => {
    const r = await lerPdfNoNode(pdfDeTexto([['um'], ['dois']]));
    expect(r.paginas).toEqual(['um', 'dois']);
  });
});

describe('normalizar', () => {
  it('desfaz hifenização, espaços repetidos e NBSP', () => {
    expect(normalizar('rede de mé-\ndia tensão  e  BT')).toBe('rede de média tensão e BT');
    expect(normalizar('1.036 metros')).toBe('1.036 metros');
  });
});

describe('linhasDaPagina', () => {
  it('junta itens com y quase igual, em ordem de x', () => {
    const it = (str: string, x: number, y: number) => ({ str, x, y, fimDeLinha: false });
    expect(linhasDaPagina([it('mundo', 80, 701.5), it('olá', 10, 700), it('abaixo', 10, 680)])).toEqual(['olá mundo', 'abaixo']);
  });
});
