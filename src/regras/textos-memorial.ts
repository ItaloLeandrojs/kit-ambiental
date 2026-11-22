// Textos fixos do memorial e dos avisos dos dados da obra.
// Os que o desenho fixa são copiados letra por letra; os outros levam "provisório".
// Os modelos de finalidade seguem o estilo dos memoriais aprovados
// ("Alimentar unidade consumidora trifásica em Tensão Primária de 13.8kV para atendimento de cliente do Grupo A, situado no ...").
// O trecho {local} (e os outros entre chaves) é trocado por quem monta o texto.
export const TEXTOS_MEMORIAL = {
  // finalidade por tipo de atendimento
  // provisório: texto a confirmar com o Italo
  finalidadeLigacaoBMono: 'Alimentar unidade consumidora monofásica em tensão secundária de 220 V para atendimento de cliente do Grupo B, situado no {local}.',
  // provisório: texto a confirmar com o Italo
  finalidadeLigacaoBTri: 'Alimentar unidade consumidora trifásica em tensão secundária de 380 V para atendimento de cliente do Grupo B, situado no {local}.',
  // provisório: texto a confirmar com o Italo
  finalidadeLigacaoA: 'Alimentar unidade consumidora trifásica em Tensão Primária de 13.8kV para atendimento de cliente do Grupo A, situado no {local}.',
  // provisório: texto a confirmar com o Italo
  finalidadeExtensao: 'Extensão de rede de distribuição de energia elétrica para atendimento de unidades consumidoras, no {local}.',
  // provisório: texto a confirmar com o Italo
  finalidadeMelhoria: 'Melhoria da rede de distribuição de energia elétrica, no {local}.',
  // provisório: texto a confirmar com o Italo
  finalidadeOutro: 'Obra de distribuição de energia elétrica, no {local}.',
  // provisório: texto a confirmar com o Italo
  finalidadeFasesVazias: 'Alimentar unidade consumidora [PREENCHER: monofásico ou trifásico] para atendimento de cliente do Grupo B, situado no {local}.',
  // provisório: texto a confirmar com o Italo
  localVazio: '[PREENCHER: endereço da obra e município]',

  // avisos dos dados da obra
  postesNaoBatem: 'Os postes por tipo somam {soma}, mas a rede nova tem {novos} postes novos.',
  // provisório: texto a confirmar com o Italo
  postesNaoBatemComo: 'Ajuste a quantidade de cada tipo de poste até a soma ficar igual ao número de postes novos da rede.',
  // provisório: texto a confirmar com o Italo
  fasesVazias: 'Falta dizer se a ligação é monofásica ou trifásica.',
  // provisório: texto a confirmar com o Italo
  fasesVaziasComo: 'Escolha monofásico ou trifásico nos dados da finalidade.',
  // provisório: texto a confirmar com o Italo
  cepVazio: 'CEP do interessado em branco.',
  // provisório: texto a confirmar com o Italo
  cepVazioComo: 'Digite o CEP. Em zona rural, use o CEP da sede do município.',
  // provisório: texto a confirmar com o Italo
  municipioEditado: 'O município digitado ({digitado}) é diferente do município que veio do KMZ ({kmz}).',
  // provisório: texto a confirmar com o Italo
  municipioEditadoComo: 'Confirme o município. O KMZ e os órgãos consultados foram calculados com o município do KMZ.',

  // ---------- memorial descritivo (Tarefa 6) ----------
  // cabeçalho e título (desenho §6.4)
  cabecalhoEnel: 'Enel Distribuição Ceará · Memorial Descritivo',
  titulo: 'PROJETO DE REDE DE DISTRIBUIÇÃO AÉREA PARA ATENDIMENTO A {interessado} EM {municipio}-CE',

  // títulos das seções, na ordem do desenho §6.4
  secaoInteressado: 'DADOS DO INTERESSADO',
  secaoObra: 'DADOS DA OBRA',
  secaoResponsavel: 'RESPONSÁVEL PELO PROJETO',
  secaoLocalizacao: 'LOCALIZAÇÃO',
  secaoFinalidade: 'FINALIDADE DA OBRA',
  secaoCaracteristicas: 'CARACTERÍSTICAS DA OBRA',
  subImplantar: 'A IMPLANTAR',
  secaoRetirar: 'A RETIRAR',
  secaoExtensao: 'EXTENSÃO TOTAL',
  secaoMateriais: 'RELAÇÃO DETALHADA DE MATERIAIS',
  secaoMetodo: 'MÉTODO CONSTRUTIVO',
  secaoVidaUtil: 'VIDA ÚTIL',
  secaoCronograma: 'CRONOGRAMA FÍSICO-FINANCEIRO',

  // localização
  // provisório: texto a confirmar com o Italo
  localObra: 'A obra está localizada em {endereco}, no município de {municipio}-CE.',
  // provisório: texto a confirmar com o Italo
  ucCoord: 'A unidade consumidora (UC) do solicitante está localizada nas coordenadas UTM {coord}, fuso 24 Sul.',
  // provisório: texto a confirmar com o Italo
  ucSemCoord: 'A unidade consumidora (UC) do solicitante está localizada nas coordenadas UTM [PREENCHER: coordenada da UC], fuso 24 Sul.',
  // provisório: texto a confirmar com o Italo
  ucFora: 'A UC não está inserida em nenhuma área protegida.',
  // provisório: texto a confirmar com o Italo
  ucDentro: 'A UC está inserida em {areas}.',
  // provisório: texto a confirmar com o Italo
  redeFora: 'A rede a ser construída não está inserida em nenhuma área protegida.',
  // provisório: texto a confirmar com o Italo
  redeInteira: 'A rede a ser construída está inteiramente inserida em {area}.',
  // provisório: texto a confirmar com o Italo
  redeParte: 'Parte da rede a ser construída está inserida em {area}.',
  // provisório: texto a confirmar com o Italo
  soPosteEm: 'O poste novo da obra está inserido em {area}.',
  // provisório: texto a confirmar com o Italo
  proxima: 'A obra não intervém em outra área protegida: {area} fica a cerca de {distancia} metros da rede nova, sem ser cruzada.',
  // provisório: texto a confirmar com o Italo
  figurasLocal: 'Abaixo, seguem as imagens de localização da UC e da rede a ser construída.',
  // provisório: texto a confirmar com o Italo
  finalidadeVazia: '[PREENCHER: finalidade da obra]',

  // a implantar
  // provisório: texto a confirmar com o Italo
  construidos: 'Serão construídos {lista}.',
  // provisório: texto a confirmar com o Italo
  metrosMT: '{m} metros de rede aérea de média tensão 13,8 kV em cabo {cabo}',
  // provisório: texto a confirmar com o Italo
  metrosBT: '{m} metros de rede aérea de baixa tensão 220/380 V em cabo {cabo}',
  // provisório: texto a confirmar com o Italo
  metrosCONJ: '{m} metros de rede conjugada de média e baixa tensão, em um único traçado, com cabo {caboMT} na média tensão e cabo {caboBT} na baixa tensão',
  // provisório: texto a confirmar com o Italo
  semExtensao: 'Nesta obra não haverá extensão de rede.',
  // provisório: texto a confirmar com o Italo
  postes: 'Serão implantados {n} postes novos: {lista}.',
  // provisório: texto a confirmar com o Italo
  posteTipo: '{q} de {altura} metros e {daN} daN',
  // provisório: texto a confirmar com o Italo
  inicioFim: 'A rede tem início no poste Nº {ini} {coordIni} e fim no poste Nº {fim} {coordFim}.',
  // provisório: texto a confirmar com o Italo
  inicioFimVazio: 'A rede tem início e fim em [PREENCHER: início e fim da rede].',
  // provisório: texto a confirmar com o Italo
  vegetacao: 'Em toda a extensão da obra, {poda} e {supressao}.',
  // provisório: texto a confirmar com o Italo
  semPoda: 'não haverá poda simples',
  // provisório: texto a confirmar com o Italo
  comPoda: 'haverá poda simples de {n}',
  // provisório: texto a confirmar com o Italo
  semSupressao: 'não haverá supressão vegetal de árvore',
  // provisório: texto a confirmar com o Italo
  comSupressao: 'haverá supressão de {n}',
  // provisório: texto a confirmar com o Italo
  arvorePoda: 'Será feita poda simples em um indivíduo de {especie}, localizado nas coordenadas {coord}.',
  // provisório: texto a confirmar com o Italo
  arvoreSupressao: 'Será feita supressão de um indivíduo de {especie}, localizado nas coordenadas {coord}.',
  // provisório: texto a confirmar com o Italo (decreto citado no aviso da Parte 1)
  carnauba: 'A carnaúba é espécie protegida no Ceará (Decreto estadual 27.413/2004); a intervenção só será feita com a autorização do órgão ambiental.',
  // provisório: texto a confirmar com o Italo (guia PARA PROCESSO AMBIENTAL)
  semLimpeza: 'Para a passagem da rede, não será necessária limpeza de faixa de servidão.',
  // provisório: texto a confirmar com o Italo (guia PARA PROCESSO AMBIENTAL)
  comLimpeza: 'Será necessária limpeza de faixa de servidão, predominantemente {predominancia}, com área de {m2} m² ({ha} ha).',
  // provisório: texto a confirmar com o Italo
  semApp: 'Também não haverá intervenção em APP.',
  // provisório: texto a confirmar com o Italo
  comApp: 'Também haverá intervenção em APP, descrita abaixo.',
  // provisório: texto a confirmar com o Italo
  semVias: 'A obra aproveita os acessos existentes e não haverá abertura de vias e caminhos para a passagem da rede.',
  // provisório: texto a confirmar com o Italo (memorial da empresa e guia PARA PROCESSO AMBIENTAL)
  faixaServidao: 'A faixa de servidão adotada é de 3 metros para cada lado do eixo na rede de média tensão e de 1,5 metro para cada lado do eixo na rede de baixa tensão.',
  // provisório: texto a confirmar com o Italo (memorial da empresa)
  alturaMinima: 'A rede deve possuir altura mínima em relação ao solo de 6 metros onde possa haver trânsito de veículos e de 5,5 metros onde houver trânsito exclusivo de pedestres.',

  // intervenções: frase do trecho e do total copiadas letra por letra do desenho §6.4
  trecho: 'A intervenção na {area} ocorrerá entre o poste Nº {x} {coordX} e o poste Nº {y} {coordY}, com cerca de {m} metros da rede de {tipo}, com área de {ha} ha.',
  // provisório: texto a confirmar com o Italo (a frase do desenho começa em "o projeto possui")
  total: 'Ao todo, o projeto possui {n} metros de extensão; destes, {m} metros ({ha} ha) estão inseridos em {area}.',
  // provisório: texto a confirmar com o Italo (poste sem rede na área, como num kit aprovado)
  posteSemRede: 'Na {area} será implantado o poste Nº {x} {coord}, sem rede nova dentro da área, com área de {m2} m² ({ha} ha).',
  // provisório: texto a confirmar com o Italo
  totalSoPoste: 'Ao todo, a intervenção em {area} é só de poste, com área de {ha} ha.',
  // provisório: texto a confirmar com o Italo
  numeroPosteVazio: '[PREENCHER: nº do poste]',

  // a retirar
  // provisório: texto a confirmar com o Italo
  semRetirada: 'Não haverá retirada de rede nem de postes.',
  // provisório: texto a confirmar com o Italo
  retirados: 'Serão retirados {lista}.',
  // provisório: texto a confirmar com o Italo
  retiradaVazia: '[PREENCHER: rede e postes a retirar, ou marque "não haverá retirada"]',

  // extensão total e materiais
  // provisório: texto a confirmar com o Italo
  extensaoNota: 'Extensão da rede aérea a implantar, em metros.',
  // provisório: texto a confirmar com o Italo
  materiaisNota: 'Colar do orçamento do GOM/GOMNET.',
  colarGom: '[COLAR DO GOM]',

  // Fortaleza (SEUMA)
  // provisório: texto a confirmar com o Italo
  metodo: 'A rede será construída com postes de concreto implantados por escavação, com o lançamento dos condutores após o assentamento e o aterro compactado de cada poste, sem uso de explosivos e com o recolhimento dos resíduos ao fim da obra.',
  // provisório: texto a confirmar com o Italo
  vidaUtil: 'A vida útil estimada da rede de distribuição é de [PREENCHER: vida útil em anos] anos, com manutenção feita pela Enel Distribuição Ceará.',
  // provisório: texto a confirmar com o Italo
  cronogramaVazio: '[PREENCHER: cronograma físico-financeiro]',

  // fecho e assinatura
  // provisório: texto a confirmar com o Italo
  localData: '{municipio}-CE, {mesAno}.',
  // provisório: texto a confirmar com o Italo
  // as duas notas levam a marca [PREENCHER], que a conferência do passo 7 acha no PDF (o fundo amarelo some no PDF)
  naoAssinado: '[PREENCHER: assinatura do responsável técnico] Documento não assinado: corrija os vermelhos do caso e dos dados da obra para o site pôr a assinatura.',
  // provisório: texto a confirmar com o Italo
  semAssinatura: '[PREENCHER: assinatura do responsável técnico] Guarde a imagem da assinatura no passo 5b para o site pôr a assinatura.',
} as const;

