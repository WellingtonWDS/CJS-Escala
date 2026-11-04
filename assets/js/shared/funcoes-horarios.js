import { alocacoesDoDia, funcaoDoDia } from "../domain/funcoes.js";
import { horarioComDia } from "../domain/datas-horas.js";
export function descricaoFuncoes(c,d) {
  return d.alocacoesFuncao?.length
    ? alocacoesDoDia(c,d).map(a=>`${horarioComDia(a.inicioMin)}–${horarioComDia(a.fimMin)}: ${a.funcao}`).join(" · ")
    : funcaoDoDia(c,d);
}
