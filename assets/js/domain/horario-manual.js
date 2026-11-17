import { alocacoesDoDia } from "./funcoes.js";
import { timeToMin } from "./datas-horas.js";
import { configDaEscala } from "./contexto-escala.js";
import { DIAS_SEMANA } from "../config/regras-jornada.js";
import { escalaFixa } from "./modelo-escala.js";
import { apurarComputoCCT } from "./computo-cct.js";
import { configDoPerfil } from "./perfil-dominio.js";
import { violacoesDia } from "./restricoes.js";
import { assinaturaAjustes, substituirDiasDaEscala, atualizarRelatoriosAjustes } from "./ajustes-cobertura.js";

export function validarHorarioManual(j) {
  if (!j?.entrada || !j?.saida) throw Error("Informe os horários de entrada e saída.");
  if (!!j.intInicio !== !!j.intFim) throw Error("Preencha início e fim do intervalo ou deixe os dois vazios.");
  const entrada = timeToMin(j.entrada);
  let saida = timeToMin(j.saida);
  if (!Number.isFinite(entrada) || !Number.isFinite(saida) || entrada === saida)
    throw Error("Informe horários válidos e uma saída diferente da entrada.");
  if (saida < entrada) saida += 1440;
  let intInicio = saida, intFim = saida;
  if (j.intInicio) {
    intInicio = timeToMin(j.intInicio); intFim = timeToMin(j.intFim);
    if (intInicio < entrada) intInicio += 1440;
    if (intFim < entrada) intFim += 1440;
    if (intFim <= intInicio) intFim += 1440;
    if (![intInicio, intFim].every(Number.isFinite) ||
        !(entrada < intInicio && intInicio < intFim && intFim < saida))
      throw Error("O intervalo precisa começar e terminar dentro da jornada, na ordem correta.");
  }
  return { entrada, saida, intInicio, intFim, intervalo: intFim - intInicio };
}

export function aplicarHorarioManual(state, colaboradorId, data, status, jornada) {
  const config = configDaEscala(state), fixa = escalaFixa(config), escala = state.escalaGerada;
  const pessoa = escala?.resultado.find((r) => r.colaborador.id === colaboradorId);
  const original = pessoa?.dias.find((d) => d.data === data);
  if (!original) throw Error("Não foi possível localizar o dia editado.");
  if (!["T", "F", "FE", "FC"].includes(status) || (fixa && status === "FE"))
    throw Error("Status inválido para este modelo de escala.");
  // O funcionamento da empresa é uma restrição global. O perfil importado do
  // colaborador pode ter outros dias, mas não autoriza abrir um dia fechado.
  // Folgas continuam permitidas para corrigir resultados antigos.
  if (["T", "FE"].includes(status) && !config.diasTrabalho.includes(original.weekday))
    throw Error(`A empresa não funciona neste dia (${DIAS_SEMANA[original.weekday]}). Não é possível transferir ou cadastrar trabalho nele. Para trabalhar neste dia, revise os dias de funcionamento na aba Jornada.`);
  const proprio = configDoPerfil(config, pessoa.colaborador) || config;
  const normal = ["T", "FE"].includes(status) ? validarHorarioManual(jornada) : null;
  const dias = fixa ? [...new Map([
    ...(pessoa.diasContexto || []), ...(pessoa.diasApuracao || []), ...pessoa.dias,
  ].filter((d) => d.weekday === original.weekday).map((d) => [d.data, d])).values()] : [original];
  const alteracoes = dias.map((dia) => {
    if (dia.status === "NC" || (dia.restricao && dia.restricao.tipo !== "horario"))
      throw Error("Este dia possui uma restrição. Revise o cadastro do colaborador antes de alterá-lo.");
    const depois = { ...dia, status, horas: normal ? (normal.saida - normal.entrada - normal.intervalo) / 60 : 0,
      entradaMin: normal?.entrada ?? dia.entradaMin,
      saidaMin: normal?.saida ?? dia.entradaMin,
      intervaloMin: normal?.intervalo || 0,
      intervaloInicioMin: normal?.intervalo ? normal.intInicio : null,
      intervaloFimMin: normal?.intervalo ? normal.intFim : null,
      ajusteManual: true,
      ...(dia.feriado ? { feriado: { ...dia.feriado, trabalhado: !!normal } } : {}),
      ...(normal ? { jornadaAplicada: { ...jornada } } : {}),
    };
    for (const key of ["intervaloSugerido", "ajusteAutomatico", "sabadoCompensado", "reposicaoSabado", "repousoSeguranca"])
      delete depois[key];
    if (normal && dia.alocacoesFuncao?.length) depois.alocacoesFuncao = alocacoesDoDia(pessoa.colaborador,depois);
    else delete depois.alocacoesFuncao;
    Object.assign(depois, apurarComputoCCT(proprio, depois));
    const erros = violacoesDia(pessoa.colaborador, depois);
    if (erros.length) throw Error(erros.join("\n"));
    return { colaboradorId, data: dia.data, antes: structuredClone(dia), depois };
  });
  const nova = atualizarRelatoriosAjustes(config, substituirDiasDaEscala(escala, alteracoes));
  nova.ultimaEdicaoManual = { colaboradorId, data, antes: structuredClone(original),
    ...(fixa ? { recorrente: true, alteracoes } : {}), assinatura: assinaturaAjustes(config, nova) };
  return nova;
}

export function desfazerHorarioRecorrente(state) {
  const registro = state.escalaGerada?.ultimaEdicaoManual;
  if (!registro?.recorrente || registro.assinatura !== assinaturaAjustes(state))
    throw Error("A escala mudou. Não é possível desfazer esta edição.");
  const nova = substituirDiasDaEscala(state.escalaGerada, registro.alteracoes.map((a) => ({ ...a, depois: a.antes })));
  delete nova.ultimaEdicaoManual;
  return atualizarRelatoriosAjustes(state, nova);
}
