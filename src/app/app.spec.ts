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

  it('mostra o menu e o usuário retornado pela API', async () => {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/eu')
      .flush({ usuarioId: '1', nome: 'Administração Dev', email: 'admin@exemplo.dev', tenantId: 't',
               tenant: 'Grupo Saneamento Exemplo', permissoes: [] });
    await fixture.whenStable();
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Adesão');
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
