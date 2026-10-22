import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localePt from '@angular/common/locales/pt';
import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideDateFnsAdapter } from '@angular/material-date-fns-adapter';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialogConfig } from '@angular/material/dialog';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { authInterceptor } from 'angular-auth-oidc-client';
import { ptBR } from 'date-fns/locale';
import { routes } from './app.routes';
import { provideAutenticacao } from './nucleo/autenticacao';

registerLocaleData(localePt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authInterceptor()])),
    provideAutenticacao(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    // Campos do Material: contorno e sem espaço reservado para mensagens quando não há mensagem.
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline', subscriptSizing: 'dynamic' } },
    // Diálogos: a largura pedida em cada tela vale até a borda da tela (o padrão do Material corta em 560px).
    { provide: MAT_DIALOG_DEFAULT_OPTIONS, useValue: { ...new MatDialogConfig(), maxWidth: 'calc(100vw - 32px)' } },
    // Calendário em pt-BR: digita e exibe dd/MM/yyyy (o adaptador nativo do navegador não interpreta esse formato).
    { provide: MAT_DATE_LOCALE, useValue: ptBR },
    provideDateFnsAdapter({
      parse: { dateInput: ['dd/MM/yyyy', 'ddMMyyyy', 'dd/MM/yy'] },
      display: {
        dateInput: 'dd/MM/yyyy',
        monthYearLabel: 'MMM yyyy',
        dateA11yLabel: 'PPP',
        monthYearA11yLabel: 'MMMM yyyy',
      },
    }),
  ],
};
