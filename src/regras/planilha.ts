// Liga cada dado da obra à coluna da Planilha Padrão de Entrega pelo texto do cabeçalho (desenho §6.6), nunca pela letra:
// a letra muda entre revisões (cabeçalho na linha 3 na Rev.05 e na linha 4 da Rev.06 em diante).
// Trechos genéricos de cabeçalho lidos da Rev.05, Rev.06 e REV 09, sem acento e em maiúsculas.

export type Campo = 'sob' | 'dataSob' | 'municipio' | 'sed' | 'zona' | 'metrosBT' | 'metrosMT' | 'metrosCONJ' | 'poda' | 'podaAnexada'
  | 'supressao' | 'limpeza' | 'solicitante' | 'regularidadeApresentou' | 'regularidadeAnexou' | 'appUc' | 'appUcOrgao' | 'ucEmArea' | 'areaDaUc'
  | 'reformaAgraria' | 'manutencaoUc' | 'manutencaoApp' | 'manutencaoArea' | 'appRede' | 'areaDaRede' | 'orgaoAreaRede'
  | 'permissaoArea' | 'permissaoOrgao' | 'validador' | 'cvtFotos' | 'parceira';

export const ERRO_NAO_E_PLANILHA = 'Esta planilha não é a Planilha Padrão de Entrega da Enel.';

// Cada campo tem alternativas; uma alternativa casa quando TODOS os trechos estão no cabeçalho (sem acento, espaços
// juntados). Trecho que começa com "!" é o contrário: o cabeçalho NÃO pode ter aquele texto.
export const REGRAS_COLUNAS: { campo: Campo; trechos: string[][] }[] = [
  { campo: 'sob', trechos: [['SOB', '!DATA']] },
  { campo: 'dataSob', trechos: [['DATA SOLICITACAO SOB']] },
  { campo: 'municipio', trechos: [['MUNICIPIO']] },
  { campo: 'sed', trechos: [['SUBESTACAO (SED)']] },
  // "ZONA DE AMORTECIMENTO" e "ZONA DE ENTORNO" aparecem no cabeçalho da área protegida
  { campo: 'zona', trechos: [['ZONA', '!AMORTECIMENTO', '!AREA']] },
  { campo: 'metrosBT', trechos: [['EXTENSAO DE REDE BT']] },
  { campo: 'metrosMT', trechos: [['EXTENSAO DE REDE MT', '!CONJUGADA']] },
  { campo: 'metrosCONJ', trechos: [['EXTENSAO DE REDE', 'CONJUGADA']] },
  { campo: 'poda', trechos: [['PODA SIMPLES?', '!AUTORIZACAO']] },
  { campo: 'podaAnexada', trechos: [['AUTORIZACAO PODA SIMPLES']] },
  // na Rev.06 e na REV 09 a supressão inclui a limpeza de faixa; a Rev.05 tem a limpeza numa coluna própria
  { campo: 'supressao', trechos: [['SUPRESSAO DE VEGETACAO'], ['SUPRESSAO VEGETACAO']] },
  { campo: 'limpeza', trechos: [['LIMPEZA DE FAIXA DE SERVIDAO', '!SUPRESSAO']] },
  { campo: 'solicitante', trechos: [['NOME DO SOLICITANTE']] },
  { campo: 'regularidadeApresentou', trechos: [['SOLICITANTE APRESENTOU DOCUMENTO REGULARIDADE']] },
  { campo: 'regularidadeAnexou', trechos: [['DOCUMENTO REGULARIDADE AMBIENTAL', 'ANEXADO NA GOM', '!APRESENTOU']] },
  { campo: 'appUc', trechos: [['AREA DE PRESERVACAO PERMANENTE - APP?', '(UNIDADE CONSUMIDORA']] },
  { campo: 'appUcOrgao', trechos: [['AREA PRESERVACAO PERMANENTE (ORGAO', 'UNIDADE CONSUMIDORA']] },
  { campo: 'ucEmArea', trechos: [['UNIDADE CONSUMIDORA SOLICITANTE INSERIDA EM AREA AMBIENTAL']] },
  { campo: 'areaDaUc', trechos: [['AREA PROTEGIDA ONDE A UNIDADE CONSUMIDORA']] },
  { campo: 'reformaAgraria', trechos: [['BENEFICIARIO DA REFORMA AGRARIA']] },
  // "SERVIÇOS CARACTERÍSTICOS MANUTENÇÃO EMBAIXO DA REDE EXISTENTE" (Rev.06 em diante). A Rev.05 pergunta outra coisa
  // ("SITUAÇÃO DA LICENÇA SED/ALIM", com VIGENTE/VENCIDA): essa não casa e fica como coluna desconhecida.
  { campo: 'manutencaoUc', trechos: [['MANUTENCAO EMBAIXO DA REDE', 'USO SUSTENTAVEL', '!SITUACAO DA LICENCA']] },
  { campo: 'manutencaoApp', trechos: [['MANUTENCAO EMBAIXO DA REDE', '(APP)', '!SITUACAO DA LICENCA']] },
  { campo: 'manutencaoArea', trechos: [['MANUTENCAO EMBAIXO DA REDE', 'PROTECAO INTEGRAL', '!SITUACAO DA LICENCA']] },
  { campo: 'appRede', trechos: [['AREA DE PRESERVACAO PERMANENTE - APP?', '(REDE OU PARTE DA REDE)']] },
  { campo: 'areaDaRede', trechos: [['AREA PROTEGIDA POR LEI', 'ONDE A UC ESTA INSERIDA']] },
  { campo: 'orgaoAreaRede', trechos: [['UNIDADE DE CONSERVACAO OU AREA AMBIENTAL (ORGAO', 'REDE ENEL']] },
  { campo: 'permissaoArea', trechos: [['PATRIMONIO DA UNIAO', 'REDE ENEL PERMISSAO']] },
  // REV 09: "... (ÓRGÃO PERMISSÃO) - REDE ENEL"; Rev.05: "ÓRGÃO PERMISSÃO/AUTORIZAÇÃO ÁREA PROTEGIDA POR LEI" (mesma lista de órgãos)
  { campo: 'permissaoOrgao', trechos: [['PATRIMONIO DA UNIAO', '(ORGAO PERMISSAO)'], ['ORGAO PERMISSAO/AUTORIZACAO AREA PROTEGIDA']] },
  { campo: 'validador', trechos: [['VALIDADOR ENEL']] },
  { campo: 'cvtFotos', trechos: [['CVT E FOTOS']] },
  { campo: 'parceira', trechos: [['NOME EMPRESA PARCEIRA']] },
];

