import type { components } from './esquema';

/** Tipos da API, gerados da OpenAPI (npm run api:gerar). Não editar esquema.ts à mão. */
type Esquemas = components['schemas'];

export type Eu = Esquemas['EuResponse'];
export type Painel = Esquemas['PainelResponse'];
export type Situacao = Painel['situacao'];
export type LinhaUnidade = Esquemas['LinhaDto'];
export type Meta = Esquemas['MetaDto'];
export type Projecao = Esquemas['ProjecaoDto'];
export type PontoSerie = Esquemas['PontoDto'];
export type SemLigacao = Esquemas['SemLigacaoResponse'];
export type ImovelSemLigacao = Esquemas['ItemDto'];
export type SituacaoImovel = ImovelSemLigacao['situacao'];
