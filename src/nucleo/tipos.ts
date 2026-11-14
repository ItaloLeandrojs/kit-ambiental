export type Pt = [number, number]; // UTM 24S em metros (E, N)
export type Geometria = { t: 'ponto'; p: Pt } | { t: 'linha'; pts: Pt[] } | { t: 'poligono'; aneis: Pt[][] }; // aneis[0] = externo
export interface Feicao { pasta: string[]; nome: string; atributos: Record<string, string>; geometrias: Geometria[] }
export type TipoRede = 'MT' | 'BT' | 'CONJ';
export type Situacao = 'novo' | 'existente' | 'realocado' | 'retirado';
export interface Vao { id: string; pts: Pt[]; camada: string; tipo: TipoRede | null; situacao: Situacao; motivo: string }
export interface Poste { id: string; ponto: Pt; numero: string | null; novo: boolean; coordEscrita: Pt | null; etiqueta: Pt | null }
export interface Rede { origem: 'dxf' | 'kml'; vaos: Vao[]; postes: Poste[] }
export type Nivel = 'verde' | 'amarelo' | 'vermelho';
export interface Aviso { nivel: Nivel; codigo: string; texto: string; comoCorrigir: string }
