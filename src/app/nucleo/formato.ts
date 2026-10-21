/** Formatação pt-BR de números, percentuais e competências (docs/07: vírgula decimal, ponto de milhar). */

const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const umaCasa = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mesCurto = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' });
const mesLongo = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });

export function numero(valor: number | null | undefined): string {
  return valor == null ? '—' : inteiro.format(valor);
}

/** 76.8509 → "76,9%" */
export function percentual(valor: number | null | undefined): string {
  return valor == null ? '—' : `${umaCasa.format(valor)}%`;
}

/** 0.7105 → "+0,7 p.p." */
export function pontosPercentuais(valor: number | null | undefined): string {
  if (valor == null) {
    return '—';
  }
  const sinal = valor > 0 ? '+' : valor < 0 ? '−' : '';
  return `${sinal}${umaCasa.format(Math.abs(valor))} p.p.`;
}

function dataDaCompetencia(competencia: string): Date {
  const [ano, mes] = competencia.split('-').map(Number);
  return new Date(Date.UTC(ano!, mes! - 1, 1));
}

/** "2026-08" → "ago/2026" */
export function competenciaCurta(competencia: string | null | undefined): string {
  if (!competencia) {
    return '—';
  }
  const data = dataDaCompetencia(competencia);
  return `${mesCurto.format(data).replace('.', '')}/${data.getUTCFullYear()}`;
}

/** "2026-08" → "Agosto de 2026" */
export function competenciaLonga(competencia: string): string {
  const data = dataDaCompetencia(competencia);
  const mes = mesLongo.format(data);
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} de ${data.getUTCFullYear()}`;
}
