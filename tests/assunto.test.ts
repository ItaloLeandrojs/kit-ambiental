import { describe, expect, it } from 'vitest';
import { assuntoTexto, partesDoAssunto, textoCurto } from '../src/nucleo/assunto.ts';
import { ROTULO_ASSUNTO } from '../src/regras/assunto.ts';
import { coordTexto, haTexto, metrosTexto } from '../src/nucleo/formato.ts';
import type { AreaProtegida, Orgao } from '../src/nucleo/areas.ts';
import type { AreaConfirmada, Caso, Intervencao } from '../src/nucleo/caso.ts';
import type { SituacaoUc } from '../src/nucleo/uc.ts';
import type { Pt, TipoRede } from '../src/nucleo/tipos.ts';

// tudo inventado
const OS = '0000000001';
const area = (nome: string, pasta: string): AreaProtegida => ({ id: 1, nome, pasta: [pasta], atributos: {}, poligonos: [], linhas: [], caixa: [0, 0, 1, 1] });
const confirmada = (nome: string): AreaConfirmada => ({ nome, tipo: 'APP', poligonos: [], largura: 30 });
const orgaoApp: Orgao = { categoria: 'APP', esfera: 'municipal', licencia: 'x', gestor: 'x' };
const orgaoDnocs: Orgao = { categoria: 'Perímetro DNOCS', esfera: 'federal', licencia: 'x', gestor: 'x' };
const orgaoUcFed: Orgao = { categoria: 'UC (Uso Sustentável)', esfera: 'federal', licencia: 'x', gestor: 'x' };
const metros = (m: Partial<Record<TipoRede, number>>): Record<TipoRede, number> => ({ MT: 0, BT: 0, CONJ: 0, ...m });
const iv = (a: AreaProtegida | AreaConfirmada, orgao: Orgao | null, m: Partial<Record<TipoRede, number>>, hectares = 0.0123): Intervencao =>
  ({ area: a, orgao, trechos: [], metros: metros(m), postesSemRede: [], hectares });
const casoCom = (...ivs: Intervencao[]): Caso => ({ municipio: 'Exemplo', litoral: false, intervencoes: ivs, proximas: [], avisos: [] });
const uc = (dentro: (AreaProtegida | AreaConfirmada)[], ponto: Pt = [469418, 9161031]): SituacaoUc =>
  ({ ponto, dentro, emApp: dentro.some((a) => 'largura' in a) });

const APP = confirmada('APP do Riacho Exemplo');
const DNOCS = area('Perímetro Exemplo', 'ÁREAS DE PERÍMETRO DNOCS');

