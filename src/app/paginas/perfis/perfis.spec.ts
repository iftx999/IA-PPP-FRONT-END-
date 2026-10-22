import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { of } from 'rxjs';
import type { Perfil, Permissao } from '../../api/tipos';
import { Perfis, agruparPorArea } from './perfis';

const CATALOGO: Permissao[] = [
  { codigo: 'usuario:gerenciar', descricao: 'Gerenciar usuários, perfis e escopos', area: 'usuario' },
  { codigo: 'unidade:gerenciar', descricao: 'Cadastrar, mover e desativar unidades', area: 'unidade' },
  { codigo: 'unidade:ler', descricao: 'Consultar unidades', area: 'unidade' },
  { codigo: 'novidade:usar', descricao: 'Área ainda sem nome', area: 'novidade' },
];

const PERFIS: Perfil[] = [
  { id: 'p2', nome: 'Leitura', descricao: null, sistema: false, permissoes: ['unidade:ler'], usuarios: 0 },
  {
    id: 'p1', nome: 'Administrador', descricao: 'Tudo', sistema: true,
    permissoes: ['usuario:gerenciar', 'unidade:ler', 'unidade:gerenciar'], usuarios: 1,
  },
];

function criar(permissoes: string[]) {
  TestBed.configureTestingModule({
    imports: [Perfis],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: OidcSecurityService, useValue: { logoff: () => of(null) } },
    ],
  });
  const fixture = TestBed.createComponent(Perfis);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  http.match('/api/v1/eu').forEach((r) => r.flush({ permissoes }));
  return { fixture, http };
}

/** A resposta de /eu chega numa volta do event loop; só então a tela pede perfis e catálogo. */
async function aposSessao(): Promise<void> {
  await new Promise((resolver) => setTimeout(resolver));
  TestBed.tick();
}

describe('agruparPorArea', () => {
  it('ordena as áreas como o menu, leitura antes da gestão, e mantém áreas desconhecidas no fim', () => {
    const grupos = agruparPorArea(CATALOGO);
    expect(grupos.map((g) => g.rotulo)).toEqual(['Unidades', 'Usuários e perfis', 'novidade']);
    expect(grupos[0]!.permissoes.map((p) => p.codigo)).toEqual(['unidade:ler', 'unidade:gerenciar']);
  });
});

describe('Perfis', () => {
  it('monta a matriz com perfis do sistema primeiro e contagem por área', async () => {
    const { fixture, http } = criar(['usuario:gerenciar']);
    await aposSessao();
    http.expectOne('/api/v1/permissoes').flush(CATALOGO);
    http.expectOne('/api/v1/perfis').flush(PERFIS);
    await fixture.whenStable();

    const elemento = fixture.nativeElement as HTMLElement;
    const texto = elemento.textContent ?? '';
    expect(texto).toContain('2 perfis');
    expect(texto).toContain('1 do sistema');
    const colunas = [...elemento.querySelectorAll('thead .perfil-nome')].map((e) => e.textContent?.trim());
    expect(colunas).toEqual(['Administrador', 'Leitura']);
    const unidades = elemento.querySelector('tbody tr.area')!;
    expect(unidades.textContent).toContain('2/2');
    expect(unidades.textContent).toContain('1/2');
    expect(elemento.querySelectorAll('[aria-label="Leitura: permitido"]').length).toBe(1);
  });

  it('sem a permissão de gerir usuários explica e não chama a API', async () => {
    const { fixture, http } = criar(['indicador:ler']);
    await aposSessao();
    await fixture.whenStable();
    http.expectNone('/api/v1/perfis');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Seu perfil não permite gerenciar perfis');
  });
});
