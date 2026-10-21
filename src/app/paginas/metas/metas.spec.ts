import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { of } from 'rxjs';
import type { Metas as DadosMetas } from '../../api/tipos';
import { Metas } from './metas';

const ARVORE: DadosMetas = {
  referencia: '2026-08-15',
  resumo: { cadastradas: 3, doContrato: 1, seguemAcima: 1 },
  linhas: [
    {
      unidadeId: 'conc', unidadeNome: 'Concessão A', tipo: 'CONCESSAO', unidadePaiId: null, nivel: 2,
      propria: { id: 'm1', valor: 80, alerta: 75, vigenciaInicio: '2025-01-01', vigenciaFim: '2026-12-31',
        origem: 'Contrato 001/2025, cláusula 7.2, p. 2', doContrato: true },
      herdada: null, adesao: 76.85, competenciaAdesao: '2026-08', situacao: 'ATENCAO',
    },
    {
      unidadeId: 'cid-a', unidadeNome: 'Cidade A', tipo: 'MUNICIPIO', unidadePaiId: 'conc', nivel: 3,
      propria: { id: 'm2', valor: 85, alerta: 80, vigenciaInicio: '2025-01-01', vigenciaFim: null, origem: null,
        doContrato: false },
      herdada: null, adesao: 85.41, competenciaAdesao: '2026-08', situacao: 'META_ATINGIDA',
    },
    {
      unidadeId: 'set', unidadeNome: 'Cidade A Norte', tipo: 'SETOR_COMERCIAL', unidadePaiId: 'cid-a', nivel: 4,
      propria: null, herdada: { unidadeId: 'cid-a', unidadeNome: 'Cidade A', valor: 85, alerta: 80 },
      adesao: 76.46, competenciaAdesao: '2026-08', situacao: 'ABAIXO_DO_ALERTA',
    },
  ],
};

describe('Metas', () => {
  it('mostra resumo, origem do contrato, herança e filtra por origem', async () => {
    TestBed.configureTestingModule({
      imports: [Metas],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: OidcSecurityService, useValue: { logoff: () => of(null) } },
      ],
    });
    const fixture = TestBed.createComponent(Metas);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.match('/api/v1/eu').forEach((r) => r.flush({ permissoes: ['indicador:gerenciar'] }));
    http.expectOne('/api/v1/metas').flush(ARVORE);
    await fixture.whenStable();

    const elemento = fixture.nativeElement as HTMLElement;
    const texto = elemento.textContent ?? '';
    expect(texto).toContain('3 metas cadastradas');
    expect(texto).toContain('1 do contrato');
    expect(texto).toContain('Contrato 001/2025, cláusula 7.2, p. 2');
    expect(texto).toContain('Segue Cidade A · 85,0%');
    expect(texto).toContain('desde jan/2025 · sem fim');
    // Meta de contrato não tem "Encerrar"; a manual tem; a herdada oferece "Meta própria".
    expect(elemento.querySelectorAll('td.acoes button').length).toBe(2);

    const origem = elemento.querySelectorAll('select')[1] as HTMLSelectElement;
    origem.value = 'HERDADA';
    origem.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(elemento.querySelectorAll('tbody tr').length).toBe(1);
  });
});
