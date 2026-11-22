// Leitura de PDF no navegador. O pdf.js é pesado: só entra por import() dinâmico, no pedaço separado da conferência.
import { lerComPdfjs, type LerPdf } from '../nucleo/pdf-texto';

export const lerPdfNoNavegador: LerPdf = async (bytes) => {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  return lerComPdfjs(pdfjs, bytes);
};
