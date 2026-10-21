import { deIso, paraIso } from './datas';

describe('datas', () => {
  it('converte sem deslocar pelo fuso', () => {
    expect(paraIso(new Date(2026, 0, 31))).toBe('2026-01-31');
    expect(paraIso(deIso('2026-12-31'))).toBe('2026-12-31');
    expect(paraIso(null)).toBeNull();
  });
});
