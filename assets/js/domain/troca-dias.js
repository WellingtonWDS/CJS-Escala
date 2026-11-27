import { aplicarHorarioManual, validarHorarioManual } from "./horario-manual.js";
import { validarFuncionamentoEmpresa } from "./funcionamento-empresa.js";
import { configDaEscala } from "./contexto-escala.js";
import {
  atualizarRelatoriosAjustes,
  assinaturaAjustes,
  substituirDiasDaEscala,
} from "./ajustes-cobertura.js";
import { minToTime, fmtHoras } from "./datas-horas.js";
import { funcionamentoDoDia, planejamento5x2 } from "./janelas-planejamento.js";
import { limiteHorasDia } from "./distribuicao-horas.js";
import { configDoPerfil } from "./perfil-dominio.js";
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const trabalho = (d) => ["T", "FE"].includes(d.status);
const horario = (d) => ({
  entrada: minToTime(d.entradaMin),
  saida: minToTime(d.saidaMin),
  intInicio:
    d.intervaloInicioMin == null ? "" : minToTime(d.intervaloInicioMin),
  intFim: d.intervaloFimMin == null ? "" : minToTime(d.intervaloFimMin),
});
const arred5 = (m) => Math.round(m / 5) * 5;
const texto = (h) => `${minToTime(h.entrada)}–${minToTime(h.saida)}${h.intInicio < h.intFim && h.intFim < h.saida ? `, intervalo ${minToTime(h.intInicio)}–${minToTime(h.intFim)}` : ", sem intervalo"}`;
/** Encaixa um horário de trabalho no funcionamento do dia de destino. Entrada e saída
 * ficam dentro do período aberto; o intervalo segue o mínimo da CLT (art. 71) para a
 * nova duração: até 4h sem intervalo, até 6h com 15 min e acima disso ao menos 1h.
 * Preserva o início do intervalo original quando ele cabe no novo período. */
export function ajustarAoFuncionamento(horarioOriginal, janela, { maxTrabalho = Infinity } = {}) {
  const h = validarHorarioManual(horarioOriginal);
  const entrada = Math.max(h.entrada, janela.entrada);
  let saida = Math.min(h.saida, janela.saida);
  if (saida - entrada < 60) return null;
  const original = h.intFim > h.intInicio && h.intFim < h.saida ? h.intFim - h.intInicio : 0;
  // Intervalo pelo trabalho do dia (art. 71 da CLT): até 4h sem intervalo, até 6h com
  // 15 min, acima de 6h ao menos 1h (mantém o intervalo original maior, se couber).
  const P = saida - entrada;
  const longa = original >= 60 && P - original > 360 ? original : 60;
  const possivel = P <= 240 ? P : P <= 255 ? 240 : P <= 375 ? P - 15 : P <= 360 + longa ? 360 : P - longa;
  // Também respeita o limite de horas do dia (janela configurada para o colaborador).
  const trabalhoDia = Math.min(possivel, maxTrabalho);
  if (trabalhoDia < 60) return null;
  const pausa = trabalhoDia <= 240 ? 0 : trabalhoDia <= 360 ? 15 : longa;
  saida = entrada + trabalhoDia + pausa;
  let intInicio = "", intFim = "";
  if (pausa) {
    let inicio = original && h.intInicio > entrada && h.intInicio + pausa < saida ? h.intInicio : arred5(entrada + (saida - entrada - pausa) / 2);
    inicio = Math.min(Math.max(inicio, entrada + 5), saida - pausa - 5);
    intInicio = minToTime(inicio); intFim = minToTime(inicio + pausa);
  }
  return { entrada: minToTime(entrada), saida: minToTime(saida), intInicio, intFim };
}