// legendas das figuras do memorial (cores dos memoriais aprovados, desenho §6.5)
export const TEXTOS_FIGURAS = {
  tituloUc: 'Localização da UC',
  tituloRede: 'Rede projetada',
  // provisório: texto a confirmar com o Italo
  tituloArvores: 'Árvores com intervenção',
  // provisório: texto a confirmar com o Italo
  legendaUc: 'Localização da UC; ponto vermelho: UC',
  // provisório: texto a confirmar com o Italo
  legendaRede: 'Rede projetada',
  // a legenda da intervenção segue o exemplo do desenho §6.4
  interferencia: 'Interferência na {area}',
  entrePostes: 'entre os postes Nº {x} e Nº {y}',
  // provisório: texto a confirmar com o Italo
  noPoste: 'no poste Nº {x}',
  // provisório: texto a confirmar com o Italo
  legendaArvores: 'Árvores com intervenção',
  linha: { MT: 'linha vermelha: rede de média tensão', BT: 'linha verde: rede de baixa tensão', CONJ: 'linha azul: rede conjugada de média e baixa tensão' },
  poligonoApp: 'polígono amarelo: APP',
  // provisório: texto a confirmar com o Italo
  poligonoArea: 'polígono amarelo: área protegida',
  // provisório: texto a confirmar com o Italo
  pontoPoste: 'ponto: poste novo',
  // provisório: texto a confirmar com o Italo
  pontoPoda: 'marcador: poda simples',
  // provisório: texto a confirmar com o Italo
  pontoSupressao: 'marcador: supressão',
  // provisório: texto a confirmar com o Italo
  poligonoLimpeza: 'polígono: limpeza de faixa',
} as const;

