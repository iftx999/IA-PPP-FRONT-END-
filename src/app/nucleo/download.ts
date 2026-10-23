import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Baixa um arquivo da API com o token (um link comum não enviaria a autorização). */
@Injectable({ providedIn: 'root' })
export class DownloadService {
  private readonly http = inject(HttpClient);

  async baixar(url: string, params: Record<string, string>, nomePadrao: string): Promise<void> {
    const resposta = await firstValueFrom(
      this.http.get(url, { params: new HttpParams({ fromObject: params }), observe: 'response', responseType: 'blob' }),
    );
    this.salvar(resposta, nomePadrao);
  }

  /** Mesmo que baixar, para exportações que levam um corpo (ex.: área e camadas do mapa). */
  async baixarComCorpo(url: string, corpo: unknown, nomePadrao: string): Promise<void> {
    const resposta = await firstValueFrom(this.http.post(url, corpo, { observe: 'response', responseType: 'blob' }));
    this.salvar(resposta, nomePadrao);
  }

  private salvar(resposta: HttpResponse<Blob>, nomePadrao: string): void {
    const nome = /filename="?([^";]+)"?/.exec(resposta.headers.get('Content-Disposition') ?? '')?.[1] ?? nomePadrao;
    const endereco = URL.createObjectURL(resposta.body!);
    const link = document.createElement('a');
    link.href = endereco;
    link.download = nome;
    link.click();
    URL.revokeObjectURL(endereco);
  }
}
