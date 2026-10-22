import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AlertasService } from '../nucleo/alertas';
import { SessaoService } from '../nucleo/sessao';
import { TemaService } from '../nucleo/tema';

interface ItemMenu {
  rota: string;
  rotulo: string;
}

/** Estrutura da aplicação: barra lateral fixa + cabeçalho + conteúdo (docs/07, seções 7.4 e 7.5). */
@Component({
  selector: 'aurora-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatTooltipModule],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  protected readonly tema = inject(TemaService);
  protected readonly sessao = inject(SessaoService);
  protected readonly alertas = inject(AlertasService);

  protected readonly secoes: { titulo: string; itens: ItemMenu[] }[] = [
    {
      titulo: 'Adesão',
      itens: [
        { rota: '/painel', rotulo: 'Painel' },
        { rota: '/metas', rotulo: 'Metas' },
        { rota: '/sem-ligacao', rotulo: 'Sem ligação' },
        { rota: '/mapa', rotulo: 'Mapa' },
        { rota: '/alertas', rotulo: 'Alertas' },
      ],
    },
    {
      titulo: 'Contrato',
      itens: [
        { rota: '/contratos', rotulo: 'Contratos' },
        { rota: '/assistente', rotulo: 'Assistente' },
      ],
    },
    {
      titulo: 'Administração',
      itens: [
        { rota: '/admin/unidades', rotulo: 'Unidades' },
        { rota: '/admin/usuarios', rotulo: 'Usuários' },
        { rota: '/admin/perfis', rotulo: 'Perfis' },
        { rota: '/admin/auditoria', rotulo: 'Auditoria' },
        { rota: '/admin/integracoes', rotulo: 'Integrações' },
      ],
    },
  ];
}
