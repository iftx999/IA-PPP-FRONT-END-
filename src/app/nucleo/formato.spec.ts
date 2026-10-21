import { competenciaCurta, competenciaLonga, numero, percentual, pontosPercentuais } from './formato';

describe('formato pt-BR', () => {
  it('formata os números do demo', () => {
    expect(percentual(76.8509)).toBe('76,9%');
    expect(numero(11400)).toBe('11.400');
    expect(pontosPercentuais(0.7105)).toBe('+0,7 p.p.');
    expect(pontosPercentuais(-1.25)).toBe('−1,3 p.p.');
    expect(percentual(null)).toBe('—');
  });

  it('formata competências', () => {
    expect(competenciaCurta('2026-08')).toBe('ago/2026');
    expect(competenciaLonga('2026-08')).toBe('Agosto de 2026');
  });
});
