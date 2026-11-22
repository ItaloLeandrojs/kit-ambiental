// Lista curta de erros comuns de digitação no memorial (desenho §6.7 e §9). Cada um sai amarelo na conferência do texto.
// O padrão é procurado no texto já sem acento e em minúsculas (como a conferência lê o PDF).
export const ERROS_COMUNS: { padrao: RegExp; titulo: string; comoCorrigir: string }[] = [
  {
    padrao: /\brede area\b/,
    // provisório: texto a confirmar com o Italo
    titulo: '"rede área" no lugar de "rede aérea"',
    // provisório: texto a confirmar com o Italo
    comoCorrigir: 'Troque "rede área" por "rede aérea" no Word e gere o PDF de novo.',
  },
  {
    // kVA é potência de transformador; a tensão da rede é em kV (13,8 kV) ou V (220/380 V)
    padrao: /\b(?:13[.,]8|220|380)\s*kva\b/,
    // provisório: texto a confirmar com o Italo
    titulo: '"kVA" na tensão da rede',
    // provisório: texto a confirmar com o Italo
    comoCorrigir: 'A tensão é em kV ou V (por exemplo 13,8 kV e 220/380 V); kVA é só a potência do transformador.',
  },
  {
    // palavra partida por espaço, como sai às vezes do Word para o PDF: "n o", "n a", "r ede", "m etros"
    padrao: /(?<![\p{L}\d])(?:n [ao]|r ede|m etros|p oste|a rea|a erea)(?![\p{L}\d])/u,
    // provisório: texto a confirmar com o Italo
    titulo: 'Palavra partida por espaço',
    // provisório: texto a confirmar com o Italo
    comoCorrigir: 'Junte a palavra no Word (por exemplo "n o" vira "no") e gere o PDF de novo.',
  },
];
