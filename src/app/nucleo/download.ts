import { HttpClient, HttpParams } from '@angular/common/http';
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
    const nome = /filename="?([^";]+)"?/.exec(resposta.headers.get('Content-Disposition') ?? '')?.[1] ?? nomePadrao;
    const endereco = URL.createObjectURL(resposta.body!);
    const link = document.createElement('a');
    link.href = endereco;
    link.download = nome;
    link.click();
    URL.revokeObjectURL(endereco);
  }
}
