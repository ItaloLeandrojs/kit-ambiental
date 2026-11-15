import type { Poste, Pt, TipoRede } from './tipos.ts';
import type { Caso, Intervencao, Trecho } from './caso.ts';
import { coordTexto, haTexto, metrosTexto } from './formato.ts';

const NOME_REDE: Record<TipoRede, string> = {
  MT: 'rede de média tensão',
  BT: 'rede de baixa tensão',
  CONJ: 'rede conjugada de média e baixa tensão',
};

// a coordenada vem da geometria (ponto), como o KML e o SHP; poste sem número fica só com a coordenada
const postePt = (p: Poste | null, ponta: Pt): string =>
  p ? `o poste ${p.numero ? `Nº ${p.numero} ` : ''}${coordTexto(p.ponto)}` : `o ponto ${coordTexto(ponta)}`;

const trechoTexto = (t: Trecho): string =>
  `entre ${postePt(t.de, t.pts[0])} e ${postePt(t.ate, t.pts[t.pts.length - 1])}, com cerca de ${metrosTexto(t.metros)} metros da ${NOME_REDE[t.tipo]}`;

function linhaDe(iv: Intervencao): string {
  const partes = iv.trechos.map(trechoTexto);
  if (iv.postesSemRede.length) {
    const n = iv.postesSemRede.length;
    partes.push(`com ${n} ${n === 1 ? 'poste novo' : 'postes novos'}, sem rede nova na área`);
  }
  return `A intervenção ocorrerá ${partes.join('; e ')}, com área de ${haTexto(iv.hectares)} ha, dentro de ${iv.area.nome}.`;
}

export function resumoTexto(caso: Caso, os: string): string {
  const linhas: string[] = [];
  if (os.trim()) linhas.push(`OS ${os.trim()}`);
  if (caso.municipio) linhas.push(`Município: ${caso.municipio}`);
  for (const iv of caso.intervencoes) {
    linhas.push(linhaDe(iv));
    linhas.push(iv.orgao ? `Órgão: licencia ${iv.orgao.licencia}; gestor ${iv.orgao.gestor}.` : 'Órgão: não identificado; consultar o P&M.');
  }
  for (const a of caso.avisos) linhas.push(`Aviso: ${a.texto}`);
  return linhas.join('\n');
}
