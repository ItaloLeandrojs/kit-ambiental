// Tabela de órgãos por pasta do KMZ de Áreas Protegidas (desenho §6.3).
// A primeira regra cujo trecho aparece em alguma pasta (sem acento, em maiúsculas) ganha.
// Pasta que nenhuma regra cobre fica sem órgão: nunca se chuta (Corredor, Serra do Visgueiro, COGERH...).
export interface RegraOrgao {
  trecho: string; // sem acento, em maiúsculas
  categoria: string;
  esfera: string;
  licencia: string;
  gestor: string;
  grupoUc?: boolean; // a categoria leva o grupo da subpasta (Uso Sustentável ou Proteção Integral)
  soIcmbio?: string[]; // se o nome da área tem um destes trechos: licencia e gestor são só o ICMBio
}

export const REGRAS_ORGAOS: RegraOrgao[] = [
  {
    trecho: 'UNIDADE DE CONSERVACAO FEDERAL',
    categoria: 'UC',
    esfera: 'federal',
    licencia: 'SEMACE',
    gestor: 'ICMBio',
    grupoUc: true,
    soIcmbio: ['BATOQUE', 'PRAINHA DO CANTO VERDE', 'JERICOACOARA'],
  },
  { trecho: 'UNIDADE DE CONSERVACAO ESTADUAL', categoria: 'UC', esfera: 'estadual', licencia: 'SEMACE', gestor: 'SEMA', grupoUc: true },
  {
    trecho: 'UNIDADE DE CONSERVACAO MUNICIPAL',
    categoria: 'UC',
    esfera: 'municipal',
    licencia: 'SEMACE ou o município, se ele licencia',
    gestor: 'Município (secretaria de meio ambiente)',
    grupoUc: true,
  },
  { trecho: 'RPPN', categoria: 'RPPN', esfera: 'particular', licencia: 'SEMACE', gestor: 'O gestor particular' },
  { trecho: 'QUILOMBOLA', categoria: 'Quilombola', esfera: 'federal', licencia: 'SEMACE', gestor: 'INCRA' },
  { trecho: 'ASSENTAMENTO', categoria: 'Assentamento', esfera: 'federal', licencia: 'SEMACE', gestor: 'INCRA' },
  { trecho: 'TERRAS INDIGENAS', categoria: 'Terra indígena', esfera: 'federal', licencia: 'SEMACE', gestor: 'FUNAI' },
  { trecho: 'IPHAN', categoria: 'Patrimônio', esfera: 'federal', licencia: 'SEMACE', gestor: 'IPHAN' },
  { trecho: 'DNOCS', categoria: 'Perímetro DNOCS', esfera: 'federal', licencia: 'SEMACE', gestor: 'DNOCS' },
  { trecho: 'MACROZONEAMENTO', categoria: 'Macrozona de Fortaleza', esfera: 'municipal', licencia: 'SEUMA', gestor: 'SEUMA' },
];
