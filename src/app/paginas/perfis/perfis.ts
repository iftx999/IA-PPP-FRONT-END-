import { HttpClient, httpResource } from '@angular/common/http';
import { Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom, type Observable } from 'rxjs';
import type { PedidoPerfil, Perfil, Permissao } from '../../api/tipos';
import { mensagemDeErro } from '../../nucleo/erro-api';
import { numero } from '../../nucleo/formato';
import { SessaoService } from '../../nucleo/sessao';

export const GERIR_USUARIOS = 'usuario:gerenciar';

/** Nome de cada área do catálogo ("area:acao"); áreas novas aparecem pelo código até ganharem nome. */
const AREAS: Record<string, string> = {
  unidade: 'Unidades',
  indicador: 'Indicadores e metas',
  contrato: 'Contratos',
  mapa: 'Mapa',
  relatorio: 'Relatórios',
  dados_pessoais: 'Dados pessoais',
  assistente: 'Assistente',
  integracao: 'Integrações',
  auditoria: 'Auditoria',
  usuario: 'Usuários e perfis',
};
const ORDEM_AREAS = Object.keys(AREAS);

export interface GrupoPermissoes {
  area: string;
  rotulo: string;
  permissoes: Permissao[];
}

/** Agrupa o catálogo por área, na ordem do menu; dentro da área, leitura antes da gestão. */
export function agruparPorArea(catalogo: Permissao[]): GrupoPermissoes[] {
  const grupos = new Map<string, Permissao[]>();
  for (const p of catalogo) {
    grupos.set(p.area, [...(grupos.get(p.area) ?? []), p]);
  }
  const posicao = (area: string) => {
    const i = ORDEM_AREAS.indexOf(area);
    return i < 0 ? ORDEM_AREAS.length : i;
  };
  const peso = (p: Permissao) => (p.codigo.endsWith(':ler') ? 0 : 1);
  return [...grupos.entries()]
    .sort(([a], [b]) => posicao(a) - posicao(b) || a.localeCompare(b))
    .map(([area, permissoes]) => ({
      area,
      rotulo: AREAS[area] ?? area,
      permissoes: [...permissoes].sort((a, b) => peso(a) - peso(b) || a.codigo.localeCompare(b.codigo)),
    }));
}

type Modo = 'novo' | 'editar' | 'ver';

/** Perfis e permissões (H6, RN-16): matriz para comparar perfis e editor agrupado por área. */
@Component({
  selector: 'aurora-perfis',
  imports: [
    ReactiveFormsModule, MatButtonModule, MatCheckboxModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatMenuModule, MatProgressSpinnerModule, MatTooltipModule,
  ],
  templateUrl: './perfis.html',
  styleUrl: './perfis.scss',
})
export class Perfis {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(MatDialog);
  protected readonly sessao = inject(SessaoService);

  /** Só carrega com a permissão: sem ela a API responde 403 e a tela explica. */
  private readonly podeGerir = computed(() => this.sessao.pode(GERIR_USUARIOS));
  protected readonly dadosCatalogo = httpResource<Permissao[]>(() => (this.podeGerir() ? '/api/v1/permissoes' : undefined));
  protected readonly dadosPerfis = httpResource<Perfil[]>(() => (this.podeGerir() ? '/api/v1/perfis' : undefined));

  protected readonly grupos = computed(() =>
    this.dadosCatalogo.hasValue() ? agruparPorArea(this.dadosCatalogo.value()) : undefined,
  );
  /** Perfis do sistema primeiro (são a referência), depois os personalizados por nome. */
  protected readonly perfis = computed(() =>
    this.dadosPerfis.hasValue()
      ? [...this.dadosPerfis.value()].sort(
          (a, b) => Number(b.sistema) - Number(a.sistema) || a.nome.localeCompare(b.nome, 'pt-BR'),
        )
      : undefined,
  );
  protected readonly resumo = computed(() => {
    const lista = this.perfis() ?? [];
    return { total: lista.length, sistema: lista.filter((p) => p.sistema).length };
  });
  protected readonly carregando = computed(() => this.dadosCatalogo.isLoading() || this.dadosPerfis.isLoading());
  protected readonly falhou = computed(() => !!this.dadosCatalogo.error() || !!this.dadosPerfis.error());

  protected readonly fmt = { numero };

  // ----- Diálogos -----
  private readonly modeloEditor = viewChild.required<TemplateRef<unknown>>('modeloEditor');
  private readonly modeloRemover = viewChild.required<TemplateRef<unknown>>('modeloRemover');
  private dialogoAberto?: MatDialogRef<unknown>;