// Colunas que o site conhece e deixa como estão (as datas com =TODAY()): não são dado da obra e não viram "desconhecida".
export const COLUNAS_INTACTAS: string[][] = [
  ['DATA ENTREGA PROCESSO DOCUMENTAL'],
  ['PROCESSO DOCUMENTAL FOI ANEXADO NA GOM'],
];

// Separador das opções juntas numa célula de lista. Lido no código da macro da REV 09 (xl/vbaProject.bin, módulo da
// aba principal, Worksheet_Change): a macro faz `Split(OldValue, ", ")` e grava `OldValue & ", " & NewValue`.
export const SEPARADOR_LISTA: string | null = ', ';

// Campos de data (gravados como número de série do Excel) e campos de texto livre (sem lista).
export const CAMPOS_DATA: Campo[] = ['dataSob'];

// Opções das listas da Planilha Padrão, escritas como a Enel escreve (com os erros de digitação dela, porque o site
// só aceita a opção igual, sem acento e sem espaço repetido). Conferidas na REV 09 e na Rev.06.
export const OPCAO = {
  sim: 'SIM',
  nao: 'NÃO',
  naoSeAplica: 'NÃO SE APLICA',
  appRio: 'SIM (RIO/RIACHO)',
  appLagoa: 'SIM (LAGOS/LAGOAS NATURAIS)',
  appReservatorio: 'SIM (RESERVATÓRIOS ARTIFICIAIS DECORRENTES DE BARRAMENTO E/OU REPRESAMENTO DE CURSOS DE ÁGUAS NATURAIS)',
  limpezaArbustiva: 'SIM - LIMPEZA DE FAIXA DE SERVIDÃO ARBUSTIVA',
  limpezaArborea: 'SIM - LIMPEZA DE FAIXA DE SERVIDÃO ARBÓREA',
  limpezaMistaArbustiva: 'SIM - LIMPEZA DE FAIXA DE SERVIDÃO ARBUSTIVA E ARBÓREA (PREDOMINÂNCIA ARBUSTIVA)',
  limpezaMistaArborea: 'SIM - LIMPEZA DE FAIXA DE SERVIDÃO ARBUSTIVA E ARBÓREA (PREDOMINÂNCIA ARBÓREA)',
  // Rev.05: a limpeza de faixa tem coluna própria
  limpezaRev05Arbustiva: 'SIM - ARBUSTIVA',
  limpezaRev05Arborea: 'SIM - ARBÓREA',
  limpezaRev05Mista: 'SIM - ARBUSTIVA/ARBÓREA',
  reformaNao: 'NÃO - NECESSÁRIO ELABORAR PROCESSO DOCUMENTAL',
  terraIndigena: 'ÁREAS TERRAS INDÍGENAS_FEDERAL',
  quilombola: 'ÁREAS TERRITÓRIOS QUILOMBOLAS_FEDERAL',
  assentamento: 'ÁREAS PROJETOS ASSENTAMENTOS RURAIS_FEDERAL_PERMISSÃO',
  rppn: 'RPPN - RESERVA DO PATRIMÔNIO PARTICULAR NATURAL_PARTICULAR_USO SUSTENTÁVEL',
  permissaoPerimetro: 'ÁREAS PERÍMETROS IRRIGADOS_FEDERAL_PERMISSÃO',
  permissaoAssentamento: 'ÁREAS PROJETOS ASSENTAMENTOS RURAIS_FEDERAL_PERMISSÃO',
  permissaoPatrimonio: 'ÁREAS PATRIMÔNIOS HISTÓRICOS E ARTÍSTICOS (SÍTIOS ARQUEOLÓGICOS)_FEDERAL_PERMISSÃO',
  orgaoDnocs: 'DNOCS (FEDERAL) - DEPARTAMENTO NACIONAL DE OBRAS CONTRA AS SECAS',
  orgaoIncra: 'INCRA (FEDERAL) - INSTITUTO NACIONAL DE COLONIZAÇÃO E REFORMA AGRÁRIA',
  orgaoIphan: 'IPHAN (FEDERAL) - INSTITUTO DO PATRIMÔNIO HISTÓRICO E ARTÍSTICO NACIOANAL',
  gestorRppn: 'UNIDADE DE CONSERVAÇÃO PRIVADA (PROPRIETÁRIO DA RPPN) - USO SUSTENTÁVEL',
  gestorTerraIndigena: 'TERRAS ÍNDIGENAS - FUNAI (FEDERAL) - FUNDAÇÃO NACIONAL DO ÍNDIO',
  gestorQuilombola: 'TERRTÓRIOS QUILOMBOLAS - INCRA (FEDERAL) - INSTITUTO NACIONAL DE COLONIZAÇÃO E REFORMA AGRÁRIA',
} as const;

