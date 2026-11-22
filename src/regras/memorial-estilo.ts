// Estilo do memorial descritivo no Word: só números e nomes de fonte, medidos em 19/11 num memorial aprovado da empresa.
// Nada do conteúdo do memorial entra aqui.

export const PAGINA = { largura: 11906, altura: 16838 }; // A4, em twips

// Margens em twips (1 cm = 567 twips): superior 2,25 cm, as outras 2,0 cm.
export const MARGEM = { superior: 1276, direita: 1134, inferior: 1134, esquerda: 1134, cabecalho: 680, rodape: 170 };

export const LARGURA_UTIL = PAGINA.largura - MARGEM.esquerda - MARGEM.direita; // twips
export const EMU_POR_TWIP = 635;
export const LARGURA_UTIL_EMU = LARGURA_UTIL * EMU_POR_TWIP;

// Fontes do tema do memorial: corpo Calibri, títulos Calibri Light.
export const FONTE_CORPO = 'Calibri';
export const FONTE_TITULO = 'Calibri Light';

// Tamanhos em meios pontos (w:sz): 21 = 10,5 pt.
export const TAMANHO = { corpo: 21, titulo: 36, secao: 40, legenda: 20, cabecalho: 18 };

export const ESPACO = { depois: 200, linha: 288 }; // twips e 240avos de linha (docDefaults)

// Heading 1 do memorial: Calibri Light 20 pt, cor verde escura, espaço antes de 360 e depois de 40.
export const SECAO = { cor: '538135', antes: 360, depois: 40 };