// texto curto da Planilha Padrão (célula do resumo da intervenção)
export const TEXTOS_CURTO = {
  // provisório: texto a confirmar com o Italo
  ucForaDeTudo: 'A UC, localizada nas coordenadas {coord}, não está inserida em nenhuma área protegida.',
  // provisório: texto a confirmar com o Italo
  ucDentro: 'A UC, localizada nas coordenadas {coord}, está inserida em {areas}.',
  // provisório: texto a confirmar com o Italo
  redeSemArea: 'A rede a ser construída não está inserida em nenhuma área protegida.',
  // provisório: texto a confirmar com o Italo
  redeEm: '{quanto} da rede a ser construída ({extensao}) está inserida em {area} ({ha} ha).',
  // provisório: texto a confirmar com o Italo
  redeSoPoste: '{quanto} da rede a ser construída (só poste, sem extensão) está inserida em {area} ({ha} ha).',
} as const;

// erros ao encaixar as imagens soltas nas figuras ({n} = número da figura)
export const TEXTOS_IMAGENS = {
  formatoInvalido: 'use JPG ou PNG: salve a imagem de novo no Google Earth',
  figuraInexistente: 'não há Figura {n} neste memorial',
  // provisório: texto a confirmar com o Italo
  numeroRepetido: 'já há uma imagem para a Figura {n}',
  // provisório: texto a confirmar com o Italo
  semFiguraLivre: 'não sobrou figura para esta imagem',
} as const;

