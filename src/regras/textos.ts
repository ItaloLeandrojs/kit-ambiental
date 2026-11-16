// textos fixos dos avisos, copiados letra por letra do desenho aprovado
export const TEXTOS = {
  semOrgao: 'órgão não identificado; consultar o P&M',
  semArea: 'sem área protegida no KMZ; confirme a APP em campo',
  proxima: 'não intervém, mas cite no memorial que não intervém em outra área protegida',
  semRedeNova: 'Nenhuma rede nova marcada. Confirme no mapa o que é rede nova.',
  appCampo: 'APP só se confirma em campo',
  litoral: 'Obra em município do litoral: confira se há duna, restinga ou beira-mar a menos de 100 m.',
  foraDaCoordenada: 'seu desenho não está na coordenada real; o kit sairia deslocado',
  shpDeslocado: 'o órgão devolve: shape não espacializado',
  // provisório: texto a confirmar com o Italo
  cruzaLinha: 'a rede nova cruza esta área, que no KMZ é só uma linha; consultar o P&M',
  // provisório: texto a confirmar com o Italo
  posteAConfirmar: 'ponto sem nome no KML tratado como poste novo; confirme no mapa',
  faixaDominio: 'precisa de processo DNIT/SOP',
} as const;

// "Por que importa" de cada aviso do caso, para o cartão da tela (texto provisório: a confirmar com o Italo)
export const PORQUE_AVISO: Record<string, string> = {
  CRUZA_LINHA: 'Sem polígono, o site não calcula metros nem hectares nessa travessia.',
  MUNICIPIO_INCERTO: 'O município define quem licencia em alguns casos.',
  POSTE_A_CONFIRMAR: 'Um poste a mais ou a menos muda a área e a conta do caso.',
  SEM_REDE_NOVA: 'Sem rede nova marcada, o site não tem o que cruzar com as áreas protegidas.',
  APP_POSSIVEL: 'Obra dentro da APP pode exigir processo. APP só se confirma em campo.',
  PROXIMA: 'Não há intervenção, mas o órgão quer saber que você olhou.',
  LITORAL: 'Duna, restinga e beira-mar têm proteção própria e podem exigir processo.',
  SEM_ORGAO: 'Sem saber o órgão, o processo pode ser protocolado no lugar errado.',
  ETIQUETA_LONGE: 'Se as coordenadas escritas não batem com o desenho, o kit pode sair deslocado e o órgão devolve.',
  FORA_UTM: 'Um desenho fora das coordenadas reais não cai no mapa: o kit sairia deslocado e o órgão devolve.',
  FORA_CEARA: 'Um desenho fora do Ceará não cruza com as áreas do KMZ: o resultado não valeria nada.',
  SEM_AREA: 'O KMZ não cobre todos os rios, lagoas e açudes: não ter área no KMZ não prova que não há APP.',
};
