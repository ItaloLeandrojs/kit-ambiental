# Kit Ambiental

Site estático que roda só no navegador. Diz se uma obra de rede elétrica no Ceará precisa de processo ambiental, monta o kit (KML e shapefile, na pasta certa) e confere o zip antes de ir para o órgão.

Nada sai do computador: o KMZ, o projeto e as fotos são lidos no próprio navegador. A única chamada de rede é buscar os arquivos de estradas que já vêm com o site. O site está publicado em https://italoleandrojs.github.io/kit-ambiental/ e tem `noindex` (não aparece no Google).

## Como usar

O painel da esquerda tem 7 passos e o mapa fica à direita.

1. **KMZ de Áreas Protegidas** (e, se for o caso, as malhas DNIT e SOP). Só na primeira vez: ficam guardados no navegador (IndexedDB).
2. **Projeto**: a OS (10 dígitos) e o DXF do projeto, ou o KML da rede. Se o desenho estiver fora do Ceará ou fora do lugar, o site para e avisa.
3. **Confirmar a rede**: o site separa MT, BT e conjugada novas pelo desenho. Só a rede nova conta. Clique no vão para trocar a marca.
4. **Árvores**: fotos com GPS viram pontos de poda ou supressão; sem GPS, clique no mapa.
5. **O caso**: áreas cruzadas, órgão, metros, hectares e avisos em amarelo ou vermelho.
6. **Baixar**: o zip do kit (pastas KML e SHAPEFILE) e o resumo em texto.
7. **Conferir um zip**: confere um kit já montado.

Faixa da rede: 6 m na MT, 3 m na BT e 6 m na conjugada. Hectares = metros arredondados × faixa ÷ 10.000. Coordenadas em SIRGAS 2000 UTM 24 Sul (EPSG:31984).

## Como rodar

```
npm install
npm run dev      # abre o site em modo de desenvolvimento
npm test         # todos os testes
npm run build    # confere os tipos e gera o site em dist/
```

Um teste só: `npx vitest run tests/<arquivo>`.

## Dados reais (casos-privados)

Os dados reais não entram no repositório (que é público): o KMZ de Áreas Protegidas, os kits aprovados, as malhas DNIT e SOP, os DXFs de obra e o gabarito ficam em `casos-privados/`, que está no `.gitignore`. Os testes do repositório usam dados inventados.

Os testes que usam os dados reais ficam em `tests/privados/` e **pulam sozinhos** quando `casos-privados/` não existe. Com a pasta, eles rodam junto com o `npm test`. Se um deles falhar, ou se um kit aprovado sair vermelho, o problema está no código ou na regra, nunca no gabarito: não afrouxe a regra nem mexa no gabarito para passar.

Para montar a pasta, o script copia os arquivos de origem. Os caminhos vêm por argumento, nenhum fica guardado no código:

```
node scripts/preparar-casos.ts --kmz <KMZ de Áreas Protegidas> --kits <zip com os kits aprovados> --dxf <pasta com os DXFs de teste> --malhas <zip com as malhas DNIT e SOP>
```

- `--kmz`: o KMZ de Áreas Protegidas do Ceará (copiado como `areas-protegidas.kmz`).
- `--kits`: o zip com a pasta "MODELOS DE PROCESSOS VALIDADOS"; os zips de dentro vão para `kits/<OS>.zip`.
- `--dxf`: pasta com uma subpasta por caso, cada uma com um `obra.dxf` (a subpasta `referencia` é ignorada); vão para `dxf/<subpasta>.dxf`.
- `--malhas`: zip com a malha do DNIT (`.kml`) e a da SOP (`.kmz`); vão para `malhas/DNIT.kml` e `malhas/SOP.kmz`.

Esperado: o número de kits aprovados, 4 DXFs, o KMZ e 2 malhas. Depois, `git status` não mostra nada de `casos-privados`.

