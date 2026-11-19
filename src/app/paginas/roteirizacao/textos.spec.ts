import type { ParadaDaRota, RotaDaEquipe } from '../../api/tipos';
import {
  alternarFixacao,
  duracao,
  fixacoesIniciais,
  km,
  moverPara,
  mudou,
  pedidoDeRecalculo,
} from './textos';

const parada = (id: string, ordem: number, fixada = false): ParadaDaRota => ({
  ordemServicoId: id,
  numero: ordem,
  servicoNome: 'Vistoria',
  prioridade: 'MEDIA',
  ordem,
  chegadaPrevista: '2026-11-19T10:00:00Z',
  saidaPrevista: '2026-11-19T10:20:00Z',
  kmAte: 1,
  minutosAte: 3,
  fixada,
  atrasa: false,
  local: null,
});

const rota = (equipeId: string, paradas: ParadaDaRota[]): RotaDaEquipe => ({
  equipeId,
  equipeNome: equipeId,
  partida: null,
  inicio: '2026-11-19T10:30:00Z',
  fimPrevisto: '2026-11-19T19:00:00Z',
  km: 10,
  minutosDeslocamento: 30,
  minutosServico: 120,
  tracado: [],
  paradas,
});

describe('roteirização', () => {
  const rotas = [
    rota('A', [parada('os1', 1, true), parada('os2', 2), parada('os3', 3)]),
    rota('B', [parada('os4', 1)]),
  ];

  it('começa com as fixadas que vieram do cálculo', () => {
    const inicial = fixacoesIniciais(rotas);
    expect([...inicial.keys()]).toEqual(['os1']);
    expect(mudou(inicial, inicial)).toBe(false);
  });

  it('fixa na ordem da rota e as movidas vão para o fim da outra equipe', () => {
    let f = fixacoesIniciais(rotas);
    f = alternarFixacao(f, rotas, 'os3');
    f = moverPara(f, 'os2', 'B');
    f = alternarFixacao(f, rotas, 'os1');
    expect(mudou(fixacoesIniciais(rotas), f)).toBe(true);
    expect(pedidoDeRecalculo(f)).toEqual({
      fixadas: [
        { equipeId: 'A', ordens: ['os3'] },
        { equipeId: 'B', ordens: ['os2'] },
      ],
    });
  });

  it('formata duração e distância', () => {
    expect(duracao(40)).toBe('40 min');
    expect(duracao(120)).toBe('2 h');
    expect(duracao(135)).toBe('2 h 15 min');
    expect(km(3.456)).toBe('3,5 km');
  });
});
