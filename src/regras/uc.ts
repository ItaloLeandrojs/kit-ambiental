// Bloco de UC (unidade consumidora) no DXF. Os padrões valem sobre semAcento(nome do bloco).
// Os blocos "UC A IMPLANTAR", "PADRAO ... A IMPLANTAR" e "SUBESTACAO DO CLIENTE" vêm do modelo do CAD e ficam na
// biblioteca de blocos; por isso só vale o que está colocado perto da obra (RAIO_UC).
export const PADROES_UC: RegExp[] = [/^UC\b.*IMPLANTAR/, /^PADRAO\b.*IMPLANTAR/, /SUBESTACAO DO CLIENTE/, /^UC$/];
export const RAIO_UC = 300; // metros da rede nova ou de poste novo
