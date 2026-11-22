import { describe, expect, it } from 'vitest';
import { gravarCasoSalvo, hashDoProjeto, lerCasoSalvo, type CasoSalvo } from '../src/nucleo/caso-salvo.ts';
import { dadosVazios } from '../src/nucleo/obra.ts';

const exemplo = (): CasoSalvo => {
  const dados = dadosVazios();
  dados.interessado.nome = 'Fulano de Teste';
  dados.tipoAgua = { 3: 'rio', 12: 'lagoa' };
  dados.rede.postes = [{ altura: 11, daN: 300, quantidade: 2 }];
  return {
    versao: 1, os: '000000', projetoNome: 'projeto.dxf', projetoHash: 'a'.repeat(64),
    dados, uc: [550000.5, 9580000.25],
    marcas: { '0': { tipo: 'MT', situacao: 'novo' }, '1': { tipo: null, situacao: 'existente' } },
    camadasIncluidas: [{ camada: 'REDE_X', tipo: 'BT' }],
    apps: [{ aguaId: 3, resposta: 'confirmada', largura: 30 }, { aguaId: 12, resposta: 'recusada', largura: 15 }],
    m2Postes: { '4': 25 },
    arvores: [{ id: 'a1', foto: 'IMG_0001.jpg', ponto: [550010, 9580010], especie: 'Mangueira', intervencao: 'poda' }],
    limpeza: [[[0, 0], [10, 0], [10, 10]]], liberado: true,
  };
};

describe('caso salvo', () => {
  it('ida e volta dá o mesmo caso, inclusive as chaves numéricas de tipoAgua', () => {
    const c = exemplo();
    const volta = lerCasoSalvo(gravarCasoSalvo(c));
    expect(volta).toEqual(c);
    expect(Object.keys(volta.dados.tipoAgua)).toEqual(['3', '12']);
    expect(volta.dados.tipoAgua[3]).toBe('rio');
  });

  it('grava JSON com 2 espaços', () => {
    expect(gravarCasoSalvo(exemplo())).toContain('\n  "versao": 1');
  });

  it('JSON de outra coisa lança o erro', () => {
    const erro = 'Este arquivo não é um caso salvo do Kit Ambiental.';
    expect(() => lerCasoSalvo('isto não é json')).toThrow(erro);
    expect(() => lerCasoSalvo('{"a":1}')).toThrow(erro);
    expect(() => lerCasoSalvo('[]')).toThrow(erro);
    expect(() => lerCasoSalvo('null')).toThrow(erro);
  });

  it('versão 2 lança o aviso de versão mais nova', () => {
    const c = { ...exemplo(), versao: 2 };
    expect(() => lerCasoSalvo(JSON.stringify(c))).toThrow('Este caso foi salvo por uma versão mais nova do site.');
  });

  it('não grava empresa, RT, CNPJ nem assinatura, mesmo com campos a mais', () => {
    const c = { ...exemplo(), empresa: { nome: 'X', cnpj: '00.000.000/0000-00' }, responsavel: { assinatura: 'bytes' } } as unknown as CasoSalvo;
    const texto = gravarCasoSalvo(c).toLowerCase();
    expect(texto).not.toContain('cnpj');
    expect(texto).not.toContain('assinatura');
    expect(texto).not.toContain('empresa');
    expect(texto).not.toContain('responsavel');
    expect(Object.keys(JSON.parse(gravarCasoSalvo(c))).sort()).toEqual(Object.keys(exemplo()).sort());
  });

  it('a foto da árvore vai só pelo nome', () => {
    const o = JSON.parse(gravarCasoSalvo(exemplo()));
    expect(o.arvores[0].foto).toBe('IMG_0001.jpg');
    expect(typeof o.arvores[0].foto).toBe('string');
  });

  it('hashDoProjeto dá o SHA-256 em hex minúsculo', async () => {
    const h = await hashDoProjeto(new TextEncoder().encode('abc'));
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