// conferência do kit completo (zip final, desenho §6.8 e §8.1)
export const TEXTOS_KIT = {
  // desenho §5 (assinatura): PDF sem texto (escaneado) dá este amarelo
  pdfSemTexto: 'não deu para ler este PDF; solte o .docx final para conferir o texto',
  // provisório: texto a confirmar com o Italo
  porqueSemTexto: 'O PDF do memorial não tem texto legível (parece escaneado ou é imagem), então os números e as frases dele não foram conferidos.',
  // provisório: texto a confirmar com o Italo
  comoSemTexto: 'Solte no kit o .docx final do memorial (o mesmo do PDF), ou gere o PDF de novo pelo Word, com "Salvar como PDF".',
  // provisório: texto a confirmar com o Italo
  usouDocx: 'O texto conferido é o do .docx do memorial',
  // provisório: texto a confirmar com o Italo
  porqueUsouDocx: 'O PDF do memorial não tem texto legível, então a conferência leu o .docx que está no kit. O órgão lê o PDF.',
  // provisório: texto a confirmar com o Italo
  comoUsouDocx: 'Confira que o PDF é o mesmo texto do .docx; se puder, gere o PDF de novo pelo Word, com "Salvar como PDF".',
  // provisório: texto a confirmar com o Italo
  pdfNaoAbre: 'O PDF do memorial não abre',
  // provisório: texto a confirmar com o Italo
  porquePdfNaoAbre: 'O leitor de PDF do site não conseguiu abrir o PDF do memorial (o arquivo pode estar corrompido ou incompleto), então o texto dele não foi conferido pelo PDF. Se o site não abre, o órgão pode não abrir também.',
  // provisório: texto a confirmar com o Italo
  comoPdfNaoAbre: 'Abra o PDF no computador para ver se está inteiro e gere de novo pelo Word, com "Salvar como PDF". Para conferir o texto agora, solte também o .docx final.',
  // provisório: texto a confirmar com o Italo
  docxNaoAbre: 'O .docx do memorial não abre',
  // provisório: texto a confirmar com o Italo
  porqueDocxNaoAbre: 'O .docx do memorial que está no kit não pôde ser lido, então o texto dele não foi conferido. Ele vai junto no kit, e o órgão também pode não abri-lo.',
  // provisório: texto a confirmar com o Italo
  comoDocxNaoAbre: 'Salve o memorial de novo pelo Word, como .docx, e solte o arquivo novo no lugar deste.',
  // provisório: texto a confirmar com o Italo
  docxVazio: 'o .docx não tem texto',
  // provisório: texto a confirmar com o Italo
  semTextoParaConferir: 'O texto do memorial não foi conferido',
  // provisório: texto a confirmar com o Italo
  porqueSemTextoParaConferir: 'O PDF do memorial não tem texto legível (parece escaneado ou é imagem) e o .docx do kit não abre, então os números e as frases do memorial não foram conferidos.',
  // provisório: texto a confirmar com o Italo
  comoSemTextoParaConferir: 'Gere o PDF de novo pelo Word, com "Salvar como PDF", ou troque o .docx por um que abra.',
  // provisório: texto a confirmar com o Italo
  planilhaNaoAbre: 'A Planilha Padrão do kit não abre',
  // provisório: texto a confirmar com o Italo
  porquePlanilha: 'Sem ler a Planilha Padrão do kit, o site não confere os metros, a poda, a APP e o assunto dela, e o órgão devolve a planilha que não é a dele.',
  // provisório: texto a confirmar com o Italo
  comoPlanilha: 'Solte no kit a Planilha Padrão (.xlsm) preenchida pelo site no passo 6.',
  // provisório: texto a confirmar com o Italo
  falta: 'Falta: {nome}',
  // provisório: texto a confirmar com o Italo
  tudo: 'Documentos obrigatórios todos no kit',
  // provisório: texto a confirmar com o Italo
  porqueTudo: 'Memorial, ART, CVT, projeto (CAD), planta e Planilha Padrão, cada um nos formatos pedidos, estão no kit.',
} as const;

