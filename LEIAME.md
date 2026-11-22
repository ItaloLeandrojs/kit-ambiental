# Kit Ambiental

Site estático que roda só no navegador. Diz se uma obra de rede elétrica no Ceará precisa de processo ambiental, monta o kit completo (KML, shapefile, memorial em Word, Planilha Padrão, figuras e documentos, na pasta certa) e confere o zip antes de ir para o órgão.

Nada sai do computador: o KMZ, o projeto e as fotos são lidos no próprio navegador. A única chamada de rede é buscar os arquivos de estradas que já vêm com o site. O site está publicado em https://italoleandrojs.github.io/kit-ambiental/ e tem `noindex` (não aparece no Google).

## Como usar

O painel da esquerda tem os passos 1 a 8 (mais o 5a, o 5b e o 6a) e o mapa fica à direita. A lista abaixo é a da Parte 1 (passos 1 a 5); os passos 5a a 8 são da Parte 2, descritos logo depois.

1. **KMZ de Áreas Protegidas** (e, se for o caso, as malhas DNIT e SOP). Só na primeira vez: ficam guardados no navegador (IndexedDB).
2. **Projeto**: a OS (10 dígitos) e o DXF do projeto, ou o KML da rede. Se o desenho estiver fora do Ceará ou fora do lugar, o site para e avisa.
3. **Confirmar a rede**: o site separa MT, BT e conjugada novas pelo desenho. Só a rede nova conta. Clique no vão para trocar a marca.
4. **Árvores**: fotos com GPS viram pontos de poda ou supressão; sem GPS, clique no mapa.
5. **O caso**: áreas cruzadas, órgão, metros, hectares e avisos em amarelo ou vermelho.
6. **Baixar**: o zip do kit (pastas KML e SHAPEFILE) e o resumo em texto (na Parte 2 este passo também baixa o memorial e a planilha).
7. **Conferir um zip**: confere um kit já montado (na Parte 2 virou o passo 8; o 7 passou a ser "Montar o kit").

### Parte 2: memorial, Planilha Padrão, figuras e kit completo

Tudo roda no navegador, como na Parte 1. Os números do memorial são os do caso (metros inteiros, hectares = metros arredondados × faixa ÷ 10.000, coordenadas em SIRGAS 2000 UTM 24 Sul); nenhum é calculado de outro jeito.