describe('assunto do e-mail', () => {
  it('UC dentro da APP e toda a rede nova dentro dela', () => {
    const c = casoCom(iv(APP, orgaoApp, { BT: 100 }));
    expect(assuntoTexto(OS, partesDoAssunto(c, uc([APP]), metros({ BT: 100 })))).toBe('SOB 0000000001_PROCESSO DOCUMENTAL_UC E REDE EM APP');
  });
  it('UC fora e parte da rede na APP', () => {
    const c = casoCom(iv(APP, orgaoApp, { BT: 40 }));
    expect(assuntoTexto(OS, partesDoAssunto(c, uc([]), metros({ BT: 100 })))).toBe('SOB 0000000001_PROCESSO DOCUMENTAL_PARTE DA REDE EM APP');
  });
  it('UC dentro e parte da rede: "UC E PARTE DA REDE EM"', () => {
    const c = casoCom(iv(APP, orgaoApp, { BT: 40 }));
    expect(assuntoTexto(OS, partesDoAssunto(c, uc([APP]), metros({ BT: 100 })))).toBe('SOB 0000000001_PROCESSO DOCUMENTAL_UC E PARTE DA REDE EM APP');
  });
  it('UC fora e rede inteira: "REDE EM"', () => {
    const c = casoCom(iv(APP, orgaoApp, { MT: 80 }));
    expect(assuntoTexto(OS, partesDoAssunto(c, null, metros({ MT: 80 })))).toBe('SOB 0000000001_PROCESSO DOCUMENTAL_REDE EM APP');
  });
  it('rede inteira em duas áreas: junta os rótulos com " E " depois de um prefixo só', () => {
    const c = casoCom(iv(DNOCS, orgaoDnocs, { BT: 102, MT: 95 }), iv(APP, orgaoApp, { BT: 102, MT: 95 }));
    const partes = partesDoAssunto(c, uc([DNOCS, APP]), metros({ BT: 102, MT: 95 }));
    expect(assuntoTexto(OS, partes)).toBe('SOB 0000000001_PROCESSO DOCUMENTAL_UC E REDE EM ÁREAS PERÍMETRO IRRIGADO (DNOCS) E APP');
  });
  it('prefixos diferentes: junta as frases inteiras com " E "', () => {
    const c = casoCom(iv(DNOCS, orgaoDnocs, { BT: 100 }), iv(APP, orgaoApp, { BT: 30 }));
    const partes = partesDoAssunto(c, null, metros({ BT: 100 }));
    expect(assuntoTexto(OS, partes)).toBe('SOB 0000000001_PROCESSO DOCUMENTAL_REDE EM ÁREAS PERÍMETRO IRRIGADO (DNOCS) E PARTE DA REDE EM APP');
  });
  it('UC numa área e a rede só em outra: "UC EM ..." e "REDE EM ..."', () => {
    const c = casoCom(iv(APP, orgaoApp, { BT: 100 }));
    const partes = partesDoAssunto(c, uc([DNOCS]), metros({ BT: 100 }));
    expect(partes).toEqual([{ rotulo: 'APP', uc: false, rede: 'inteira' }, { rotulo: 'ÁREAS PERÍMETRO IRRIGADO (DNOCS)', uc: true, rede: null }]);
    expect(assuntoTexto(OS, partes)).toBe('SOB 0000000001_PROCESSO DOCUMENTAL_REDE EM APP E UC EM ÁREAS PERÍMETRO IRRIGADO (DNOCS)');
  });
  it('só a UC dentro da área', () => {
    expect(assuntoTexto(OS, partesDoAssunto(casoCom(), uc([APP]), metros({ BT: 50 })))).toBe('SOB 0000000001_PROCESSO DOCUMENTAL_UC EM APP');
  });
  it('"inteira" a partir do total menos 0,5 m', () => {
    const total = metros({ BT: 100 });
    expect(partesDoAssunto(casoCom(iv(APP, orgaoApp, { BT: 99.5 })), null, total)[0].rede).toBe('inteira');
    expect(partesDoAssunto(casoCom(iv(APP, orgaoApp, { BT: 99.49 })), null, total)[0].rede).toBe('parte');
  });
  it('duas áreas do mesmo rótulo sobrepostas não somam: 60 m + 60 m numa rede de 100 m é PARTE', () => {
    const outra = confirmada('Outra APP Exemplo');
    const c = casoCom(iv(APP, orgaoApp, { BT: 60 }), iv(outra, orgaoApp, { BT: 60 }));
    expect(partesDoAssunto(c, null, metros({ BT: 100 }))).toEqual([{ rotulo: 'APP', uc: false, rede: 'parte' }]);
    expect(textoCurto(OS, c, null, metros({ BT: 100 }))).not.toContain('Toda a extensão');
  });
  it('uma única área cobrindo a rede toda continua inteira, mesmo com outra do rótulo menor', () => {
    const c = casoCom(iv(APP, orgaoApp, { BT: 100 }), iv(confirmada('Outra APP Exemplo'), orgaoApp, { BT: 20 }));
    expect(partesDoAssunto(c, null, metros({ BT: 100 }))[0].rede).toBe('inteira');
  });
  it('obra só de poste: intervenção só de poste é rede inteira, no assunto e no texto curto', () => {
    const c = casoCom(iv(APP, orgaoApp, {}, 0.0010));
    expect(assuntoTexto(OS, partesDoAssunto(c, null, metros({})))).toBe('SOB 0000000001_PROCESSO DOCUMENTAL_REDE EM APP');
    const t = textoCurto(OS, c, null, metros({}));
    expect(t).toContain('Toda a extensão da rede a ser construída (só poste, sem extensão)');
    expect(t).toContain(`(${haTexto(0.001)} ha)`);
  });
  it('obra só de poste sem intervenção: assunto null e texto sem "não precisa de processo"', () => {
    expect(assuntoTexto(OS, partesDoAssunto(casoCom(), null, metros({})))).toBeNull();
    const t = textoCurto(OS, casoCom(), null, metros({}));
    expect(t).toBe('A rede a ser construída não está inserida em nenhuma área protegida.');
    expect(t).not.toMatch(/precisa/i);
  });
  it('UC federal ganha o rótulo da esfera', () => {
    const c = casoCom(iv(area('Parque Exemplo', 'UNIDADE DE CONSERVAÇÃO FEDERAL'), orgaoUcFed, { BT: 10 }));
    expect(assuntoTexto(OS, partesDoAssunto(c, null, metros({ BT: 10 })))).toBe('SOB 0000000001_PROCESSO DOCUMENTAL_REDE EM UNIDADE DE CONSERVAÇÃO FEDERAL');
  });
  it('sem intervenção e sem UC em área: null (a tela mostra o amarelo, nunca "não precisa de processo")', () => {
    expect(assuntoTexto(OS, partesDoAssunto(casoCom(), null, metros({ BT: 50 })))).toBeNull();
    expect(assuntoTexto(OS, partesDoAssunto(casoCom(), uc([]), metros({ BT: 50 })))).toBeNull();
    expect(assuntoTexto(OS, [])).toBeNull();
  });
  it('área sem rótulo na aba de modelos: null, nunca chuta', () => {
    const c = casoCom(iv(area('Zona Exemplo', 'MACROZONEAMENTO'), { categoria: 'Macrozona de Fortaleza', esfera: 'municipal', licencia: 'x', gestor: 'x' }, { BT: 10 }));
    expect(assuntoTexto(OS, partesDoAssunto(c, null, metros({ BT: 10 })))).toBeNull();
    const semOrgao = casoCom(iv(area('Pasta Nova', 'OUTRA'), null, { BT: 10 }));
    expect(assuntoTexto(OS, partesDoAssunto(semOrgao, null, metros({ BT: 10 })))).toBeNull();
  });
  it('rótulos sem texto "não precisa" e sem travessão', () => {
    for (const r of ROTULO_ASSUNTO) expect(r.rotulo).not.toMatch(/PRECISA|—/);
  });
});