  protected readonly modo = signal<Modo>('novo');
  protected readonly emEdicao = signal<Perfil | null>(null);
  protected readonly marcadas = signal(new Set<string>());
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);

  protected readonly formulario = new FormGroup({
    nome: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(80)] }),
    descricao: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(300)] }),
  });

  protected tem(perfil: Perfil, codigo: string): boolean {
    return perfil.permissoes.includes(codigo);
  }

  /** Quantas permissões da área o perfil tem, para o resumo na linha da área. */
  protected naArea(perfil: Perfil, grupo: GrupoPermissoes): number {
    return grupo.permissoes.filter((p) => perfil.permissoes.includes(p.codigo)).length;
  }

  protected usuarios(perfil: Perfil): string {
    return perfil.usuarios === 1 ? '1 usuário' : `${numero(perfil.usuarios)} usuários`;
  }

  protected abrirNovo(): void {
    this.abrirEditor('novo', null, { nome: '', descricao: '' }, []);
  }

  protected abrirEdicao(perfil: Perfil): void {
    this.abrirEditor(perfil.sistema ? 'ver' : 'editar', perfil, {
      nome: perfil.nome,
      descricao: perfil.descricao ?? '',
    }, perfil.permissoes);
  }

  /** Perfis do sistema não mudam: a forma de personalizar é partir de uma cópia. */
  protected duplicar(perfil: Perfil): void {
    this.dialogoAberto?.close();
    this.abrirEditor('novo', null, {
      nome: `Cópia de ${perfil.nome}`.slice(0, 80),
      descricao: perfil.descricao ?? '',
    }, perfil.permissoes);
  }

  protected abrirRemocao(perfil: Perfil): void {
    this.erro.set(null);
    this.emEdicao.set(perfil);
    this.dialogoAberto = this.dialogos.open(this.modeloRemover(), { width: '460px' });
  }

  protected marcada(codigo: string): boolean {
    return this.marcadas().has(codigo);
  }

  protected alternarPermissao(codigo: string, marcar: boolean): void {
    this.marcadas.update((atual) => {
      const novo = new Set(atual);
      if (marcar) {
        novo.add(codigo);
      } else {
        novo.delete(codigo);
      }
      return novo;
    });
  }

  protected estadoDaArea(grupo: GrupoPermissoes): 'todas' | 'algumas' | 'nenhuma' {
    const total = grupo.permissoes.filter((p) => this.marcadas().has(p.codigo)).length;
    return total === 0 ? 'nenhuma' : total === grupo.permissoes.length ? 'todas' : 'algumas';
  }

  protected alternarArea(grupo: GrupoPermissoes, marcar: boolean): void {
    this.marcadas.update((atual) => {
      const novo = new Set(atual);
      for (const p of grupo.permissoes) {
        if (marcar) {
          novo.add(p.codigo);
        } else {
          novo.delete(p.codigo);
        }
      }
      return novo;
    });
  }

  protected async salvar(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }
    if (this.marcadas().size === 0) {
      this.erro.set('Marque ao menos uma permissão.');
      return;
    }
    const v = this.formulario.getRawValue();
    const pedido: PedidoPerfil = {
      nome: v.nome.trim(),
      descricao: v.descricao.trim() || null,
      permissoes: [...this.marcadas()].sort(),
    };
    const perfil = this.emEdicao();
    await this.enviar(() =>
      perfil ? this.http.put(`/api/v1/perfis/${perfil.id}`, pedido) : this.http.post('/api/v1/perfis', pedido),
    );
  }

  protected async confirmarRemocao(): Promise<void> {
    const perfil = this.emEdicao();
    if (perfil) {
      await this.enviar(() => this.http.delete(`/api/v1/perfis/${perfil.id}`));
    }
  }

  protected fechar(): void {
    this.dialogoAberto?.close();
  }

  private abrirEditor(modo: Modo, perfil: Perfil | null, valores: { nome: string; descricao: string }, permissoes: string[]): void {
    this.erro.set(null);
    this.modo.set(modo);
    this.emEdicao.set(perfil);
    this.marcadas.set(new Set(permissoes));
    this.formulario.reset(valores);
    if (modo === 'ver') {
      this.formulario.disable();
    } else {
      this.formulario.enable();
    }
    this.dialogoAberto = this.dialogos.open(this.modeloEditor(), { width: '720px', autoFocus: 'dialog' });
  }

  private async enviar(requisicao: () => Observable<unknown>): Promise<void> {
    this.salvando.set(true);
    this.erro.set(null);
    try {
      await firstValueFrom(requisicao());
      this.dialogoAberto?.close();
      this.dadosPerfis.reload();
      // A pessoa pode ter alterado o próprio perfil: as permissões efetivas vêm de /eu.
      this.sessao.eu.reload();
    } catch (falha) {
      this.erro.set(mensagemDeErro(falha));
    } finally {
      this.salvando.set(false);
    }
  }
}