- **5a. UC do cliente**: o site procura no DXF o bloco da UC, mas só aceita bloco a até 300 m da rede nova (bloco de modelo, legenda e sobra do CAD ficam de fora). Sem bloco, pede o clique no mapa. Sem a UC marcada, o memorial sai com `[PREENCHER: coordenada da UC]`, a planilha deixa o assunto da A1 como estava (com um amarelo pedindo a UC, porque o assunto muda se ela estiver numa área) e a conferência não dá verde para o assunto.
- **5b. Dados da obra**: interessado, obra (endereço, município, SED, alimentador, data da SOB, zona), finalidade (tipo de atendimento), rede (cabos e postes novos por tipo, que têm de somar os postes novos do desenho; senão é vermelho), o que a obra retira, as perguntas da planilha (validador, CVT e fotos, autorização de poda, documento de regularidade, vegetação da limpeza de faixa) e a regional da pasta (o site sugere pelo município quando a tabela em `src/regras/regionais.ts` conhece; senão o projetista escolhe). Não há campo de vias: o memorial sempre diz "não haverá abertura de vias". Empresa, responsável técnico, assinatura (imagem PNG) e a Planilha Padrão ficam guardados no navegador (IndexedDB), em "Guardado neste computador". Os dados do cliente não são guardados: só vão para o arquivo `.kitambiental` se o projetista clicar em "Salvar o caso" (e voltam com "Abrir caso salvo").
- **6. Baixar**: o espacial (KML e SHP, agora com a UC e as árvores), o memorial descritivo em Word (`.docx`, ainda sem as imagens: cada figura sai com a marca `[PREENCHER: solte a imagem da Figura N no site]`), o KMZ das figuras para o Google Earth Pro (uma pasta por figura, já enquadrada) e a Planilha Padrão preenchida (`.xlsm`, com a macro, as validações e as fórmulas como estavam). A tabela de materiais do memorial sai sempre em amarelo (`[COLAR DO GOM]`), para colar do orçamento do GOM. O site acha a linha do cabeçalho da planilha pelo "SOB" e as colunas pelo texto; arquivo que não é a Planilha Padrão dá erro, e coluna nova fica listada em amarelo. Opção que o site não sabe (ou mais de uma opção numa célula sem separador conhecido) fica vazia, em amarelo, "escolha no Excel". O separador das opções é o da macro da REV 09 (`", "`, lido em `src/regras/planilha.ts`, `SEPARADOR_LISTA`).
- **6a. Figuras**: as imagens salvas do Google Earth são soltas no site, que as encaixa nas figuras pelo nome e, sem nome conhecido, pela ordem (dá para trocar à mão). O Word com as figuras só baixa depois de marcar "Conferi: cada imagem está na figura certa"; qualquer troca de imagem desmarca. Figura sem imagem sai com a marca `[PREENCHER: solte a imagem da Figura N no site]`.
- **7. Montar o kit**: soltar a ART, a CVT, o CAD (DWG e PDF), a planta (DWG e PDF), o memorial em PDF assinado, a planilha em PDF assinada (e a autorização de poda, se houver). O site reconhece cada arquivo pelo nome e, o que não reconhece, pergunta o que é (não chuta). Ele renomeia os arquivos, monta a pasta nomeada pela OS e pela regional e roda a conferência inteira (a da Parte 1, a do texto do memorial e a da planilha, a mesma do passo 8); documento que falta sai como "Falta: ...". Qualquer vermelho trava o baixar, e o kit nem monta enquanto houver vermelho no caso ou nos dados da obra (a mesma regra que tira a assinatura).
- **8. Conferir um zip**: além das camadas e das pastas, confere o texto do memorial (PDF, lido com o `pdfjs-dist`, carregado só quando precisa) contra o caso: áreas, metros, hectares, coordenadas, campos `[PREENCHER: ...]` esquecidos. O que a conferência não consegue ler sai amarelo, nunca verde e nunca vermelho falso.

Regras que valem em toda a Parte 2:

