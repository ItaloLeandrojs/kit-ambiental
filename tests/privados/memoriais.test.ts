// Prova da conferência do texto contra os 11 memoriais aprovados pelos órgãos (desenho §6.7 e §8.1).
// Para cada kit: o memorial PDF é lido com o pdf.js, o caso é montado pelo KML do kit (passos 1 a 5, como o caso-do-kit.ts),
// e a planilha do kit, quando há, é conferida contra o caso e o memorial. Os vermelhos têm que ser exatamente os
// errosReais vermelhos do gabarito, nem a mais nem a menos, e cada errosReais amarelo tem que aparecer. Os outros
// amarelos são aceitos e ficam listados no resumo.
// OS, nomes e textos vêm do casos-privados (fora do git); o resumo vai para casos-privados/tmp.
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVADOS } from './caminhos.ts';
import { montarCasoDoKit, type KitGabarito } from './caso-do-kit.ts';
import { lerPdfNoNode } from '../ajuda/pdf-simples.ts';
import { lerAreasProtegidas, type BaseAreas } from '../../src/nucleo/areas.ts';
import { abrirZip, type ArquivoZip } from '../../src/nucleo/zip.ts';
import { lerKml } from '../../src/nucleo/kml.ts';
import { conferirPlanilha, conferirTexto, type ContextoTexto } from '../../src/nucleo/conferir-texto.ts';
import { lerLinhaDaObra, lerPlanilha } from '../../src/nucleo/planilha.ts';
import { lerCelulas } from '../../src/nucleo/xlsx.ts';
import type { Arvore } from '../../src/nucleo/arvores.ts';
import type { ItemConferencia } from '../../src/nucleo/conferir.ts';
import type { Pt } from '../../src/nucleo/tipos.ts';

const GABARITO = join(PRIVADOS, 'gabarito.json');
const KMZ = join(PRIVADOS, 'areas-protegidas.kmz');
const RESUMO = join(PRIVADOS, 'tmp', 'memoriais-resultado.txt');

interface ErroReal { codigo: string; nivel: 'vermelho' | 'amarelo' }
type Kit = KitGabarito & { errosReais: ErroReal[] };

const nomeDe = (a: ArquivoZip): string => a.caminho.split('/').pop()!;
const ehKml = (a: ArquivoZip): boolean => /\.km[lz]$/i.test(nomeDe(a)) && !/unificado/i.test(nomeDe(a));

// árvores e limpeza de faixa pelos KMLs do kit (passo das árvores feito pelo KML): ponto de PODA/SUPRESSÃO, polígono de LIMPEZA
function vegetacaoDoKit(arquivos: ArquivoZip[]): { arvores: Arvore[]; limpeza: Pt[][] } {
  const arvores: Arvore[] = [];
  const limpeza: Pt[][] = [];
  for (const a of arquivos.filter(ehKml)) {
    const nome = nomeDe(a);
    const intervencao = /supress/i.test(nome) ? 'supressao' : /poda/i.test(nome) ? 'poda' : null;
    for (const f of lerKml(a.bytes)) {
      for (const g of f.geometrias) {
        if (intervencao && g.t === 'ponto') arvores.push({ id: `a${arvores.length + 1}`, foto: '', ponto: g.p, especie: '', intervencao });
        if (/limpeza/i.test(nome) && g.t === 'poligono') limpeza.push(g.aneis[0]);
      }
    }
  }
  return { arvores, limpeza };
}

const linhaDoItem = (x: ItemConferencia): string => `${x.nivel} ${x.codigo}: ${x.titulo} | ${x.porque}`;

