import { analisarCobertura } from "./cobertura.js";
import { createJornada } from "./jornada.js";
import { createFeriados } from "./feriados.js";
import { createValidacao } from "./validar-escala.js";
import { createGerador } from "./gerar-escala.js";
export function createDomain(state) {
  const jornada = createJornada(state);
  const feriados = createFeriados(state);
  const validacao = createValidacao(state, jornada, feriados);
  const gerador = createGerador(state, jornada, feriados, validacao);
  return {
    ...jornada,
    ...feriados,
    ...validacao,
    ...gerador,
    analisarCobertura: (resultado) => analisarCobertura(state, resultado),
  };
}
