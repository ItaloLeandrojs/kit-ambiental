// Rótulo do assunto do e-mail por categoria do órgão (desenho §6.6). Tirado da aba "Modelos Assunto E-mail" da REV 09
// (texto genérico da Enel, sem nome de área real). Categoria que não está aqui NÃO ganha rótulo: o site nunca chuta
// (Macrozona de Fortaleza tem 3 modelos, ZIA, ZPA e ZRA, e a categoria não diz qual; Corredor Ecológico não tem regra de órgão).
export interface RotuloAssunto {
  categoria: RegExp; // testada na categoria do Orgao
  esfera?: string; // quando a categoria sozinha não basta (UC federal, estadual e municipal)
  rotulo: string;
  modelo?: string; // como o modelo da aba escreve, quando difere da forma dos kits aprovados
}

export const ROTULO_ASSUNTO: RotuloAssunto[] = [
  { categoria: /^APP$/, rotulo: 'APP' },
  { categoria: /^UC\b/, esfera: 'federal', rotulo: 'UNIDADE DE CONSERVAÇÃO FEDERAL' },
  { categoria: /^UC\b/, esfera: 'estadual', rotulo: 'UNIDADE DE CONSERVAÇÃO ESTADUAL' },
  { categoria: /^UC\b/, esfera: 'municipal', rotulo: 'UNIDADE DE CONSERVAÇÃO MUNICIPAL' },
  { categoria: /^RPPN$/, rotulo: 'UNIDADE DE CONSERVAÇÃO PRIVADA (RPPN)' },
  { categoria: /^Terra ind/i, rotulo: 'ÁREAS TERRAS INDÍGENAS' },
  { categoria: /^Quilombola$/, rotulo: 'ÁREAS TERRITÓRIOS QUILOMBOLAS' },
  { categoria: /^Assentamento$/, rotulo: 'ÁREAS PROJETO ASSENTAMENTO RURAL' },
  { categoria: /^Patrim/i, rotulo: 'ÁREAS PATRIMÔNIO HISTÓRICO E ARTÍSTICO' },
  // a forma do kit aprovado leva "(DNOCS)"; o modelo da aba escreve "DO DNOCS"
  { categoria: /^Perímetro DNOCS$/, rotulo: 'ÁREAS PERÍMETRO IRRIGADO (DNOCS)', modelo: 'ÁREAS PERÍMETRO IRRIGADO DO DNOCS' },
];
