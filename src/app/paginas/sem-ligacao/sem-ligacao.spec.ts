import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { of } from 'rxjs';
import type { SemLigacao as DadosSemLigacao } from '../../api/tipos';
import { SemLigacao } from './sem-ligacao';

const PAGINA: DadosSemLigacao = {
  unidadeId: 'cid-a',
  unidadeNome: 'Cidade A',
  competencia: '2026-08',
  totais: { todos: 5, factiveis: 4, cortados: 1 },
  itens: [
    {
      matricula: '••••001',
      unidadeId: 's1',
      unidadeNome: 'Cidade A Centro',
      situacao: 'CORTADO',
      ultimoMesLigado: '2026-07',
      primeiraCompetencia: '2026-06',
      mesesSemLigacao: 1,
    },
    {
      matricula: '••••002',
      unidadeId: 's1',
      unidadeNome: 'Cidade A Centro',
      situacao: 'FACTIVEL',
      ultimoMesLigado: null,
      primeiraCompetencia: '2026-06',
      mesesSemLigacao: null,
    },
  ],
  proximo: 'cursor-opaco',
  matriculasVisiveis: false,
};

describe('SemLigacao', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SemLigacao],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: OidcSecurityService, useValue: { logoff: () => of(null) } },
      ],
    });
  });

  it('mostra abas, histórico, aviso de matrículas ocultas e carrega mais pelo cursor', async () => {
    const fixture = TestBed.createComponent(SemLigacao);
    fixture.componentRef.setInput('unidade', 'cid-a');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.match('/api/v1/eu').forEach((r) => r.flush({ permissoes: [] }));
    http.expectOne((r) => r.url === '/api/v1/imoveis/sem-ligacao' && !r.params.has('cursor')).flush(PAGINA);
    await fixture.whenStable();

    const elemento = fixture.nativeElement as HTMLElement;
    const texto = elemento.textContent ?? '';
    expect(texto).toContain('Todos 5');
    expect(texto).toContain('Factíveis 4');
    expect(texto).toContain('Ligado até jul/2026');
    expect(texto).toContain('Nunca ligado');
    expect(texto).toContain('Sem ligação desde jun/2026');
    expect(texto).toContain('Matrículas parcialmente ocultas');
    expect(texto).toContain('Mostrando 2 de 5');
    expect(texto).not.toContain('Exportar CSV');

    const botao = [...elemento.querySelectorAll('button')].find((b) => b.textContent?.includes('Carregar mais'))!;
    botao.click();
    const proxima = http.expectOne((r) => r.params.get('cursor') === 'cursor-opaco');
    proxima.flush({ ...PAGINA, itens: [{ ...PAGINA.itens[1]!, matricula: '••••003' }], proximo: null });
    await fixture.whenStable();
    expect(elemento.textContent).toContain('Mostrando 3 de 5');
    expect(elemento.textContent).not.toContain('Carregar mais');
  });
});