describe.skipIf(!existsSync(GABARITO) || !existsSync(KMZ))('memoriais aprovados lidos pelo conferidor do texto', () => {
  // o Vitest roda este corpo mesmo com a suíte pulada: aqui só se lê o gabarito, e só se ele existir
  const kits: Kit[] = existsSync(GABARITO) ? JSON.parse(readFileSync(GABARITO, 'utf-8')).kits : [];
  let base: BaseAreas;
  const resumo: string[] = [];
  beforeAll(() => {
    base = lerAreasProtegidas(new Uint8Array(readFileSync(KMZ)), 'areas-protegidas.kmz');
  }, 120_000);

  // os 3 erros do estudo (§2.3; o do total sai amarelo, o desenho aceita "vermelhos ou amarelos") e as contradições
  // planilha x memorial que o Italo decidiu tratar como erro real (20/11)
  it('o gabarito tem os 11 kits, cada um com errosReais, e só os erros reais decididos', () => {
    expect(kits).toHaveLength(11);
    for (const k of kits) expect(Array.isArray(k.errosReais), k.zip).toBe(true);
    expect(kits.flatMap((k) => k.errosReais).map((e) => `${e.codigo} ${e.nivel}`).sort()).toEqual([
      'HA_TRECHO vermelho', 'PLANILHA_APP vermelho', 'PLANILHA_ASSUNTO vermelho', 'PLANILHA_METROS vermelho', 'PLANILHA_METROS vermelho',
      'PLANILHA_METROS vermelho', 'PLANILHA_METROS vermelho', 'PLANILHA_PODA vermelho', 'TRECHO_ILEGIVEL amarelo',
    ]);
  });

  kits.forEach((kit, i) => {
    it(`kit ${i + 1}: os vermelhos são exatamente os erros reais`, async () => {
      const os = kit.zip.split('/').pop()!.replace(/\.zip$/i, '');
      const { bytes, caso, rede, problemas } = montarCasoDoKit(kit, base);
      expect(problemas, 'APP sem polígono').toEqual([]);
      const arquivos = abrirZip(bytes);
      const memorial = arquivos.find((a) => /(^|\/)memorial\/[^/]+\.pdf$/i.test(a.caminho));
      expect(memorial, 'memorial PDF na pasta MEMORIAL').toBeDefined();
      const { paginas, temTexto } = await lerPdfNoNode(memorial!.bytes);
      expect(temTexto, 'o memorial tem texto').toBe(true);
      const texto = paginas.join('\n');

      const { arvores, limpeza } = vegetacaoDoKit(arquivos);
      // uc: undefined = o teste não sabe onde está a UC (o assunto confere só a parte da rede); rt: null = sem RT guardado
      const ctx: ContextoTexto = {
        os, caso, rede, nomesDaBase: base.areas.map((a) => a.nome), arvores, limpeza,
        municipioKmz: caso.municipio, rt: null, metrosZip: null, uc: undefined,
      };
      const itens = conferirTexto(texto, ctx);

      const planilha = arquivos.find((a) => /\.xls[xm]$/i.test(a.caminho));
      let itensPlanilha: ItemConferencia[] = [];
      if (planilha) {
        const p = lerPlanilha(planilha.bytes, nomeDe(planilha));
        const linha = lerLinhaDaObra(p);
        const assunto = (lerCelulas(p.pasta, p.aba).get('A1') ?? '').split(/\r?\n/).reverse().find((l) => /^\s*SOB\b/i.test(l)) ?? null;
        itensPlanilha = conferirPlanilha(linha, { ...ctx, textoMemorial: texto, assunto });
      }

      const todos = [...itens, ...itensPlanilha];
      const vermelhos = todos.filter((x) => x.nivel === 'vermelho');
      const amarelos = todos.filter((x) => x.nivel === 'amarelo');
      const contagem = new Map<string, number>();
      for (const a of amarelos) contagem.set(a.codigo, (contagem.get(a.codigo) ?? 0) + 1);
      resumo.push(`=== kit ${i + 1} (${os}) planilha: ${planilha ? 'sim' : 'não'}; árvores ${arvores.length}; limpeza ${limpeza.length}`);
      resumo.push(`  amarelos: ${amarelos.length} (${[...contagem].map(([c, n]) => `${c} ${n}`).join(', ')})`);
      for (const x of todos.filter((y) => y.nivel !== 'verde')) resumo.push(`  ${linhaDoItem(x)}`);
      mkdirSync(join(PRIVADOS, 'tmp'), { recursive: true });
      writeFileSync(RESUMO, resumo.join('\n'));

      // com as repetições: um segundo vermelho do mesmo código não passa escondido atrás do primeiro
      const esperados = kit.errosReais.filter((e) => e.nivel === 'vermelho').map((e) => e.codigo).sort();
      expect.soft(vermelhos.map((x) => x.codigo).sort(), `vermelhos do kit ${i + 1}:\n${vermelhos.map(linhaDoItem).join('\n')}`).toEqual(esperados);
      // cada erro real amarelo (o do total do kit 4, por exemplo) tem que aparecer entre os amarelos
      for (const e of kit.errosReais.filter((x) => x.nivel === 'amarelo')) expect.soft(amarelos.map((x) => x.codigo), `amarelo ${e.codigo}`).toContain(e.codigo);
    }, 120_000);
  });
});
