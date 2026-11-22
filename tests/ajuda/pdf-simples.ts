// PDF 1.4 mínimo, só texto (Helvetica WinAnsi), para testar a leitura sem arquivo real.
import { lerComPdfjs, type LerPdf } from '../../src/nucleo/pdf-texto';

const escapar = (s: string): string => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

// WinAnsi: Latin-1 coincide com os códigos de 0 a 255 para as letras acentuadas usadas aqui.
const latin1 = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

export function pdfDeTexto(paginas: string[][]): Uint8Array {
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  const offsets: number[] = [];
  const empurrar = (s: string): void => {
    const b = latin1(s);
    partes.push(b);
    tamanho += b.length;
  };
  const objeto = (n: number, corpo: string): void => {
    offsets[n] = tamanho;
    empurrar(`${n} 0 obj\n${corpo}\nendobj\n`);
  };
  const np = paginas.length;
  // objetos: 1 catálogo, 2 árvore de páginas, 3 fonte, depois (página, conteúdo) por página
  empurrar('%PDF-1.4\n');
  objeto(1, '<< /Type /Catalog /Pages 2 0 R >>');
  const filhos = paginas.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  objeto(2, `<< /Type /Pages /Kids [${filhos}] /Count ${np} >>`);
  objeto(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  paginas.forEach((linhas, i) => {
    const pn = 4 + i * 2;
    // uma linha por Td, 16 pt para baixo a cada uma
    const fluxo = [
      'BT',
      '/F1 12 Tf',
      '56 780 Td',
      ...linhas.map((l, k) => `${k === 0 ? '' : '0 -16 Td '}(${escapar(l)}) Tj`),
      'ET',
    ].join('\n');
    objeto(pn, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pn + 1} 0 R >>`);
    objeto(pn + 1, `<< /Length ${fluxo.length} >>\nstream\n${fluxo}\nendstream`);
  });
  const total = 4 + np * 2;
  const xref = tamanho;
  let tabela = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let n = 1; n < total; n++) tabela += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  empurrar(`${tabela}trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const saida = new Uint8Array(tamanho);
  let p = 0;
  for (const b of partes) {
    saida.set(b, p);
    p += b.length;
  }
  return saida;
}

// Mesma leitura da tela, mas com a versão "legacy" do pdf.js, que roda no Node (sem worker de navegador).
export const lerPdfNoNode: LerPdf = async (bytes) => lerComPdfjs(await import('pdfjs-dist/legacy/build/pdf.mjs'), bytes);
