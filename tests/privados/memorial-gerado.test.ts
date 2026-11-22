// Prova que o memorial que o site escreve tem os números dos kits que os órgãos aprovaram, em duas provas:
// 1) exata: o memorial escreve exatamente o que o site calculou (o site mede pelo KML);
// 2) com a folga do kits.test.ts: o que o site calculou fica perto do memorial aprovado. O projetista mediu no CAD,
//    então alguns kits (4, 5, 6 e 8) diferem 1 a 2 m do KML, e exigir igualdade exata do gabarito seria falso vermelho.
// Dados do cliente inventados; só a rede, as áreas e os metros vêm do kit (casos-privados, fora do git).
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVADOS } from './caminhos.ts';
import { FAIXA_GLOBAL, alvoETolerancia, montarCasoDoKit, type KitGabarito } from './caso-do-kit.ts';
import { lerAreasProtegidas, type BaseAreas } from '../../src/nucleo/areas.ts';
import { montarMemorial } from '../../src/nucleo/memorial.ts';
import { textoDoDocumento } from '../../src/nucleo/docx.ts';
import { dadosVazios, type Empresa, type Responsavel } from '../../src/nucleo/obra.ts';
import { haTexto, metrosTexto } from '../../src/nucleo/formato.ts';
import type { TipoRede } from '../../src/nucleo/tipos.ts';

const GABARITO = join(PRIVADOS, 'gabarito.json');
const KMZ = join(PRIVADOS, 'areas-protegidas.kmz');
const TIPOS: TipoRede[] = ['MT', 'BT', 'CONJ'];

const empresa: Empresa = { nome: 'Empresa Exemplo Ltda', cnpj: '00.000.000/0001-00', endereco: 'Rua Exemplo, 1', municipio: 'Cidade Exemplo', telefone: '(00) 0000-0000', email: 'contato@exemplo.com', logo: null };
const rt: Responsavel = { nome: 'Beltrano Exemplo', registro: '000000', rnp: '0000000000', email: 'rt@exemplo.com', assinatura: null };

describe.skipIf(!existsSync(GABARITO) || !existsSync(KMZ))('memorial gerado contra os kits aprovados', () => {
  const kits: KitGabarito[] = existsSync(GABARITO) ? JSON.parse(readFileSync(GABARITO, 'utf-8')).kits : [];
  let base: BaseAreas;
  beforeAll(() => {
    base = lerAreasProtegidas(new Uint8Array(readFileSync(KMZ)), 'areas-protegidas.kmz');
  }, 120_000);

  kits.forEach((kit, i) => {
    it(`kit ${i + 1}`, () => {
      const { caso, rede, problemas } = montarCasoDoKit(kit, base);
      expect(problemas, 'APP sem polígono').toEqual([]);
      const texto = textoDoDocumento(montarMemorial({
        os: '0000000001', caso, rede, dados: dadosVazios(), empresa, rt, uc: null, arvores: [], limpeza: [],
        data: new Date(2026, 10, 19), assinar: false, imagens: {},
      }));

      const plano = texto.replace(/\s+/g, ' ');

      if (kit.intervencoes.some((x) => x.nomeNoKmz !== null)) expect(caso.intervencoes.length, 'o caso tem intervenções').toBeGreaterThan(0);

      // prova 1, exata: o memorial escreve o que o site calculou, trecho a trecho, sem folga
      for (const iv of caso.intervencoes) {
        const nome = iv.area.nome;
        const n = iv.trechos.reduce((s, t) => s + Math.round(t.metros), 0);
        const h = iv.trechos.reduce((s, t) => s + (Math.round(t.metros) * FAIXA_GLOBAL[t.tipo]) / 10000, 0);
        const frase = iv.trechos.length > 0
          ? `destes, ${metrosTexto(n)} metros (${haTexto(h)} ha) estão inseridos em ${nome}.`
          : `a intervenção em ${nome} é só de poste, com área de ${haTexto(iv.hectares)} ha.`;
        expect.soft(plano.includes(frase), `prova 1, ${nome}: esperado "${frase}"`).toBe(true);
      }

      // prova 2, com a folga do kits.test.ts: o que o site calculou fica perto do gabarito do memorial aprovado
      for (const esperado of kit.intervencoes) {
        if (esperado.nomeNoKmz === null) continue;
        const iv = caso.intervencoes.find((x) => x.area.nome === esperado.nomeNoKmz);
        expect.soft(iv, `prova 2, intervenção em ${esperado.nomeNoKmz}`).toBeDefined();
        if (!iv) continue;
        let haAlvo = 0;
        let haTol = 0;
        for (const t of TIPOS) {
          const { alvo, tol } = alvoETolerancia(esperado, t);
          const n = iv.trechos.filter((x) => x.tipo === t).reduce((s, x) => s + Math.round(x.metros), 0);
          expect.soft(Math.abs(n - alvo), `prova 2, ${t} em ${esperado.nomeNoKmz}: texto ${n} m, esperado ${alvo} m ±${tol.toFixed(1)}`).toBeLessThanOrEqual(tol);
          haAlvo += (alvo * FAIXA_GLOBAL[t]) / 10000;
          haTol += (tol * FAIXA_GLOBAL[t]) / 10000;
        }
        if (esperado.metrosKml === undefined && iv.trechos.length === 0) continue; // só poste: sem metros
        const h = iv.trechos.reduce((s, x) => s + (Math.round(x.metros) * FAIXA_GLOBAL[x.tipo]) / 10000, 0);
        const haEsperado = esperado.metrosKml ? haAlvo : esperado.haMemorial;
        expect.soft(Math.abs(h - haEsperado), `prova 2, hectares em ${esperado.nomeNoKmz}: ${haTexto(h)}, esperado ${haTexto(haEsperado)} ±${haTexto(haTol)}`).toBeLessThanOrEqual(haTol + 1e-9);
      }
    }, 120_000);
  });
});