// Gestor da UC por esfera, como a lista "ÓRGÃO RESPONSÁVEL/GESTOR" escreve: "UNIDADE DE CONSERVAÇÃO ESTADUAL (SEMA) - USO SUSTENTÁVEL"
export const GESTOR_UC: Record<string, string> = { federal: 'FEDERAL (ICMBio)', estadual: 'ESTADUAL (SEMA)', municipal: 'MUNICIPAL (MUNICÍPIO)' };

// Outras formas da mesma resposta, tentadas na ordem quando a lista não tem a primeira. O "não" das colunas de APP, de
// supressão e das áreas é "NÃO SE APLICA" na REV 09 (a aba "Inf. Colunas I até K e O até X" da REV 09 mostra isso);
// a Rev.06 e a Rev.05 ainda têm "NÃO". A Rev.05 escreve o reservatório de outro jeito.
export const EQUIVALENTES: { campos: Campo[]; alvo: string; outras: string[] }[] = [
  { campos: ['appUc', 'appRede', 'supressao'], alvo: OPCAO.nao, outras: [OPCAO.naoSeAplica] },
  { campos: ['appUc', 'appRede'], alvo: OPCAO.appReservatorio, outras: ['SIM (RESERVATÓRIOS D´ÁGUAS ARTIFICIAIS)'] },
  { campos: ['reformaAgraria'], alvo: OPCAO.reformaNao, outras: [OPCAO.nao] },
];

