import type { ClientePlataforma } from '../../api/tipos';
import { filtrarClientes } from './plataforma';

const cliente = (mudancas: Partial<ClientePlataforma>): ClientePlataforma => ({
  id: 'x', codigo: 'x', nome: 'X', ativo: true, criadoEm: '2026-10-01T00:00:00Z', emissor: null, contatoNome: null,
  contatoEmail: null, limites: { usuarios: 10, assistenteTokensPorMes: null, assistenteUsdPorMes: null },
  usuariosAtivos: 0, temLogo: false, provisionado: true, ...mudancas,
});

describe('Plataforma', () => {
  it('filtra clientes por texto e situação', () => {
    const lista = [
      cliente({ id: '1', nome: 'Águas do Norte', codigo: 'aguas-norte', contatoEmail: 'ti@norte.dev' }),
      cliente({ id: '2', nome: 'Saneamento Sul', codigo: 'sul', provisionado: false }),
      cliente({ id: '3', nome: 'Antigo', codigo: 'antigo', ativo: false }),
    ];
    const ids = (r: ClientePlataforma[]) => r.map((c) => c.id);
    expect(ids(filtrarClientes(lista, 'aguas', null))).toEqual(['1']);
    expect(ids(filtrarClientes(lista, 'norte.dev', null))).toEqual(['1']);
    expect(ids(filtrarClientes(lista, '', 'ATIVO'))).toEqual(['1']);
    expect(ids(filtrarClientes(lista, '', 'PENDENTE'))).toEqual(['2']);
    expect(ids(filtrarClientes(lista, '', 'INATIVO'))).toEqual(['3']);
  });
});
