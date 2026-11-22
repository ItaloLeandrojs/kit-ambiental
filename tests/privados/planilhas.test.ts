// Prova contra a Planilha Padrão da Enel (fora do git, em casos-privados/planilhas e nos kits).
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVADOS } from './caminhos.ts';
import { alvoETolerancia, montarCasoDoKit, type KitGabarito } from './caso-do-kit.ts';
import { abrirZip } from '../../src/nucleo/zip.ts';
import { ROTULO_ASSUNTO } from '../../src/regras/assunto.ts';
import { escolherOpcao, lerLinhaDaObra, lerPlanilha, preencherPlanilha, revisaoDoNome } from '../../src/nucleo/planilha.ts';
import { REGRAS_COLUNAS, type Campo } from '../../src/regras/planilha.ts';
import { lerAreasProtegidas, type BaseAreas } from '../../src/nucleo/areas.ts';
import { dadosVazios, metrosDaRede, type Empresa } from '../../src/nucleo/obra.ts';
import type { TipoRede } from '../../src/nucleo/tipos.ts';
import { lerImagem } from '../../src/nucleo/docx.ts';

const TIPOS_REDE: TipoRede[] = ['MT', 'BT', 'CONJ'];
const CAMPO_METROS: Record<TipoRede, Campo> = { MT: 'metrosMT', BT: 'metrosBT', CONJ: 'metrosCONJ' };

const PASTA = join(PRIVADOS, 'planilhas');
const REV09 = existsSync(PASTA) ? readdirSync(PASTA).find((n) => n.startsWith('SOB') && n.includes('REV 09')) : undefined;

const decodificar = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');

