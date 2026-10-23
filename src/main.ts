import { bootstrapApplication } from '@angular/platform-browser';
import { configuracaoDoApp } from './app/app.config';
import { App } from './app/app';
import { carregarConfiguracao } from './app/nucleo/configuracao';

// A configuração do ambiente (emissor OIDC, fundo do mapa) chega antes de o Angular iniciar.
carregarConfiguracao()
  .then((configuracao) => bootstrapApplication(App, configuracaoDoApp(configuracao)))
  .catch((err) => console.error(err));
