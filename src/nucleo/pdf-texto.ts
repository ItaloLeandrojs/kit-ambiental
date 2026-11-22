// Texto de PDF: lógica pura (o pdf.js em si só é carregado por import() dinâmico, em src/tela/pdf.ts).

export interface ItemPdf { str: string; x: number; y: number; fimDeLinha: boolean }

// Abaixo disso, o PDF provavelmente é imagem escaneada (sem texto para conferir).
export const MIN_LETRAS = 200;

const TOLERANCIA_Y = 2; // pontos

export type LerPdf = (bytes: Uint8Array) => Promise<{ paginas: string[]; temTexto: boolean }>;

// Agrupa os itens por altura (y, tolerância de 2 pt) e ordena cada linha por x. Linhas de cima para baixo.
export function linhasDaPagina(itens: ItemPdf[]): string[] {
  const grupos: { y: number; itens: ItemPdf[] }[] = [];
  for (const it of itens) {
    if (it.str === '') continue;
    const g = grupos.find((x) => Math.abs(x.y - it.y) <= TOLERANCIA_Y);
    if (g) g.itens.push(it);
    else grupos.push({ y: it.y, itens: [it] });
  }
  grupos.sort((a, b) => b.y - a.y);
  return grupos
    .map((g) => g.itens.sort((a, b) => a.x - b.x).map((i) => i.str).join(' ').replace(/ {2,}/g, ' ').trim())
    .filter((l) => l !== '');
}

// Espaços repetidos, NBSP e hifenização no fim de linha ("mé-\ndia" vira "média").
export function normalizar(texto: string): string {
  return texto
    .replace(/[  ]/g, ' ')
    .replace(/(\p{L})-[ \t]*\r?\n[ \t]*(\p{Ll})/gu, '$1$2')
    .replace(/[ \t]*\r?\n[ \t]*/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

export function contarLetras(paginas: string[]): number {
  return (paginas.join(' ').match(/\p{L}/gu) ?? []).length;
}

// Monta o resultado final a partir dos itens de cada página (usado pelo Node e pelo navegador).
export function resultadoDasPaginas(itensPorPagina: ItemPdf[][]): { paginas: string[]; temTexto: boolean } {
  const paginas = itensPorPagina.map((it) => linhasDaPagina(it).join('\n'));
  return { paginas, temTexto: contarLetras(paginas) >= MIN_LETRAS };
}

// Tipo mínimo do módulo pdf.js: ele é recebido já importado (nunca importado aqui no topo).
interface ItemBruto { str?: string; transform?: number[]; hasEOL?: boolean }
export interface ModuloPdfjs {
  getDocument(origem: { data: Uint8Array }): {
    promise: Promise<{ numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }> }>;
    destroy(): Promise<void>;
  };
}

// Único laço de leitura, usado pela tela (worker do Vite) e pelos testes (versão legacy no Node).
export async function lerComPdfjs(pdfjs: ModuloPdfjs, bytes: Uint8Array): Promise<{ paginas: string[]; temTexto: boolean }> {
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  try {
    const doc = await tarefa.promise;
    const porPagina: ItemPdf[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const conteudo = await (await doc.getPage(n)).getTextContent();
      porPagina.push(
        (conteudo.items as ItemBruto[]).flatMap((i) =>
          i.str !== undefined && i.transform ? [{ str: i.str, x: i.transform[4], y: i.transform[5], fimDeLinha: !!i.hasEOL }] : [],
        ),
      );
    }
    return resultadoDasPaginas(porPagina);
  } finally {
    await tarefa.destroy();
  }
}