// o que o zip final precisa ter, por papel (desenho §8.1); os porquês seguem os da conferência da Parte 1
// provisório: texto a confirmar com o Italo (os "como" e os nomes novos)
export const OBRIGATORIOS_KIT = {
  'memorial-pdf': { nome: 'Memorial descritivo em PDF', porque: 'O memorial descreve a intervenção que o órgão avalia; sem ele o processo não anda.', como: 'Solte o PDF do memorial, salvo do Word.' },
  art: { nome: 'ART', porque: 'O órgão exige a ART do responsável técnico.', como: 'Solte o PDF da ART.' },
  cvt: { nome: 'CVT', porque: 'O órgão exige a CVT junto do pedido.', como: 'Solte o PDF da CVT.' },
  'cad-dwg': { nome: 'Projeto (CAD) em DWG', porque: 'O órgão pede o projeto nos dois formatos, DWG e PDF.', como: 'Solte o projeto em DWG.' },
  'cad-pdf': { nome: 'Projeto (CAD) em PDF', porque: 'O órgão pede o projeto nos dois formatos, DWG e PDF.', como: 'Solte o projeto em PDF.' },
  'planta-dwg': { nome: 'Planta georreferenciada em DWG', porque: 'O órgão pede a planta nos dois formatos, DWG e PDF.', como: 'Solte a planta em DWG.' },
  'planta-pdf': { nome: 'Planta georreferenciada em PDF', porque: 'O órgão pede a planta nos dois formatos, DWG e PDF.', como: 'Solte a planta em PDF.' },
  // provisório: texto a confirmar com o Italo
  'planilha-xlsm': { nome: 'Planilha Padrão (.xlsm)', porque: 'O órgão pede a Planilha Padrão de Entrega preenchida, no Excel e em PDF.', como: 'Solte a Planilha Padrão (.xlsm) preenchida pelo site.' },
  // provisório: texto a confirmar com o Italo
  'planilha-pdf': { nome: 'Planilha Padrão em PDF', porque: 'O órgão pede a Planilha Padrão de Entrega preenchida, no Excel e em PDF.', como: 'Salve a Planilha Padrão em PDF pelo Excel e solte o PDF.' },
  // provisório: texto a confirmar com o Italo
  poda: { nome: 'Autorização de poda', porque: 'A obra tem poda, e alguns municípios pedem a autorização da prefeitura. Sem a lista desses municípios, a falta fica em amarelo.', como: 'Se o município exige, solte o PDF da autorização de poda; se não exige, nada a corrigir.' },
  // provisório: texto a confirmar com o Italo
  regularidade: { nome: 'Documento de regularidade do cliente', porque: 'A UC está dentro de área protegida, e a planilha pergunta se o cliente apresentou o documento que prova a regularidade (CCU, título, escritura ou contrato de concessão).', como: 'Solte o documento de regularidade do cliente, se ele apresentou.' },
} as const;

