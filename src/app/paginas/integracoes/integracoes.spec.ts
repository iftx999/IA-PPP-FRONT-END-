import type { FonteApi } from '../../api/tipos';
import { destino } from '../alertas/alertas';
import { atraso, filtrarFontes, situacaoFonte, ultimasCompetencias } from './integracoes';

const fonte = (mudancas: Partial<FonteApi>): FonteApi => ({
  id: 'f', nome: 'Comercial', tipo: 'AGENTE', sistemaOrigem: null, frequencia: null, atrasoMaximoHoras: 48, ativo: true,
  criadaEm: '2026-10-01T00:00:00Z', ultimaCarga: null, situacaoUltimaExecucao: null, ultimaExecucao: null,
  credenciaisAtivas: 0, atrasada: false, ...mudancas,
});

describe('Integrações e alertas', () => {
  it('filtra fontes por texto, tipo e situação', () => {
    const lista = [
      fonte({ id: '1', nome: 'Comercial', sistemaOrigem: 'SAP' }),
      fonte({ id: '2', nome: 'Planilha de medições', tipo: 'ARQUIVO', atrasada: true }),
      fonte({ id: '3', nome: 'Antiga', ativo: false, atrasada: true }),
    ];
    const ids = (r: FonteApi[]) => r.map((f) => f.id);
    const sem = { termo: '', tipo: null, situacao: null } as const;
    expect(ids(filtrarFontes(lista, { ...sem, termo: 'sap' }))).toEqual(['1']);
    expect(ids(filtrarFontes(lista, { ...sem, termo: 'MEDICOES' }))).toEqual(['2']);
    expect(ids(filtrarFontes(lista, { ...sem, tipo: 'ARQUIVO' }))).toEqual(['2']);
    expect(ids(filtrarFontes(lista, { ...sem, situacao: 'EM_DIA' }))).toEqual(['1']);
    // Inativa não conta como atrasada (não se espera carga dela).
    expect(ids(filtrarFontes(lista, { ...sem, situacao: 'ATRASADA' }))).toEqual(['2']);
    expect(ids(filtrarFontes(lista, { ...sem, situacao: 'INATIVA' }))).toEqual(['3']);
  });

  it('descreve o atraso em dias ou horas', () => {
    expect(atraso(48)).toBe('2 dias');
    expect(atraso(24)).toBe('1 dia');
    expect(atraso(36)).toBe('36 horas');
  });

  it('situação da fonte: inativa, atrasada, falha ou em dia', () => {
    expect(situacaoFonte(fonte({ ativo: false, atrasada: true })).rotulo).toBe('Inativa');
    expect(situacaoFonte(fonte({ atrasada: true })).tom).toBe('atencao');
    expect(situacaoFonte(fonte({ situacaoUltimaExecucao: 'FALHA' })).tom).toBe('perigo');
    expect(situacaoFonte(fonte({})).rotulo).toBe('Em dia');
  });

  it('link do alerta vira rota e parâmetros', () => {
    expect(destino('/painel?unidade=u1')).toEqual({ rota: '/painel', params: { unidade: 'u1' } });
    expect(destino('/admin/integracoes')).toEqual({ rota: '/admin/integracoes', params: {} });
    expect(destino(null)).toBeNull();
  });

  it('lista as últimas competências da atual para trás', () => {
    expect(ultimasCompetencias(3, new Date(2026, 0, 15))).toEqual([
      { valor: '2026-01', rotulo: 'jan/2026' },
      { valor: '2025-12', rotulo: 'dez/2025' },
      { valor: '2025-11', rotulo: 'nov/2025' },
    ]);
  });
});