O script **não** cria `casos-privados/gabarito.json`: ele é feito à mão (para cada kit aprovado, as áreas, os metros e os hectares do memorial) e é guardado fora do git, junto com a pasta. Sem ele, os testes privados que dependem dele não rodam. As fotos de teste (`casos-privados/fotos-teste/`, com e sem GPS, para experimentar o passo 4) saem de `casos-privados/gera-fotos.ts`, que usa o `tests/jpeg-gps.ts`; rode a partir da raiz do projeto: `node casos-privados/gera-fotos.ts`.

## Quando um processo voltar do órgão

Anote o motivo, escreva um teste que reproduza e corrija a regra em `src/regras` ou no núcleo (`src/nucleo`). Assim o mesmo erro não volta.

## Textos e valores a confirmar

O que ainda não foi confirmado e está marcado no código. Quando for confirmado, a mudança é só no arquivo indicado.

- **Textos provisórios** (`src/regras/textos.ts`, marcados como "provisório"): `cruzaLinha`, `posteAConfirmar`, `faixaSemMalha`, `faixaSemMalhaDnit`, `faixaSemMalhaSop`, `faixaFerrovia`, `faixaSemFerrovia` (amarelo quando falta a malha de ferrovia), `vaosSemTipo` (vermelho do vão novo sem tipo), `areaNaoConferida` (vermelho da área que o site não conseguiu cruzar) e `areaConsertada` (amarelo da área cujo desenho o site consertou).
- **Mensagens provisórias fora de `textos.ts`**: em `src/tela/estado.ts`, `ERRO_CALCULO` (a conta do caso deu erro), `ERRO_BASE_ANTIGA` (KMZ guardado por uma versão antiga do site) e `ERRO_AVISO_VERMELHO` (o baixar trava com aviso vermelho no caso); em `src/nucleo/app.ts`, `ERRO_APP_SEM_DESENHO` (APP de água com desenho quebrado); em `src/nucleo/conferir.ts`, os itens novos da conferência: "Faltam as camadas separadas" (`SEPARADOS`), "Camada vazia" (`NO_LUGAR`) e o amarelo "Sem camada da rede: confirme que a obra é só de poste" (`REDE`, quando o zip não tem camada com REDE no nome; não trava, porque há kit aprovado só de poste).
- **Conserto dos polígonos do KMZ** (`src/nucleo/areas.ts`, `TOL_CONSERTO`): polígono inválido é refeito com buffer zero só se a área muda até 5%; acima disso a área fica marcada com defeito e o caso dá o vermelho "não pôde ser conferida". Quando o conserto muda a área mais que 0,5% (`TOL_AVISO_CONSERTO`), o caso dá o amarelo "desenho da área consertado, confira no Google Earth" se a rede nova cruza o pedaço consertado ou passa a até 100 m dele (`AREA_CONSERTADA`, em `src/nucleo/caso.ts`; nas outras partes da mesma área não há aviso). No KMZ de hoje só um açude passa de 0,5% (2,2%).
- **"Por que importa" de cada aviso** (`PORQUE_AVISO`, no mesmo arquivo): todos os textos são provisórios.
- **Larguras de APP** (`src/regras/faixas.ts`, `LARGURA_APP`): açude 100 m, lagoa 100 m e rio 30 m. São as propostas do Código Florestal (Lei 12.651, art. 4º), a confirmar com o P&M. A largura final é escolhida na tela, em cada caso.
- **Larguras de faixa de domínio** (`LARGURA_FAIXA`): DNIT 30 m, SOP 35 m e ferrovia 22,5 m, de cada lado do eixo. Vale sempre a maior largura conhecida; o órgão confirma o valor do trecho.
- **Município que licencia o perímetro do DNOCS** (`src/regras/orgaos.ts`, campo `aConfirmar`): hoje vem das Planilhas Padrão dos kits aprovados.
- **Lista de municípios do litoral** (`src/regras/litoral.ts`): 22 municípios, a conferir.

## Créditos

Dados de estradas © colaboradores do OpenStreetMap (licença ODbL). Nomes de municípios: IBGE. A base vem em `public/base/`, copiada do mapa de situação.
