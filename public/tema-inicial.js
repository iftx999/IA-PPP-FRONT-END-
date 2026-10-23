// Aplica o tema salvo antes da primeira pintura (evita piscar). Fora do index.html: a CSP não aceita script inline.
try {
  const tema = localStorage.getItem('aurora.tema');
  if (tema) {
    document.documentElement.dataset['theme'] = tema;
  }
} catch {
  // Armazenamento indisponível (aba privada): fica o tema padrão.
}