// caso salvo em arquivo local (desenho §6)
export const TEXTOS_CASO_SALVO = {
  naoEhCaso: 'Este arquivo não é um caso salvo do Kit Ambiental.',
  versaoNova: 'Este caso foi salvo por uma versão mais nova do site.',
  // brief da Tarefa 17: hash do projeto diferente do salvo
  outroProjeto: 'este caso foi salvo com outro arquivo de projeto; confira a rede',
  // provisório: texto a confirmar com o Italo
  outroProjetoComo: 'O projeto aberto não é o mesmo arquivo de quando o caso foi salvo. Confira no mapa as marcas da rede, as APPs e as árvores antes de baixar.',
  // provisório: texto a confirmar com o Italo
  semProjeto: 'Abra o KMZ e o projeto da obra (passos 1 e 2) antes de abrir o caso salvo.',
  // provisório: texto a confirmar com o Italo
  naoBate: 'Este caso salvo não bate com o projeto aberto: ele inclui camadas que este desenho não tem. Abra o projeto com que o caso foi salvo.',
};

// estado dos passos da Parte 2 (Tarefa 17)
export const TEXTOS_ESTADO_KIT = {
  // provisório: texto a confirmar com o Italo
  semPlanilha: 'Carregue a Planilha Padrão de Entrega da Enel antes de baixar a planilha.',
  // provisório: texto a confirmar com o Italo
  papelFaltando: 'Diga o que é cada arquivo antes de montar o kit',
  // provisório: texto a confirmar com o Italo
  porquePapelFaltando: 'O site não reconheceu {lista} pelo nome, e não chuta o que um arquivo é: sem o papel, ele entraria no kit com o nome errado.',
  // provisório: texto a confirmar com o Italo
  comoPapelFaltando: 'Escolha na lista o que é cada um desses arquivos (ART, CVT, CAD, planta...) e monte o kit de novo.',
  // provisório: texto a confirmar com o Italo
  semRegional: 'Escolha a regional da pasta antes de montar o kit',
  // provisório: texto a confirmar com o Italo
  porqueSemRegional: 'O nome da pasta do kit termina com a regional (FORTALEZA, NORTE, SUL...).',
  // provisório: texto a confirmar com o Italo
  comoSemRegional: 'Escolha a regional nos dados da obra (passo 5b).',
  // provisório: texto a confirmar com o Italo
  vermelhoAntesDoKit: 'Resolva os avisos vermelhos do caso e dos dados da obra (passo 5b) antes de montar o kit',
  // provisório: texto a confirmar com o Italo
  naoMontou: 'O kit não foi montado',
  // provisório: texto a confirmar com o Italo
  comoNaoMontou: 'Corrija o que a mensagem diz e monte o kit de novo.',
  // provisório: texto a confirmar com o Italo
  conferenciaFalhou: 'Não consegui conferir este zip: a conferência deu erro.',
  // provisório: texto a confirmar com o Italo
  porqueConferenciaFalhou: 'A conta da conferência parou no meio, então nada deste zip foi conferido.',
  // provisório: texto a confirmar com o Italo
  comoConferenciaFalhou: 'Tente de novo. Se o erro continuar, avise o responsável pelo site e mande o zip.',
} as const;

