import { buscarAjustesCobertura } from "../domain/ajustes-cobertura.js";
self.onmessage = (event) => {
  try {
    self.postMessage({
      plano: buscarAjustesCobertura(event.data.config, {
        onProgresso: (progresso) => self.postMessage({ progresso }),
      }),
    });
  } catch (error) {
    self.postMessage({ erro: error.message });
  }
};
