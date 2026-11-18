import type { Dispositivo } from '../../api/tipos';
import { filtrarDispositivos, situacaoDoDispositivo } from './textos';

const base: Dispositivo = {
  id: 'd1',
  usuarioId: 'u1',
  usuarioNome: 'Ana',
  modelo: 'Moto G',
  sistema: 'Android 15',
  versaoApp: '1.0.0',
  cadastradoEm: '2026-11-18T10:00:00Z',
  ultimoContato: '2026-11-18T11:00:00Z',
  revogado: false,
  revogadoEm: null,
  revogadoPor: null,
  apagadoEm: null,
};

describe('celulares do app', () => {
  it('mostra a situação do celular', () => {
    expect(situacaoDoDispositivo(base).texto).toBe('Em uso');
    const bloqueado = { ...base, revogado: true, revogadoEm: '2026-11-18T12:00:00Z' };
    expect(situacaoDoDispositivo(bloqueado)).toEqual({
      texto: 'Bloqueado · aguardando conexão',
      tom: 'perigo',
    });
    expect(situacaoDoDispositivo({ ...bloqueado, apagadoEm: '2026-11-18T13:00:00Z' }).tom).toBe(
      'neutro',
    );
  });

  it('filtra em uso e bloqueados', () => {
    const lista = [base, { ...base, id: 'd2', revogado: true }];
    expect(filtrarDispositivos(lista, 'EM_USO').map((d) => d.id)).toEqual(['d1']);
    expect(filtrarDispositivos(lista, 'BLOQUEADOS').map((d) => d.id)).toEqual(['d2']);
    expect(filtrarDispositivos(lista, 'TODOS')).toHaveLength(2);
  });
});