- **Nunca chuta.** Opção de lista, órgão, área ou separador sem certeza: célula vazia e amarelo. O texto "não precisa de processo" nunca aparece no site; obra sem área cruzada sai com o assunto do e-mail em amarelo ("confirme com o P&M"), e sem a UC marcada no 5a o assunto da A1 não é escrito (amarelo).
- **Rede subterrânea:** a empresa nunca tem. O site não calcula; se achar rede subterrânea, é vermelho e trava o kit.
- **Campo que o site não preenche** leva fundo amarelo no Word e também o texto `[PREENCHER: ...]` (ou `[COLAR DO GOM]`), porque o fundo não aparece no texto do PDF e a conferência procura o texto.
- **Assinatura:** o site só põe a imagem da assinatura do responsável técnico no memorial e na planilha quando o caso e os dados da obra não têm nenhum vermelho (a mesma regra trava o "Conferir e montar o kit"). Sem assinatura, a planilha sai sem a imagem (sem nota) e o memorial leva uma nota em amarelo que começa com `[PREENCHER: assinatura do responsável técnico]`, para a conferência do passo 7 acusar no PDF: com vermelho, a nota diz "corrija os vermelhos do caso e dos dados da obra"; sem vermelho e sem a imagem guardada, diz "guarde a imagem da assinatura no passo 5b".
- **Pendente (antes de publicar a Parte 2):** o Italo confirmar com o responsável técnico que ele autoriza o uso da imagem da assinatura. Sem isso, a Parte 2 não é publicada. A imagem nunca entra no repositório.

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
- **Textos provisórios da Parte 2** (todos marcados com `// provisório: texto a confirmar com o Italo`): `src/regras/textos-memorial.ts` (frases do memorial em Word e dos avisos; alguns copiados de memoriais aprovados e do guia PARA PROCESSO AMBIENTAL, a confirmar), `TEXTOS_PAINEL_KIT` (avisos dos passos 5a a 8 na tela), também em `src/regras/textos-memorial.ts`, e `TITULO_AVISO_KIT` em `src/tela/painel-kit.ts` (títulos dos avisos), `src/regras/planilha.ts` (mensagens da Planilha Padrão), `src/regras/erros-comuns.ts` (erros comuns que a conferência explica), `src/nucleo/conferir-texto.ts` (mensagens da conferência do texto do memorial) e um aviso em `src/nucleo/caso.ts`. Para listar todos: `git grep -n "provisório" src`.
- **Tabela de regionais** (`src/regras/regionais.ts`): só tem os municípios conhecidos; os demais ficam fora e o projetista escolhe a regional na lista. O mapa de municípios por regional ainda não foi confirmado.
- **Separador de opções da Planilha Padrão** (`SEPARADOR_LISTA`, `src/regras/planilha.ts`): `", "`, lido no código da macro da REV 09. Nenhuma das planilhas aprovadas tem duas opções numa célula, então não há exemplo real para comparar; sem a macro na planilha, o site não junta opções.
- **Mensagens provisórias fora de `textos.ts`**: em `src/tela/estado.ts`, `ERRO_CALCULO` (a conta do caso deu erro), `ERRO_BASE_ANTIGA` (KMZ guardado por uma versão antiga do site) e `ERRO_AVISO_VERMELHO` (o baixar trava com aviso vermelho no caso); em `src/nucleo/app.ts`, `ERRO_APP_SEM_DESENHO` (APP de água com desenho quebrado); em `src/nucleo/conferir.ts`, os itens novos da conferência: "Faltam as camadas separadas" (`SEPARADOS`), "Camada vazia" (`NO_LUGAR`) e o amarelo "Sem camada da rede: confirme que a obra é só de poste" (`REDE`, quando o zip não tem camada com REDE no nome; não trava, porque há kit aprovado só de poste).
- **Conserto dos polígonos do KMZ** (`src/nucleo/areas.ts`, `TOL_CONSERTO`): polígono inválido é refeito com buffer zero só se a área muda até 5%; acima disso a área fica marcada com defeito e o caso dá o vermelho "não pôde ser conferida". Quando o conserto muda a área mais que 0,5% (`TOL_AVISO_CONSERTO`), o caso dá o amarelo "desenho da área consertado, confira no Google Earth" se a rede nova cruza o pedaço consertado ou passa a até 100 m dele (`AREA_CONSERTADA`, em `src/nucleo/caso.ts`; nas outras partes da mesma área não há aviso). No KMZ de hoje só um açude passa de 0,5% (2,2%).
- **"Por que importa" de cada aviso** (`PORQUE_AVISO`, no mesmo arquivo): todos os textos são provisórios.
- **Larguras de APP** (`src/regras/faixas.ts`, `LARGURA_APP`): açude 100 m, lagoa 100 m e rio 30 m. São as propostas do Código Florestal (Lei 12.651, art. 4º), a confirmar com o P&M. A largura final é escolhida na tela, em cada caso.
- **Larguras de faixa de domínio** (`LARGURA_FAIXA`): DNIT 30 m, SOP 35 m e ferrovia 22,5 m, de cada lado do eixo. Vale sempre a maior largura conhecida; o órgão confirma o valor do trecho.
- **Município que licencia o perímetro do DNOCS** (`src/regras/orgaos.ts`, campo `aConfirmar`): hoje vem das Planilhas Padrão dos kits aprovados.
- **Lista de municípios do litoral** (`src/regras/litoral.ts`): 22 municípios, a conferir.

## Créditos

Dados de estradas © colaboradores do OpenStreetMap (licença ODbL). Nomes de municípios: IBGE. A base vem em `public/base/`, copiada do mapa de situação.
