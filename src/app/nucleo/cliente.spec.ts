import type { ConfiguracaoAurora } from './configuracao';
import { clienteEscolhido, esquecerCliente, lembrarCliente, modoDeLogin, normalizarCodigo } from './cliente';
import { retornoSeguro } from '../paginas/acesso/acesso';
import { sugerirCodigo, situacaoCliente, usoDeUsuarios } from '../paginas/plataforma/plataforma';

const config: ConfiguracaoAurora = {
  emissor: 'https://id/realms/aurora', clienteId: 'aurora-web', escolherCliente: true,
  emissorPlataforma: 'https://id/realms/plataforma', clientePlataforma: 'aurora-plataforma-web',
};
const norte = { codigo: 'grupo-norte', nome: 'Grupo Norte', emissor: 'https://id/realms/grupo-norte', temLogo: false };

describe('Escolha do cliente (ADR 0027)', () => {
  it('plataforma, cliente lembrado, tela do código ou instalação de um cliente só', () => {
    expect(modoDeLogin(config, '/plataforma', null)).toEqual({
      modo: 'plataforma', emissor: 'https://id/realms/plataforma', clienteId: 'aurora-plataforma-web',
    });
    expect(modoDeLogin(config, '/plataforma/entrar', norte).modo).toBe('plataforma');
    expect(modoDeLogin(config, '/plataformas', null).modo).toBe('escolher');
    expect(modoDeLogin(config, '/painel', norte)).toEqual({ modo: 'cliente', emissor: norte.emissor, clienteId: 'aurora-web', cliente: norte });
    expect(modoDeLogin(config, '/painel', null)).toEqual({ modo: 'escolher' });
    expect(modoDeLogin({ ...config, escolherCliente: false }, '/painel', norte)).toEqual({
      modo: 'cliente', emissor: 'https://id/realms/aurora', clienteId: 'aurora-web', cliente: null,
    });
    // Sem realm da plataforma configurado, /plataforma não muda o login.
    expect(modoDeLogin({ emissor: 'e', clienteId: 'c' }, '/plataforma', null).modo).toBe('cliente');
  });

  it('lembra só o que é válido e normaliza o código', () => {
    const armazenamento = new Map<string, string>();
    const falso = {
      getItem: (k: string) => armazenamento.get(k) ?? null, setItem: (k: string, v: string) => armazenamento.set(k, v),
      removeItem: (k: string) => armazenamento.delete(k),
    } as unknown as Storage;
    expect(clienteEscolhido(falso)).toBeNull();
    lembrarCliente(norte, falso);
    expect(clienteEscolhido(falso)).toEqual(norte);
    armazenamento.set('aurora.cliente', '{"codigo":1}');
    expect(clienteEscolhido(falso)).toBeNull();
    armazenamento.set('aurora.cliente', 'não é json');
    expect(clienteEscolhido(falso)).toBeNull();
    esquecerCliente(falso);
    expect(armazenamento.size).toBe(0);
    expect(normalizarCodigo('  Grupo-Norte ')).toBe('grupo-norte');
  });

  it('retorno só para caminhos internos', () => {
    expect(retornoSeguro('/metas?x=1')).toBe('/metas?x=1');
    for (const ruim of [null, '', '//evil.example', 'https://evil.example', '/acesso', 'javascript:alert(1)']) {
      expect(retornoSeguro(ruim)).toBe('/painel');
    }
  });
});

describe('Plataforma', () => {
  it('sugere o código a partir do nome', () => {
    expect(sugerirCodigo('Grupo Saneamento São João — Norte!')).toBe('grupo-saneamento-sao-joao-norte');
    expect(sugerirCodigo('  ---  ')).toBe('');
    expect(sugerirCodigo('x'.repeat(39) + ' y')).toBe('x'.repeat(39));
  });

  it('situação e uso do limite de usuários', () => {
    expect(situacaoCliente({ ativo: true, provisionado: false }).rotulo).toBe('Provisionamento pendente');
    expect(situacaoCliente({ ativo: false, provisionado: true })).toEqual({ rotulo: 'Inativo', tom: 'neutro' });
    const limites = { usuarios: 3, assistenteTokensPorMes: null, assistenteUsdPorMes: null };
    expect(usoDeUsuarios({ usuariosAtivos: 3, limites })).toEqual({ texto: '3 de 3', cheio: true });
    expect(usoDeUsuarios({ usuariosAtivos: 2, limites: { ...limites, usuarios: null } })).toEqual({ texto: '2', cheio: false });
  });
});
