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

const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const relativo = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

/** Instante ISO → "22/10/2026". */
export function data(iso: string | null | undefined): string {
  return iso ? dataCurta.format(new Date(iso)) : '—';
}

/** Instante ISO → "22/10/2026, 11:30" (para dicas com o valor exato). */
export function dataEHora(iso: string | null | undefined): string {
  return iso ? dataHora.format(new Date(iso)) : '—';
}

/** Instante ISO → "agora há pouco", "há 3 horas", "ontem", "há 2 meses". */
export function haQuantoTempo(iso: string | null | undefined, agora = new Date()): string {
  if (!iso) {
    return '—';
  }
  const segundos = (new Date(iso).getTime() - agora.getTime()) / 1000;
  const passos: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000], ['month', 2_592_000], ['day', 86_400], ['hour', 3_600], ['minute', 60],
  ];
  for (const [unidade, tamanho] of passos) {
    if (Math.abs(segundos) >= tamanho) {
      return relativo.format(Math.round(segundos / tamanho), unidade);
    }
  }
  return 'agora há pouco';
}
