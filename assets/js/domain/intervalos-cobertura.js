import { funcaoDoDia } from "./funcoes.js";
import { analisarCobertura, normalizarFuncao } from "./cobertura.js";
import { minToTime } from "./datas-horas.js";
import { violacoesDia } from "./restricoes.js";

export function* alternativasIntervalo(c, d) {
  if (
    !["T", "FE"].includes(d.status) ||
    d.ajusteManual ||
    d.restricao ||
    d.creditoIntervaloCCT ||
    d.creditoNoturnoCCT ||
    !Number.isFinite(d.intervaloMin) ||
    d.intervaloMin <= 0 ||
    violacoesDia(c, d).length
  )
    return;
  const inicio = Math.max(d.entradaMin + 60, d.saidaMin - d.intervaloMin - 360),
    fim = Math.min(d.entradaMin + 360, d.saidaMin - d.intervaloMin - 60);
  for (let pausa = Math.ceil(inicio / 15) * 15; pausa <= fim; pausa += 15) {
    if (pausa === d.intervaloInicioMin) continue;
    yield {
      ...d,
      intervaloInicioMin: pausa,
      intervaloFimMin: pausa + d.intervaloMin,
      intervaloSugerido: true,
      jornadaAplicada: {
        entrada: minToTime(d.entradaMin),
        intInicio: minToTime(pausa),
        intFim: minToTime(pausa + d.intervaloMin),
        saida: minToTime(d.saidaMin),
      },
    };
  }
}
const faltas = (rel) =>
  rel.lacunas.reduce((s, l) => s + (l.fimMin - l.inicioMin) * l.faltantes, 0);
export function coberturaSemPiora(antes, depois) {
  return depois.lacunas.every((novo) => {
    let cursor = novo.inicioMin;
    for (const anterior of antes.lacunas
      .filter(
        (a) =>
          a.data === novo.data &&
          a.funcao === novo.funcao &&
          a.fimMin > novo.inicioMin &&
          a.inicioMin < novo.fimMin,
      )
      .sort((a, b) => a.inicioMin - b.inicioMin)) {
      if (anterior.inicioMin > cursor || anterior.faltantes < novo.faltantes)
        return false;
      cursor = Math.max(cursor, anterior.fimMin);
      if (cursor >= novo.fimMin) return true;
    }
    return cursor >= novo.fimMin;
  });
}
function substituir(escala, id, data, novo, fixo = false) {
  return {
    ...escala,
    resultado: escala.resultado.map((r) =>
      r.colaborador.id !== id
        ? r
        : {
            ...r,
            ...Object.fromEntries(
              ["dias", "diasContexto", "diasApuracao"]
                .filter((k) => r[k])
                .map((k) => [
                  k,
                  r[k].map((d) =>
                    d.data === data ? structuredClone(novo) : fixo && d.weekday === novo.weekday
                      ? { ...d, intervaloInicioMin: novo.intervaloInicioMin,
                          intervaloFimMin: novo.intervaloFimMin,
                          intervaloSugerido: true, jornadaAplicada: structuredClone(novo.jornadaAplicada) }
                      : d,
                  ),
                ]),
            ),
          },
    ),
  };
}
/** Busca limitada: mantém duração, entrada/saída, horas, função e dias. */
export function sugerirIntervalosCobertura(config, original, limite = 1200) {
  if (!config.coberturaAtiva || !config.demandasCobertura?.length)
    return original;
  let escala = original,
    rel = analisarCobertura(config, escala.resultado),
    tentativas = 0;
  if (rel.avisos.length || !rel.lacunas.length) return original;
  const alteracoes = [];
  for (const r of original.resultado) {
    if (
      r.colaborador.quadroDominio?.tipo === "ciclo" ||
      config.tipoEscala === "12x36"
    )
      continue;
    for (const dia of r.dias) {
      if (
        !rel.lacunas.some(
          (l) =>
            l.data === dia.data &&
            normalizarFuncao(l.funcao) ===
              normalizarFuncao(funcaoDoDia(r.colaborador, dia)),
        )
      )
        continue;
      let escolhido = null,
        melhor = rel;
      for (const novo of alternativasIntervalo(r.colaborador, dia)) {
        if (++tentativas > limite) break;
        const proposta = substituir(escala, r.colaborador.id, dia.data, novo, config.modeloEscala === "fixa"),
          cobertura = analisarCobertura(config, proposta.resultado);
        if (
          faltas(cobertura) < faltas(melhor) &&
          coberturaSemPiora(rel, cobertura)
        ) {
          escolhido = novo;
          melhor = cobertura;
        }
      }
      if (escolhido) {
        escala = substituir(escala, r.colaborador.id, dia.data, escolhido, config.modeloEscala === "fixa");
        alteracoes.push({
          colaboradorId: r.colaborador.id,
          data: dia.data,
          antes: [dia.intervaloInicioMin, dia.intervaloFimMin],
          depois: [escolhido.intervaloInicioMin, escolhido.intervaloFimMin],
        });
        rel = melhor;
      }
      if (tentativas >= limite) break;
    }
    if (tentativas >= limite) break;
  }
  return {
    ...escala,
    sugestoesIntervalos: alteracoes,
    limiteBuscaIntervalos: tentativas >= limite,
  };
}
