import { secoesPermitidas, telaInicial } from './telas';

describe('Telas por permissão', () => {
  it('administrador vê tudo e entra no painel', () => {
    const todas = ['indicador:ler', 'contrato:ler', 'assistente:usar', 'unidade:ler', 'usuario:gerenciar', 'auditoria:ler', 'integracao:gerenciar'];
    expect(secoesPermitidas(todas).flatMap((s) => s.telas)).toHaveLength(13);
    expect(telaInicial(todas)).toBe('/painel');
  });

  it('auditor vê só a administração que pode abrir e entra nela', () => {
    const auditor = ['auditoria:ler', 'unidade:ler'];
    const secoes = secoesPermitidas(auditor);
    expect(secoes.map((s) => s.titulo)).toEqual(['Administração']);
    expect(secoes[0]!.telas.map((t) => t.rotulo)).toEqual(['Unidades', 'Auditoria']);
    expect(telaInicial(auditor)).toBe('/admin/unidades');
  });

  it('equipe de campo entra em Minhas OS', () => {
    const campo = ['os:executar', 'dados_pessoais:ler', 'unidade:ler'];
    expect(secoesPermitidas(campo).map((s) => s.titulo)).toEqual(['Campo', 'Administração']);
    expect(telaInicial(campo)).toBe('/minhas-ordens');
  });

  it('sem permissão de tela, entra no painel (que explica a falta de acesso)', () => {
    expect(secoesPermitidas([])).toEqual([]);
    expect(telaInicial(['relatorio:exportar'])).toBe('/painel');
  });
});
