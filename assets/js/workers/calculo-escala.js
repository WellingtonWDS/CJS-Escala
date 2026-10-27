import { createDomain } from "../domain/index.js";
import { converterEscala } from "../domain/conversao.js";
self.onmessage = ({ data }) => {
  try {
    if (!["gerar", "converter"].includes(data.operacao))
      throw new Error("Operação de cálculo inválida.");
    const resultado = data.operacao === "converter"
      ? converterEscala(data.config, data.opcoes)
      : createDomain(data.config).gerarDadosEscala();
    self.postMessage({ resultado });
  } catch (error) {
    self.postMessage({ erro: error.message });
  }
};
