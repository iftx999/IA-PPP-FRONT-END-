/** Converte entre Date (componentes de calendário) e "yyyy-MM-dd" da API, sempre em data local (sem fuso). */
export function paraIso(data: Date | null | undefined): string | null {
  if (!data) {
    return null;
  }
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

export function deIso(texto: string | null | undefined): Date | null {
  if (!texto) {
    return null;
  }
  const [ano, mes, dia] = texto.split('-').map(Number);
  return new Date(ano!, mes! - 1, dia ?? 1);
}
