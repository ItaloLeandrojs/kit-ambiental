import { describe, expect, it } from 'vitest';
import type { Pt, Rede } from '../src/nucleo/tipos.ts';
import type { AreaProtegida, BaseAreas } from '../src/nucleo/areas.ts';
import { calcularCaso, type AreaConfirmada } from '../src/nucleo/caso.ts';
import { resumoTexto } from '../src/nucleo/resumo.ts';

const anel = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const uc = (nome: string, pasta: string[]): AreaProtegida => ({
  id: 1, nome, pasta, atributos: {}, poligonos: [[anel(500000, 9500000, 500400, 9500100)]], linhas: [], caixa: [500000, 9500000, 500400, 9500100],
});
const base = (areas: AreaProtegida[]): BaseAreas => ({ revisao: 't', data: '', areas, municipios: [] });
const redeMt: Rede = {
  origem: 'dxf',
  vaos: [{ id: 'a', pts: [[500010, 9500050], [500318, 9500050]], camada: 'C', tipo: 'MT', situacao: 'novo', motivo: '' }],
  postes: [
    { id: 'p6', ponto: [500010, 9500050], numero: '6', novo: true, coordEscrita: null, etiqueta: null },
    { id: 'p8', ponto: [500318, 9500050], numero: '8', novo: true, coordEscrita: [500318, 9500050], etiqueta: null },
  ],
};

describe('resumoTexto', () => {
  it('uma linha por intervenção, no jeito do memorial, depois órgão e avisos', () => {
    const caso = calcularCaso(redeMt, base([uc('Parque Inventado', ['Unidade de Conservação Estadual', 'Uso Sustentável'])]), []);
    const linhas = resumoTexto(caso, '123').split('\n');
    expect(linhas[0]).toBe('OS 123');
    expect(linhas[1]).toBe(
      'A intervenção ocorrerá entre o poste Nº 6 (0500010, 9500050) e o poste Nº 8 (0500318, 9500050), com cerca de 308 metros da rede de média tensão, com área de 0,1848 ha, dentro de Parque Inventado.',
    );
    expect(linhas[2]).toBe('Órgão: licencia SEMACE; gestor SEMA.');
  });

  it('área sem órgão sai com o aviso, sem chutar', () => {
    const t = resumoTexto(calcularCaso(redeMt, base([uc('Corredor Inventado', ['Corredor do Pacoti'])]), []), '');
    expect(t).toContain('Órgão: não identificado; consultar o P&M.');
    expect(t).toContain('Aviso: Corredor Inventado: órgão não identificado; consultar o P&M');
    expect(t.toLowerCase()).not.toContain('não precisa de processo');
  });

  it('só poste novo na APP confirmada', () => {
    const app: AreaConfirmada = { nome: 'APP inventada', tipo: 'APP', poligono: [anel(500000, 9500000, 500100, 9500100)], largura: 100 };
    const r: Rede = { origem: 'dxf', vaos: [], postes: [{ id: 'p1', ponto: [500050, 9500050], numero: '1', novo: true, coordEscrita: null, etiqueta: null }] };
    const t = resumoTexto(calcularCaso(r, base([]), [app]), '');
    expect(t).toContain('A intervenção ocorrerá com 1 poste novo, sem rede nova na área, com área de 0,0002856 ha, dentro de APP inventada.');
  });

  it('sem rede nova: só o aviso', () => {
    expect(resumoTexto(calcularCaso({ origem: 'dxf', vaos: [], postes: [] }, base([]), []), '')).toBe(
      'Aviso: Nenhuma rede nova marcada. Confirme no mapa o que é rede nova.',
    );
  });

  it('usa a coordenada da geometria, não a escrita; poste sem número fica só com a coordenada', () => {
    const r: Rede = {
      origem: 'dxf',
      vaos: redeMt.vaos,
      postes: [
        { id: 'p6', ponto: [500010, 9500050], numero: null, novo: true, coordEscrita: [500999, 9500999], etiqueta: null },
        { id: 'p8', ponto: [500318, 9500050], numero: '8', novo: true, coordEscrita: [500777, 9500777], etiqueta: null },
      ],
    };
    const t = resumoTexto(calcularCaso(r, base([uc('Parque Inventado', ['Unidade de Conservação Estadual', 'Uso Sustentável'])]), []), '');
    expect(t).toContain('entre o poste (0500010, 9500050) e o poste Nº 8 (0500318, 9500050)');
    expect(t).not.toContain('sem número');
  });
});
