import { buscarReadequacoesManuais } from "../domain/edicao-manual.js";
self.onmessage = (event) => {
  try {
    self.postMessage({
      plano: buscarReadequacoesManuais(event.data.config, {
        onProgresso: (progresso) => self.postMessage({ progresso }),
      }),
    });
  } catch (error) {
    self.postMessage({ erro: error.message });
  }
};