describe('texto curto', () => {
  it('traz a coordenada da UC, os metros e os hectares iguais aos do caso', () => {
    const c = casoCom(iv(APP, orgaoApp, { BT: 45.4, MT: 20.2 }, 0.1848));
    const t = textoCurto(OS, c, uc([APP], [469418.3, 9161031.4]), metros({ BT: 45.4, MT: 20.2 }));
    expect(t).toContain(coordTexto([469418.3, 9161031.4]));
    expect(t).toContain(`${metrosTexto(45.4)} metros de rede BT`);
    expect(t).toContain(`${metrosTexto(20.2)} metros de rede MT`);
    expect(t).toContain(`(${haTexto(0.1848)} ha)`);
    expect(t).toContain('APP do Riacho Exemplo');
    expect(t).toContain('Toda a extensão');
  });
  it('rede em parte e UC fora de tudo', () => {
    const c = casoCom(iv(APP, orgaoApp, { BT: 30 }));
    const t = textoCurto(OS, c, uc([]), metros({ BT: 100 }));
    expect(t).toContain('não está inserida em nenhuma área protegida');
    expect(t).toMatch(/^A UC/);
    expect(t).toContain('Parte da rede');
  });
  it('sem intervenção: diz que a rede não está em área protegida e nunca "não precisa de processo"', () => {
    const t = textoCurto(OS, casoCom(), null, metros({ BT: 50 }));
    expect(t).toBe('A rede a ser construída não está inserida em nenhuma área protegida.');
    expect(t).not.toMatch(/precisa/i);
  });
});
