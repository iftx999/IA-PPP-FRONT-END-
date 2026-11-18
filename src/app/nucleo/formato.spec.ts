import {
  competenciaCurta,
  competenciaLonga,
  data,
  numero,
  percentual,
  pontosPercentuais,
} from './formato';

describe('formato pt-BR', () => {
  it('data sem hora é o dia do calendário, em qualquer fuso', () => {
    expect(data('2026-11-18')).toBe('18/11/2026');
    expect(data('2026-01-01')).toBe('01/01/2026');
    expect(data(null)).toBe('—');
  });

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
