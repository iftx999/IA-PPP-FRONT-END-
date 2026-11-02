import type { Contrato } from '../../api/tipos';
import { filtrarContratos, type FiltroContratos } from './contratos';

const contrato = (mudancas: Partial<Contrato>): Contrato => ({
  id: 'c', numero: '001/2025', unidadeId: 'u', unidadeNome: 'Concessão A', objeto: null, poderConcedente: null,
  regulador: null, dataAssinatura: null, vigenciaFim: null, documentos: 0, itensPendentes: 0, itensAprovados: 0,
  ...mudancas,
});

describe('Contratos', () => {
  const lista = [
    contrato({ id: 'vigente', vigenciaFim: '2030-01-01', objeto: 'Esgotamento sanitário' }),
    contrato({ id: 'vence', vigenciaFim: '2026-12-15', itensPendentes: 3, unidadeId: 'cidade' }),
    contrato({ id: 'vencido', vigenciaFim: '2026-10-31', poderConcedente: 'Município de São Paulo' }),
    contrato({ id: 'sem-data' }),
  ];
  const sem: FiltroContratos = { termo: '', unidades: null, vigencia: null, soPendentes: false };
  const ids = (f: Partial<FiltroContratos>) => filtrarContratos(lista, { ...sem, ...f }, '2026-11-02').map((c) => c.id);

  it('filtra pela vigência em relação a hoje', () => {
    expect(ids({ vigencia: 'VIGENTE' })).toEqual(['vigente', 'vence', 'sem-data']);
    expect(ids({ vigencia: 'VENCE_EM_90_DIAS' })).toEqual(['vence']);
    expect(ids({ vigencia: 'VENCIDO' })).toEqual(['vencido']);
    expect(ids({ vigencia: 'SEM_DATA' })).toEqual(['sem-data']);
  });

  it('filtra por texto (objeto e poder concedente), unidade e itens para revisar', () => {
    expect(ids({ termo: 'ESGOTAMENTO' })).toEqual(['vigente']);
    expect(ids({ termo: 'sao paulo' })).toEqual(['vencido']);
    expect(ids({ unidades: new Set(['cidade']) })).toEqual(['vence']);
    expect(ids({ soPendentes: true })).toEqual(['vence']);
    expect(ids({ soPendentes: true, vigencia: 'VENCIDO' })).toEqual([]);
  });
});
