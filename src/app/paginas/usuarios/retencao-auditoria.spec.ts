import { descreverPrazo } from './retencao-auditoria';

describe('Retenção da auditoria', () => {
  it('descreve o prazo em meses e, quando exato, em anos', () => {
    expect(descreverPrazo(60)).toBe('60 meses (5 anos)');
    expect(descreverPrazo(12)).toBe('12 meses (1 ano)');
    expect(descreverPrazo(18)).toBe('18 meses');
    expect(descreverPrazo(undefined)).toBe('');
  });
});
