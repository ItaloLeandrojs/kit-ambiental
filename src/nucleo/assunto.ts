// Assunto do e-mail ("SOB <OS>_PROCESSO DOCUMENTAL_...") e texto curto da Planilha Padrão.
// Tudo sai do caso calculado e da situação da UC; os números vêm de metrosTexto, haTexto e coordTexto.
import type { TipoRede } from './tipos.ts';
import { orgaoDaArea, type AreaProtegida, type Orgao } from './areas.ts';
import type { AreaConfirmada, Caso } from './caso.ts';
import type { SituacaoUc } from './uc.ts';
import { coordTexto, haTexto, metrosTexto } from './formato.ts';
import { ROTULO_ASSUNTO } from '../regras/assunto.ts';
import { TEXTOS_CURTO } from '../regras/textos-memorial.ts';

// rotulo '' = área sem rótulo na aba de modelos: o assunto não é montado (null), nunca se chuta
export interface ParteAssunto { rotulo: string; uc: boolean; rede: 'inteira' | 'parte' | null }

const TOL_INTEIRA = 0.5; // metros: a rede dentro da área vale "inteira" a partir do total menos isto
const TIPOS: TipoRede[] = ['MT', 'BT', 'CONJ'];
const soma = (m: Record<TipoRede, number>): number => TIPOS.reduce((s, t) => s + m[t], 0);

function rotuloDoOrgao(o: Orgao | null): string {
  if (!o) return '';
  const r = ROTULO_ASSUNTO.find((x) => x.categoria.test(o.categoria) && (x.esfera === undefined || x.esfera === o.esfera));
  return r?.rotulo ?? '';
}
const rotuloDaArea = (a: AreaProtegida | AreaConfirmada): string => ('largura' in a ? 'APP' : rotuloDoOrgao(orgaoDaArea(a)));

// única decisão de "inteira": uma só área cobre a rede toda. Obra só de poste (total 0): o que está dentro é a rede toda.
const cobreTudo = (metrosDaArea: number, total: number): boolean => metrosDaArea >= total - TOL_INTEIRA;

/** Uma parte por rótulo, na ordem em que as intervenções aparecem; áreas só da UC vêm depois. */
export function partesDoAssunto(caso: Caso, uc: SituacaoUc | null, metrosTotais: Record<TipoRede, number>): ParteAssunto[] {
  const total = soma(metrosTotais);
  // rótulo -> maior metragem de rede nova dentro de UMA área do rótulo; somar contaria em dobro áreas sobrepostas
  const dentroDe = new Map<string, number>();
  for (const iv of caso.intervencoes) {
    const r = rotuloDoOrgao(iv.orgao);
    dentroDe.set(r, Math.max(dentroDe.get(r) ?? 0, soma(iv.metros)));
  }
  const rotulosUc = new Set((uc?.dentro ?? []).map(rotuloDaArea));
  const partes: ParteAssunto[] = [];
  for (const [rotulo, metros] of dentroDe) {
    partes.push({ rotulo, uc: rotulosUc.has(rotulo), rede: cobreTudo(metros, total) ? 'inteira' : 'parte' });
  }
  for (const rotulo of rotulosUc) {
    if (!dentroDe.has(rotulo)) partes.push({ rotulo, uc: true, rede: null });
  }
  return partes;
}

const prefixoDe = (p: ParteAssunto): string => {
  if (p.rede === null) return 'UC EM';
  if (p.uc) return p.rede === 'inteira' ? 'UC E REDE EM' : 'UC E PARTE DA REDE EM';
  return p.rede === 'inteira' ? 'REDE EM' : 'PARTE DA REDE EM';
};

/** null quando não há parte ou alguma parte não tem rótulo (a tela mostra o amarelo: confirme o assunto com o P&M). */
export function assuntoTexto(os: string, partes: ParteAssunto[]): string | null {
  if (partes.length === 0 || partes.some((p) => p.rotulo === '')) return null;
  const prefixos = new Set(partes.map(prefixoDe));
  const corpo = prefixos.size === 1
    ? `${[...prefixos][0]} ${partes.map((p) => p.rotulo).join(' E ')}`
    : partes.map((p) => `${prefixoDe(p)} ${p.rotulo}`).join(' E ');
  return `SOB ${os}_PROCESSO DOCUMENTAL_${corpo}`;
}

const lista = (itens: string[]): string => (itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`);

/** Resumo de 1 ou 2 frases da planilha, com os mesmos números do caso (nunca "não precisa de processo"). */
export function textoCurto(_os: string, caso: Caso, uc: SituacaoUc | null, metrosTotais: Record<TipoRede, number>): string {
  const frases: string[] = [];
  if (uc) {
    const coord = coordTexto(uc.ponto);
    frases.push(uc.dentro.length === 0
      ? TEXTOS_CURTO.ucForaDeTudo.replace('{coord}', coord)
      : TEXTOS_CURTO.ucDentro.replace('{coord}', coord).replace('{areas}', lista(uc.dentro.map((a) => a.nome))));
  }
  if (caso.intervencoes.length === 0) frases.push(TEXTOS_CURTO.redeSemArea);
  const total = soma(metrosTotais);
  for (const iv of caso.intervencoes) {
    const quanto = cobreTudo(soma(iv.metros), total) ? 'Toda a extensão' : 'Parte';
    const extensao = TIPOS.filter((t) => Math.round(iv.metros[t]) > 0).map((t) => `${metrosTexto(iv.metros[t])} metros de rede ${t}`);
    const modelo = extensao.length === 0 ? TEXTOS_CURTO.redeSoPoste : TEXTOS_CURTO.redeEm;
    frases.push(modelo.replace('{quanto}', quanto).replace('{extensao}', lista(extensao)).replace('{area}', iv.area.nome).replace('{ha}', haTexto(iv.hectares)));
  }
  return frases.join(' ');
}
