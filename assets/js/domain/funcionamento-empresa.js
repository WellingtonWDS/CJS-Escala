import { DIAS_SEMANA } from "../config/regras-jornada.js";
import { normalizarJornada, jornadaValidaEstrutural, horarioComDia } from "./datas-horas.js";
import { createJornada } from "./jornada.js";
import { funcionamentoDoDia } from "./janelas-planejamento.js";

/** Usa a configuração global, antes de aplicar horários/perfis individuais.
 * A pausa é uma referência de intervalo, não um fechamento da empresa.
 * entrada/saída incluem a virada de dia, sem comparar apenas a duração líquida. */
export function validarFuncionamentoEmpresa(config, dia, horario = null) {
  const nome = DIAS_SEMANA[dia.weekday];
  if (!config.diasTrabalho.includes(dia.weekday))
    throw Error(`A empresa não funciona neste dia (${nome}). Não é possível transferir ou cadastrar trabalho nele. Para trabalhar neste dia, revise os dias de funcionamento na aba Jornada.`);
  if (!horario) return;
  const fonte = createJornada(config).obterJornadaDoDia(dia.weekday);
  const janela = funcionamentoDoDia(config, dia.weekday);
  if (!janela || !jornadaValidaEstrutural(fonte))
    throw Error(`Revise o horário de funcionamento da empresa (${nome}) na aba Jornada antes de alterar o trabalho neste dia.`);
  if (horario.entrada < janela.entrada || horario.saida > janela.saida)
    throw Error(`O horário de trabalho ultrapassa o funcionamento da empresa (${nome}): ${horarioComDia(janela.entrada)}–${horarioComDia(janela.saida)}. Ajuste entrada e saída para esse período ou revise a aba Jornada. A alteração não foi aplicada.`);
}

export function trabalhoDentroDoFuncionamento(config, dia) {
  if (!["T", "FE"].includes(dia.status)) return true;
  if (!Number.isFinite(dia.entradaMin) || !Number.isFinite(dia.saidaMin)) return false;
  try {
    validarFuncionamentoEmpresa(config, dia, { entrada: dia.entradaMin, saida: dia.saidaMin });
    return true;
  } catch { return false; }
}
