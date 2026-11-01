import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { of } from 'rxjs';
import { Shell } from './layout/shell';

describe('Shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Shell],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: OidcSecurityService, useValue: { logoff: () => of(null) } },
      ],
    }).compileComponents();
  });

  it('mostra o menu permitido e o usuário retornado pela API', async () => {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/eu')
      .flush({ usuarioId: '1', nome: 'Administração Dev', email: 'admin@exemplo.dev', tenantId: 't',
               tenant: 'Grupo Saneamento Exemplo', permissoes: ['indicador:ler'] });
    // Com indicador:ler, o contador de alertas consulta a API (depois que /eu é processado).
    const http = TestBed.inject(HttpTestingController);
    let pedidos = http.match('/api/v1/alertas/resumo');
    for (let i = 0; i < 20 && pedidos.length === 0; i++) {
      TestBed.tick();
      await new Promise((r) => setTimeout(r));
      pedidos = http.match('/api/v1/alertas/resumo');
    }
    expect(pedidos).toHaveLength(1);
    pedidos[0]!.flush({ abertos: 0, criticos: 0 });
    await fixture.whenStable();
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Adesão');
    expect(texto).toContain('Painel');
    // Doc 08, 8.4: telas sem permissão não aparecem no menu.
    expect(texto).not.toContain('Integrações');
    expect(texto).not.toContain('Contratos');
    expect(texto).toContain('Grupo Saneamento Exemplo');
    expect(texto).toContain('Administração Dev');
    expect(texto).toContain('AD');
  });

  it('avisa quando o usuário não tem acesso ao tenant', async () => {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/eu')
      .flush('Usuário sem acesso', { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sem acesso');
  });
});
