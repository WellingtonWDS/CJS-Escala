import { aplicarHorarioManual } from "./horario-manual.js";
import { configDaEscala } from "./contexto-escala.js";
import {
  atualizarRelatoriosAjustes,
  assinaturaAjustes,
  substituirDiasDaEscala,
} from "./ajustes-cobertura.js";
import { minToTime } from "./datas-horas.js";
const trabalho = (d) => ["T", "FE"].includes(d.status);
const horario = (d) => ({
  entrada: minToTime(d.entradaMin),
  saida: minToTime(d.saidaMin),
  intInicio:
    d.intervaloInicioMin == null ? "" : minToTime(d.intervaloInicioMin),
  intFim: d.intervaloFimMin == null ? "" : minToTime(d.intervaloFimMin),
});
export function trocarDias(state, colaboradorId, dataA, dataB) {
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
    trabalho(b) ? horario(b) : null,
  );
  nova = aplicarHorarioManual(
    { ...state, escalaGerada: nova },
    colaboradorId,
    dataB,
    trabalho(a) ? (b.feriado ? "FE" : "T") : "F",
    trabalho(a) ? horario(a) : null,
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