// Prefixos do tipo de área, a forma longa e a sigla: o nome do KMZ casa com o da lista sem eles (e pela esfera).
// Áreas de tipos diferentes nunca casam entre si.
export const PREFIXOS_AREA: { tipo: string; formas: string[] }[] = [
  { tipo: 'APA', formas: ['AREA DE PROTECAO AMBIENTAL', 'APA'] },
  { tipo: 'ARIE', formas: ['AREA DE RELEVANTE INTERESSE ECOLOGICO', 'AREA DE RELEVANTE INTERESSE', 'ARIE'] },
  { tipo: 'MONA', formas: ['MONUMENTO NATURAL MUNICIPAL', 'MONUMENTO NATURAL', 'MONUMENTO', 'MONA'] },
  { tipo: 'PARQUE', formas: ['PARQUE NATURAL MUNICIPAL', 'PARQUE NATURAL', 'PARQUE ESTADUAL', 'PARQUE NACIONAL', 'PARNA', 'PE'] },
  { tipo: 'ESEC', formas: ['ESTACAO ECOLOGICA', 'ESEC'] },
  { tipo: 'REVIS', formas: ['REFUGIO DE VIDA SILVESTRE', 'REFUGIO DA VIDA SILVESTRE', 'REFUGIO DA VIDA SELVAGEM', 'REVIS'] },
  { tipo: 'FLONA', formas: ['FLORESTA NACIONAL', 'FLONA'] },
  { tipo: 'RESEX', formas: ['RESERVA EXTRATIVISTA', 'RESEX'] },
];

// Avisos da planilha. Os dois primeiros são fixados pelo desenho (§6.6) e pelo plano.
export const TEXTOS_PLANILHA = {
  escolhaNaLista: 'escolha na lista ao abrir no Excel',
  semAssunto: 'sem área cruzada: confirme com o P&M o assunto do e-mail',
  assuntoSemModelo: 'área sem modelo de assunto na aba "Modelos Assunto E-mail": confirme com o P&M o assunto do e-mail',
  assuntoSemUc: 'UC não marcada no passo 5a: o assunto da A1 ficou como estava, porque sem a UC o site não sabe se ele leva a parte da UC; o texto curto saiu sem a frase da UC.',
  comoAssuntoSemUc: 'Marque a UC no passo 5a e baixe a planilha de novo.',
  colunaEscolher: 'Coluna {letra} ({cabecalho}): {escolha}.',
  colunaVariasSemSeparador: 'Coluna {letra} ({cabecalho}): a obra pede mais de uma opção ({opcoes}) e esta planilha não junta opções numa célula; {escolha}.',
  colunaSemValor: 'Coluna {letra} ({cabecalho}): o site não tem este dado; preencha no Excel.',
  colunasDesconhecidas: 'Colunas que o site não conhece nesta revisão da planilha, deixadas como estavam: {lista}.',
  comoEscolher: 'Abra a planilha no Excel e escolha a opção certa na lista da célula.',
  comoPreencher: 'Abra a planilha no Excel e preencha a célula.',
  comoAssunto: 'Pergunte ao P&M qual modelo da aba "Modelos Assunto E-mail" vale para esta obra e escreva na célula A1.',
  comoDesconhecidas: 'Preencha essas colunas no Excel e avise o Italo para o site aprender a revisão nova.',
  semLugarAssinatura: 'A planilha não tem a célula "Assinatura Responsável Técnico": a assinatura não foi posta.',
  comoAssinatura: 'Ponha a assinatura do responsável técnico na planilha pelo Excel.',
  jaAssinada: 'A planilha guardada no site já tem uma imagem de assinatura acima de "Assinatura Responsável Técnico": ela iria em toda planilha gerada, e o site não põe a assinatura nova por cima.',
  comoJaAssinada: 'Troque a planilha guardada pela planilha em branco da Enel, sem assinatura, e gere de novo.',
} as const;
