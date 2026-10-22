import type { FonteApi } from '../../api/tipos';
import { destino } from '../alertas/alertas';
import { atraso, situacaoFonte } from './integracoes';

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
});
