import type { FonteApi } from '../../api/tipos';
import { destino } from '../alertas/alertas';
import { atraso, situacaoFonte, ultimasCompetencias } from './integracoes';

const fonte = (mudancas: Partial<FonteApi>): FonteApi => ({
  id: 'f', nome: 'Comercial', tipo: 'AGENTE', sistemaOrigem: null, frequencia: null, atrasoMaximoHoras: 48, ativo: true,
  criadaEm: '2026-10-01T00:00:00Z', ultimaCarga: null, situacaoUltimaExecucao: null, ultimaExecucao: null,
  credenciaisAtivas: 0, atrasada: false, ...mudancas,
});

describe('Integrações e alertas', () => {
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
