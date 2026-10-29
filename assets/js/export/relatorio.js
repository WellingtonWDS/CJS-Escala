import { configDaEscala } from "../domain/contexto-escala.js";
import { diasDoModelo, ocorrenciasDoModelo } from "../domain/modelo-escala.js";
import { createDomain } from "../domain/index.js";
import { apurarSemana } from "../domain/resumo-semanal.js";
import { DIAS_SEMANA, MESES } from "../config/regras-jornada.js";
import {
  fmtHoras,
  horarioComDia,
  dateFromKey,
  formatDateBR,
} from "../domain/datas-horas.js";
import { funcaoDoDia } from "../domain/funcoes.js";
export const nomeArquivo = (v) =>
  String(v || "sem-nome")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .slice(0, 90);
const status = {
  T: "Trabalho",
  FE: "Trabalho em feriado",
  F: "Folga",
  FC: "Compensado",
  I: "Indisponível",
  VA: "Férias",
  AF: "Afastamento",
  NC: "Não contratado",
};
export function prepararRelatorio(
  state,
  { proposta = false, empresa = "" } = {},
) {
  if (proposta && (!state.conversao || state.conversao.desatualizada))
    throw Error("Gere uma proposta atualizada antes de exportar.");
  const config = configDaEscala(
    structuredClone(
      proposta
        ? state.conversao.proposta.config
        : Object.fromEntries(
            Object.entries(state).filter(([k]) => k !== "conversao"),
          ),
    ),
  );
  if (!config.escalaGerada?.resultado?.length)
    throw Error("Gere a escala antes de exportar.");
  const fixa = config.modeloEscala === "fixa",
    domain = createDomain(config);
  const pessoas = config.escalaGerada.resultado.map((r) => {
    const dias = fixa
      ? diasDoModelo(config, r.dias)
      : r.dias.filter(
          (d) =>
            Number(d.data.slice(0, 4)) === config.ano &&
            Number(d.data.slice(5, 7)) === config.mes + 1,
        );
    const grupos = new Map();
    for (const d of fixa
      ? dias
      : r.diasApuracao?.length
        ? r.diasApuracao
        : r.dias) {
      const dt = dateFromKey(d.data);
      dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
      const k = fixa ? "Padrão semanal" : formatDateBR(dt);
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(d);
    }
    const semanas = [...grupos]
      .filter(([, ds]) => ds.some((d) => dias.some((x) => x.data === d.data)))
      .map(([semana, ds]) => {
        const a = apurarSemana(r.colaborador, ds, config);
        return [
          semana,
          fmtHoras(a.trabalhadas),
          fmtHoras(a.abonadas || 0),
          fmtHoras((a.creditosIntervalo || 0) + (a.creditosNoturnos || 0)),
          fmtHoras(a.computadas),
          fmtHoras(a.alvo),
          ({ parcial: "Parcial", abaixo: "Abaixo", acima: "Acima", ok: "Horas OK" })[a.estado] || "Parcial",
        ];
      });
    return {
      id: r.colaborador.id,
      nome: r.colaborador.nome,
      cargo: r.colaborador.cargo || "",
      semanas,
      linhas: dias.map((d) => {
        const t = ["T", "FE"].includes(d.status);
        return [
          fixa
            ? DIAS_SEMANA[d.weekday]
            : `${formatDateBR(dateFromKey(d.data))} - ${DIAS_SEMANA[d.weekday]}`,
          d.sabadoCompensado
            ? "Compensado"
            : d.restricao?.descricao ||
              (d.feriado && !t
                ? `Folga - ${d.feriado.nome}`
                : status[d.status] || d.status),
          t ? horarioComDia(d.entradaMin) : "—",
          t && d.intervaloInicioMin != null
            ? `${horarioComDia(d.intervaloInicioMin)} a ${horarioComDia(d.intervaloFimMin)}`
            : t
              ? "Sem intervalo"
              : "—",
          t ? horarioComDia(d.saidaMin) : "—",
          fmtHoras(d.horas),
          funcaoDoDia(r.colaborador, d) || r.colaborador.cargo || "—",
        ];
      }),
      ocorrencias: ocorrenciasDoModelo(
        config,
        domain.validarLegal(
          r.colaborador,
          r.dias,
          r.diasContexto,
          r.diasApuracao,
        ),
      ).map((i) => ({
        ...i,
        mensagem: fixa
          ? i.mensagem.replace(
              /\b\d{4}-\d{2}-\d{2}\b/g,
              (v) => DIAS_SEMANA[dateFromKey(v).getDay()],
            )
          : i.mensagem,
      })),
    };
  });
  return {
    config,
    pessoas,
    fixa,
    empresa:
      empresa ||
      [config.empresaDominio?.nome, config.empresaDominio?.cnpj]
        .filter(Boolean)
        .join(" • ") ||
      "Empresa não informada",
    tipo: proposta ? "Proposta 5x2" : "Escala atual",
    periodo: fixa
      ? `Padrão semanal fixo • Referência jurídica: ${config.dataReferenciaFixa}`
      : `${MESES[config.mes]} / ${config.ano}`,
  };
}