// tela dos passos 5a a 8 (Tarefa 19), tirados do rascunho aprovado (rascunhos/parte2-passos.html)
// provisório: texto a confirmar com o Italo (todos deste bloco)
export const TEXTOS_PAINEL_KIT = {
  ucNaoAchada: 'O desenho não tem bloco de UC perto da rede nova (ou o projeto é um KML, que não traz blocos).',
  porqueUcNaoAchada: 'Sem a UC, o memorial sai com a coordenada em amarelo para preencher e o assunto da planilha pode sair errado.',
  comoUcNaoAchada: 'Clique em "Marcar no mapa" e depois no ponto onde fica o padrão do cliente.',
  porqueCasoOutroProjeto: 'Se o desenho mudou depois que o caso foi salvo, as marcas da rede podem não bater mais, e os metros do kit saem errados.',
  naoAssinado: 'Há {n}: {lista}',
  porqueNaoAssinado: 'O site só põe a assinatura do responsável técnico quando nada está vermelho, e o kit não monta enquanto houver vermelho. A planilha sai sem a assinatura, e o memorial com a nota em amarelo "{nota}"',
  comoNaoAssinado: 'Corrija os vermelhos (o caso no passo 5, os dados da obra no passo 5b) e baixe o memorial e a planilha de novo.',
  semAssinatura: 'A assinatura do responsável técnico não está guardada neste computador.',
  porqueSemAssinatura: 'Sem a imagem, o memorial e a planilha saem sem a assinatura; o memorial leva a nota em amarelo "{nota}", que a conferência do passo 7 acusa.',
  comoSemAssinatura: 'Guarde a imagem PNG da assinatura em "Guardado neste computador", no passo 5b.',
  assinados: 'Nenhum vermelho: o memorial e a planilha saem assinados por {rt}.',
  figuraSemImagem: 'sem imagem: o memorial baixa mesmo assim, com a marca amarela "[PREENCHER: solte a imagem da Figura {n} no site]" no lugar',
  travaFiguras: 'Só baixa depois de marcar "Conferi". Olhe a lista: principalmente as imagens achadas "pela ordem".',
  semPapel: 'O site não reconheceu pelo nome e não chuta. Diga o que é para montar o kit.',
  semCaso8: 'Sem caso aberto, o site confere só o que o texto e o zip mostram: hectares de cada trecho, soma dos trechos, metros do KML e do SHP, contradições e marcas esquecidas.',
  assinaturaNaoPng: 'A assinatura precisa ser uma imagem PNG.',
  logoInvalido: 'O logotipo precisa ser uma imagem PNG ou JPG.',
} as const;