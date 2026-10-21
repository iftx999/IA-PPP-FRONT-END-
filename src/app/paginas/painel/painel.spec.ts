import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Painel as DadosPainel } from '../../api/tipos';
import { Painel } from './painel';

/** Resposta da API com os números do demo (Concessão A, ago/2026). */
const CONCESSAO_A: DadosPainel = {
  unidade: { id: 'conc-a', nome: 'Concessão A', tipo: 'CONCESSAO' },
  acima: { id: 'grupo', nome: 'Grupo Saneamento Exemplo', tipo: 'GRUPO' },
  competencia: '2026-08',
  competenciasDisponiveis: ['2026-08', '2026-07'],
  adesao: { percentual: 76.8509, ligados: 8761, comRede: 11400, semLigacao: 2639 },
  factiveis: 2431,
  cortados: 208,
  variacaoPp: 0.7105,
  situacao: 'ATENCAO',
  meta: {
    valor: 80,
    alerta: 75,
    vigenciaInicio: '2025-01-01',
    vigenciaFim: '2026-12-31',
    origem: 'Contrato 001/2025, cláusula 7.2, p. 2',
    seguidaDe: null,
  },
  projecao: {
    ritmoAtual: 101,
    mesesNaBase: 4,
    faltam: 359,
    mesesRestantes: 4,
    ritmoNecessario: 89.8,
    projecaoNoPrazo: 80.3947,
    prazo: '2026-12',
    mesAtingimento: '2026-12',
    atinge: true,
  },
  serie: [
    { competencia: '2026-07', percentual: 76.1404, ligados: 8680, comRede: 11400 },
    { competencia: '2026-08', percentual: 76.8509, ligados: 8761, comRede: 11400 },
  ],
  unidades: [
    {
      unidade: { id: 'cid-b', nome: 'Cidade B', tipo: 'MUNICIPIO' },
      adesao: { percentual: 67.9821, ligados: 3807, comRede: 5600, semLigacao: 1793 },
      variacaoPp: 0.48,
      situacao: 'ABAIXO_DO_ALERTA',
      meta: { valor: 75, alerta: 70, vigenciaInicio: '2025-01-01', vigenciaFim: null, origem: null, seguidaDe: null },
    },
  ],
};

describe('Painel', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Painel],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  async function renderizar(resposta: DadosPainel | null, status = 200): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(Painel);
    fixture.componentRef.setInput('unidade', 'conc-a');
    fixture.detectChanges();
    const req = TestBed.inject(HttpTestingController).expectOne((r) => r.url === '/api/v1/painel');
    expect(req.request.params.get('unidade')).toBe('conc-a');
    if (status === 200) {
      req.flush(resposta);
    } else {
      req.flush(null, { status, statusText: 'erro' });
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('mostra o indicador, a situação e a projeção no formato pt-BR', async () => {
    const texto = (await renderizar(CONCESSAO_A)).textContent ?? '';
    expect(texto).toContain('76,9%');
    expect(texto).toContain('8.761');
    expect(texto).toContain('11.400');
    expect(texto).toContain('Atenção');
    expect(texto).toContain('+0,7 p.p.');
    expect(texto).toContain('Contrato 001/2025, cláusula 7.2, p. 2');
    expect(texto).toContain('a meta sai em dez/2026');
    expect(texto).toContain('359');
    expect(texto).toContain('≈ 90/mês');
    expect(texto).toContain('Ver os 2.639 imóveis sem ligação');
    expect(texto).toContain('Voltar para Grupo Saneamento Exemplo');
  });

  it('lista as unidades filhas com a situação', async () => {
    const texto = (await renderizar(CONCESSAO_A)).textContent ?? '';
    expect(texto).toContain('Cidade B');
    expect(texto).toContain('Abaixo do alerta');
    expect(texto).toContain('68,0%');
  });

  it('informa quando não há dados no escopo', async () => {
    const texto = (await renderizar(null, 404)).textContent ?? '';
    expect(texto).toContain('Não há medições de adesão');
  });
});