// os modelos da aba "Modelos Assunto E-mail" são as strings que começam com o assunto padrão
function modelosDoAssunto(): string[] {
  const arquivos = abrirZip(new Uint8Array(readFileSync(join(PASTA, REV09!))));
  const compartilhadas = arquivos.find((a) => a.caminho === 'xl/sharedStrings.xml');
  expect(compartilhadas).toBeDefined();
  const xml = new TextDecoder().decode(compartilhadas!.bytes);
  const itens = [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decodificar([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  // alguns modelos da aba escrevem "PARTE REDE" sem o "DA"; o site usa sempre "DA"
  return itens.filter((s) => s.startsWith('SOB XXXXXXXXXX_PROCESSO DOCUMENTAL_')).map((s) => s.replace('PARTE REDE', 'PARTE DA REDE'));
}

describe.skipIf(REV09 === undefined)('Planilha Padrão REV 09: aba Modelos Assunto E-mail', () => {
  it('a aba tem os modelos de assunto', () => {
    expect(modelosDoAssunto().length).toBeGreaterThan(100);
  });
  for (const r of ROTULO_ASSUNTO) {
    it(`o rótulo "${r.rotulo}" aparece em algum modelo da aba`, () => {
      const procurado = r.modelo ?? r.rotulo;
      const modelos = modelosDoAssunto();
      expect(modelos.some((m) => m.endsWith(`_UC E REDE EM ${procurado}`) || m.endsWith(`_REDE EM ${procurado}`))).toBe(true);
      expect(modelos.some((m) => m.endsWith(`_UC E PARTE DA REDE EM ${procurado}`))).toBe(true);
      expect(modelos.some((m) => m.endsWith(`_PARTE DA REDE EM ${procurado}`))).toBe(true);
    });
  }
});

// ---------- Tarefa 8: leitura da planilha pelo cabeçalho ----------
// As 10 planilhas dos kits aprovados (um kit não tem planilha) e a REV 09 da pasta planilhas. Nomes vêm do gabarito e dos zips.

const GABARITO = join(PRIVADOS, 'gabarito.json');
const ehPlanilha = (n: string): boolean => /\.xls[xm]$/i.test(n);

function planilhasDosKits(): { origem: string; nome: string; bytes: Uint8Array }[] {
  const g = JSON.parse(readFileSync(GABARITO, 'utf8')) as { kits: { zip: string }[] };
  const saida: { origem: string; nome: string; bytes: Uint8Array }[] = [];
  for (const k of g.kits) {
    for (const a of abrirZip(new Uint8Array(readFileSync(join(PRIVADOS, k.zip))))) {
      if (ehPlanilha(a.caminho)) saida.push({ origem: k.zip, nome: a.caminho.split('/').pop()!, bytes: a.bytes });
    }
  }
  if (REV09) saida.push({ origem: 'planilhas', nome: REV09, bytes: new Uint8Array(readFileSync(join(PASTA, REV09))) });
  return saida;
}

const TODOS: Campo[] = [...new Set(REGRAS_COLUNAS.map((r) => r.campo))];
// Da Rev.06 em diante só falta a limpeza de faixa, que entrou dentro da supressão.
const SEM_NA_REV06: Campo[] = ['limpeza'];
// Campos que a Rev.05 tem (lidos nas 7 planilhas Rev.05 dos kits). Ela não tem: órgão da APP da UC, UC em área ambiental,
// área da UC, reforma agrária, as 3 de manutenção sob a rede (a Rev.05 pergunta "SITUAÇÃO DA LICENÇA SED/ALIM", outra coisa),
// área de permissão e validador Enel. Ficam desconhecidas na Rev.05 as 3 de "SITUAÇÃO DA LICENÇA", "ATIVIDADE DO SOLICITANTE",
// "IMPACTO LOCAL OU REGIONAL" e "INSPETOR".
const DA_REV05: Campo[] = [
  'sob', 'dataSob', 'municipio', 'sed', 'zona', 'metrosBT', 'metrosMT', 'metrosCONJ', 'poda', 'podaAnexada', 'supressao', 'limpeza',
  'solicitante', 'regularidadeApresentou', 'regularidadeAnexou', 'appUc', 'appRede', 'areaDaRede', 'orgaoAreaRede', 'permissaoOrgao',
  'cvtFotos', 'parceira',
];
// Letras conferidas no Excel, para provar que o casamento pelo texto acha a coluna certa (e não só "alguma").
const LETRAS_REV06: Partial<Record<Campo, string>> = { sob: 'A', zona: 'E', metrosMT: 'G', metrosCONJ: 'H', supressao: 'K', appUc: 'O', appRede: 'W', areaDaRede: 'X', orgaoAreaRede: 'Y', permissaoArea: 'Z', permissaoOrgao: 'AA', parceira: 'AF' };
const LETRAS_REV05: Partial<Record<Campo, string>> = { sob: 'A', metrosBT: 'H', metrosMT: 'I', metrosCONJ: 'J', supressao: 'M', limpeza: 'N', appUc: 'O', appRede: 'P', areaDaRede: 'Q', orgaoAreaRede: 'R', permissaoOrgao: 'S', zona: 'AA', parceira: 'AD' };

describe.skipIf(!existsSync(GABARITO))('Planilha Padrão dos kits aprovados: leitura pelo cabeçalho', () => {
  const todas = existsSync(GABARITO) ? planilhasDosKits() : [];

  it('acha as 10 planilhas dos kits e a REV 09', () => {
    expect(todas.filter((p) => p.origem !== 'planilhas').length).toBe(10);
    expect(todas.some((p) => p.origem === 'planilhas')).toBe(REV09 !== undefined);
  });

  for (const p of todas) {
    const rev05 = /Rev\.05/i.test(p.nome);
    it(`${p.origem}: ${revisaoDoNome(p.nome)} abre e acha as colunas`, () => {
      const pl = lerPlanilha(p.bytes, p.nome);
      expect(pl.revisao).toMatch(/^(REV 09 · 20\/03\/2026|Rev\.06 · 24\/02\/2026|Rev\.05 · 16\/02\/2025)$/);
      expect(pl.linhaCabecalho).toBe(rev05 ? 3 : 4);
      const esperados = rev05 ? DA_REV05 : TODOS.filter((c) => !SEM_NA_REV06.includes(c));
      const faltam = esperados.filter((c) => pl.campos[c] === undefined);
      expect(faltam).toEqual([]);
      const sobram = (Object.keys(pl.campos) as Campo[]).filter((c) => !esperados.includes(c));
      expect(sobram).toEqual([]);
      for (const [c, l] of Object.entries(rev05 ? LETRAS_REV05 : LETRAS_REV06)) expect(pl.campos[c as Campo], c).toBe(l);
      if (rev05) expect(pl.desconhecidas.map((c) => c.letra)).toEqual(['E', 'F', 'G', 'W', 'X', 'Y']);
      else expect(pl.desconhecidas).toEqual([]);
    });

    it(`${p.origem}: as listas da APP e da zona vêm da validação da célula`, () => {
      const pl = lerPlanilha(p.bytes, p.nome);
      const opcoes = (c: Campo): string[] | null => pl.colunas.find((x) => x.letra === pl.campos[c])!.opcoes;
      const app = opcoes('appRede');
      expect(app).not.toBeNull();
      expect(app).toContain('SIM (RIO/RIACHO)');
      expect(escolherOpcao('SIM (RIO/RIACHO)', app!)).toBe('SIM (RIO/RIACHO)');
      // a lista da APP da REV 09 troca o "NÃO" por "NÃO SE APLICA" (a Rev.06 tem "NÃO"): o começo único acha a que existe
      expect(escolherOpcao('nao', app!)).toBe(app!.includes('NÃO') ? 'NÃO' : 'NÃO SE APLICA');
      expect(opcoes('zona')).toEqual(expect.arrayContaining(['RURAL', 'URBANA']));
      expect(opcoes('poda')).toEqual(expect.arrayContaining(['SIM', 'NÃO']));
      // SOB, município e nome do solicitante são texto livre
      expect(opcoes('sob')).toBeNull();
      expect(opcoes('solicitante')).toBeNull();
    });
  }
});

// ---------- Tarefa 9: preencher a REV 09 com o caso de um kit aprovado ----------
// O kit é o de rede conjugada cuja planilha aprovada tem BT 23, MT 16 e conjugada 79 (achado pelo gabarito, nunca pelo número).
// O caso é montado pelo KML do kit; os dados do cliente são inventados. O arquivo gerado fica em casos-privados/tmp/ para
// abrir no Excel (script casos-privados/tmp/t9_excel.ps1, rodado à mão).

const KMZ = join(PRIVADOS, 'areas-protegidas.kmz');
const SAIDA = join(PRIVADOS, 'tmp', 'planilha-gerada-t9.xlsm');
const ASSINATURAS = join(PRIVADOS, 'assinatura');
const empresa: Empresa = { nome: 'Empresa Exemplo Ltda', cnpj: '00.000.000/0001-00', endereco: 'Rua Exemplo, 1', municipio: 'Cidade Exemplo', telefone: '(00) 0000-0000', email: 'contato@exemplo.com', logo: null };
const kitConjugado = (): KitGabarito | undefined => {
  const kits = JSON.parse(readFileSync(GABARITO, 'utf8')).kits as KitGabarito[];
  return kits.find((k) => k.intervencoes.some((iv) => iv.metrosMemorial.BT === 23 && iv.metrosMemorial.MT === 16 && iv.metrosMemorial.CONJ === 79));
};

describe.skipIf(REV09 === undefined || !existsSync(GABARITO) || !existsSync(KMZ))('Planilha Padrão REV 09 preenchida com o caso de um kit aprovado', () => {
  let base: BaseAreas;
  beforeAll(() => {
    base = lerAreasProtegidas(new Uint8Array(readFileSync(KMZ)), 'areas-protegidas.kmz');
  }, 120_000);

  it('a linha da obra tem BT 23, MT 16 e conjugada 79, como a planilha aprovada, e a macro segue igual', () => {
    const kit = kitConjugado();
    expect(kit, 'kit com BT 23, MT 16 e conjugada 79 no gabarito').toBeDefined();
    const os = kit!.zip.split('/').pop()!.replace(/\.zip$/i, '');
    const { caso, rede, problemas } = montarCasoDoKit(kit!, base);
    expect(problemas).toEqual([]);
    const bytes = new Uint8Array(readFileSync(join(PASTA, REV09!)));
    const dados = dadosVazios();
    dados.interessado.nome = 'Fulano & Filhos <Exemplo>';
    dados.obra.zona = 'RURAL';
    const r = preencherPlanilha(lerPlanilha(bytes, REV09!), { os, caso, rede, dados, empresa, uc: null, arvores: [], limpeza: [], assinatura: null, base });

    const p = lerPlanilha(r.bytes, r.nome);
    const linha = lerLinhaDaObra(p);
    // prova 1, exata: a planilha tem os metros inteiros do caso (a regra do site)
    const m = metrosDaRede(rede);
    for (const t of TIPOS_REDE) expect(linha[CAMPO_METROS[t]], t).toBe(String(Math.round(m[t])));
    // prova 2, contra a planilha aprovada: BT 23 e conjugada 79 iguais; a MT do KML dá 15,2 m e a aprovada diz 16 (medida
    // no CAD; é o kit 4 que o memorial-gerado.test.ts já descreve como 1 a 2 m diferente do KML). Folga do kits.test.ts.
    const esperado = kit!.intervencoes[0];
    expect(linha.metrosBT).toBe('23');
    expect(linha.metrosCONJ).toBe('79');
    const { alvo, tol } = alvoETolerancia(esperado, 'MT');
    expect(alvo).toBe(16);
    expect(Math.abs(Number(linha.metrosMT) - alvo)).toBeLessThanOrEqual(tol);
    expect(linha.sob).toBe(String(Number(os)));
    expect(linha.solicitante).toBe('Fulano & Filhos <Exemplo>');
    expect(linha.zona).toBe('RURAL');
    expect(r.nome.startsWith(`SOB ${os}_`)).toBe(true);
    expect(r.nome.endsWith('REV 09_20.03.2026.xlsm')).toBe(true);
    // a macro e as outras abas ficam iguais, byte a byte
    const antes = new Map(abrirZip(bytes).map((a) => [a.caminho, a.bytes]));
    const depois = new Map(abrirZip(r.bytes).map((a) => [a.caminho, a.bytes]));
    expect([...depois.keys()].sort()).toEqual([...antes.keys()].sort());
    for (const [c, b] of antes) if (c !== p.pasta.abas[0].caminho) expect(depois.get(c), c).toEqual(b);
    mkdirSync(join(PRIVADOS, 'tmp'), { recursive: true });
    // a REV 09 guardada tem a assinatura de um RT: sai o vermelho (ver o teste abaixo)
    expect(r.avisos.filter((a) => a.nivel === 'vermelho').map((a) => a.codigo)).toEqual(['PLANILHA_JA_ASSINADA']);
    writeFileSync(SAIDA, r.bytes);
  }, 120_000);

  // a REV 09 guardada veio de um kit usado e já tem a assinatura de um RT nas linhas da assinatura: o certo é o vermelho
  // pedindo a planilha em branco, sem pôr a assinatura nova por cima e sem mexer no desenho
  it.skipIf(!existsSync(ASSINATURAS))('a REV 09 guardada já tem assinatura: vermelho e a assinatura nova não entra', () => {
    const kit = kitConjugado()!;
    const os = kit.zip.split('/').pop()!.replace(/\.zip$/i, '');
    const { caso, rede } = montarCasoDoKit(kit, base);
    const arquivo = readdirSync(ASSINATURAS).find((n) => n.toLowerCase().endsWith('.png'))!;
    const png = lerImagem(new Uint8Array(readFileSync(join(ASSINATURAS, arquivo))))!;
    const bytes = new Uint8Array(readFileSync(join(PASTA, REV09!)));
    const r = preencherPlanilha(lerPlanilha(bytes, REV09!), { os, caso, rede, dados: dadosVazios(), empresa, uc: null, arvores: [], limpeza: [], assinatura: png, base });
    const vermelhos = r.avisos.filter((a) => a.nivel === 'vermelho');
    expect(vermelhos.map((a) => a.codigo)).toEqual(['PLANILHA_JA_ASSINADA']);
    const parte = (b: Uint8Array, c: string): Uint8Array => abrirZip(b).find((a) => a.caminho === c)!.bytes;
    expect(parte(r.bytes, 'xl/drawings/drawing1.xml')).toEqual(parte(bytes, 'xl/drawings/drawing1.xml'));
    expect(parte(r.bytes, '[Content_Types].xml')).toEqual(parte(bytes, '[Content_Types].xml'));
    expect(abrirZip(r.bytes).filter((a) => a.caminho.startsWith('xl/media/')).length).toBe(abrirZip(bytes).filter((a) => a.caminho.startsWith('xl/media/')).length);
  }, 120_000);
});