export function trocarDias(state, colaboradorId, dataA, dataB, { ajustarFuncionamento = false } = {}) {
  if (dataA === dataB) throw Error("Escolha outro dia para realizar a troca.");
  const escala = structuredClone(state.escalaGerada),
    trabalhoState = { ...state, escalaGerada: escala },
    r = escala?.resultado.find((r) => r.colaborador.id === colaboradorId);
  const a = r?.dias.find((d) => d.data === dataA),
    b = r?.dias.find((d) => d.data === dataB);
  if (!a || !b || ![a, b].every((d) => ["T", "FE", "F"].includes(d.status)))
    throw Error(
      "Troque dias de trabalho ou folga. Ausências e dias especiais exigem edição própria.",
    );
  if (a.weekday === b.weekday && state.modeloEscala === "fixa")
    throw Error("Escolha outro dia da semana.");
  const config = configDaEscala(trabalhoState);
  // Confira os dois destinos antes de apurar qualquer regra legal da troca. Quando o
  // horário não cabe no funcionamento do destino (ex.: sábado 08h–14h), a troca pode
  // ser feita com o horário encaixado nesse período, após a confirmação do usuário.
  const horarios = new Map([[a, trabalho(b) ? horario(b) : null], [b, trabalho(a) ? horario(a) : null]]);
  const ajustes = [];
  for (const [de, para] of [[a, b], [b, a]]) if (trabalho(de)) {
    validarFuncionamentoEmpresa(config, para);
    try {
      validarFuncionamentoEmpresa(config, para, validarHorarioManual(horario(de)));
    } catch (erro) {
      const janela = funcionamentoDoDia(config, para.weekday);
      // Mesmo limite diário da validação: na proposta 5×2 vale só o funcionamento.
      const perfil = configDoPerfil(config, r.colaborador) || config;
      const limite = planejamento5x2(perfil) ? Infinity : limiteHorasDia(perfil, para.weekday);
      const novo = janela && ajustarAoFuncionamento(horario(de), janela, { maxTrabalho: Number.isFinite(limite) && limite > 0 ? Math.round(limite * 60) : Infinity });
      if (!novo) throw erro;
      const antes = validarHorarioManual(horario(de)), depois = validarHorarioManual(novo);
      ajustes.push({
        dia: DIAS[para.weekday], data: para.data,
        funcionamento: `${minToTime(janela.entrada)}–${minToTime(janela.saida)}`,
        antes: texto(antes), depois: texto(depois),
        horasAntes: fmtHoras((antes.saida - antes.entrada - (antes.intFim - antes.intInicio)) / 60),
        horasDepois: fmtHoras((depois.saida - depois.entrada - (depois.intFim - depois.intInicio)) / 60),
      });
      horarios.set(para, novo);
    }
  }
  if (ajustes.length && !ajustarFuncionamento)
    throw Object.assign(Error(`O horário de trabalho não cabe no funcionamento de ${ajustes.map((x) => `${x.dia} (${x.funcionamento})`).join(" e ")}.`), { ajustesFuncionamento: ajustes });
  const antes = atualizarRelatoriosAjustes(config, escala);
  const erros = new Set(
    antes.validacoes.flatMap((v) =>
      v.issues
        .filter((i) => i.severidade === "erro")
        .map((i) => `${v.colaborador.id}|${i.tipo}|${i.data}|${i.mensagem}`),
    ),
  );
  let nova = aplicarHorarioManual(
    trabalhoState,
    colaboradorId,
    dataA,
    trabalho(b) ? (a.feriado ? "FE" : "T") : "F",
    horarios.get(a),
  );
  nova = aplicarHorarioManual(
    { ...state, escalaGerada: nova },
    colaboradorId,
    dataB,
    trabalho(a) ? (b.feriado ? "FE" : "T") : "F",
    horarios.get(b),
  );
  const novosErros = nova.validacoes.flatMap((v) =>
    v.issues.filter(
      (i) =>
        i.severidade === "erro" &&
        !erros.has(`${v.colaborador.id}|${i.tipo}|${i.data}|${i.mensagem}`),
    ),
  );
  if (novosErros.length)
    throw Error(
      `A troca não pode ser aplicada: ${novosErros
        .slice(0, 3)
        .map((i) => i.mensagem)
        .join("\n")}`,
    );
  const alteracoes = [];
  for (let ri = 0; ri < escala.resultado.length; ri++)
    for (const d of escala.resultado[ri].dias) {
      const depois = nova.resultado[ri].dias.find((x) => x.data === d.data);
      if (JSON.stringify(d) !== JSON.stringify(depois))
        alteracoes.push({
          colaboradorId: escala.resultado[ri].colaborador.id,
          data: d.data,
          antes: structuredClone(d),
          depois: structuredClone(depois),
        });
    }
  // Include boundary/context days when swapping a recurring fixed pattern.
  if (state.modeloEscala === "fixa")
    for (const campo of ["diasContexto", "diasApuracao"])
      for (const d of r[campo] || []) {
        if (alteracoes.some((x) => x.data === d.data)) continue;
        const depois = nova.resultado
          .find((x) => x.colaborador.id === colaboradorId)
          [campo]?.find((x) => x.data === d.data);
        if (depois && JSON.stringify(d) !== JSON.stringify(depois))
          alteracoes.push({
            colaboradorId,
            data: d.data,
            antes: structuredClone(d),
            depois: structuredClone(depois),
          });
      }
  delete nova.ultimaEdicaoManual;
  if (ajustes.length) nova.ajustesFuncionamento = ajustes;
  nova.ultimaTrocaManual = {
    alteracoes,
    assinatura: assinaturaAjustes(config, nova),
  };
  return nova;
}
export function desfazerTroca(state) {
  const config = configDaEscala(state),
    registro = state.escalaGerada?.ultimaTrocaManual;
  if (
    !registro ||
    registro.assinatura !== assinaturaAjustes(config, state.escalaGerada)
  )
    throw Error(
      "A escala mudou depois da troca. Não é possível desfazê-la automaticamente.",
    );
  const nova = substituirDiasDaEscala(
    state.escalaGerada,
    registro.alteracoes.map((a) => ({ ...a, depois: a.antes })),
  );
  delete nova.ultimaTrocaManual;
  return atualizarRelatoriosAjustes(config, nova);
}
