import { apurarSemana } from "./resumo-semanal.js";
import { limiteDiario } from "./ec141.js";
import { configDoPerfil } from "./perfil-dominio.js";
import { diasDoModelo, escalaFixa } from "./modelo-escala.js";
import { dateFromKey, weekKey } from "./datas-horas.js";

/** Diagnóstico do rateio, calculado a partir do resultado vigente (inclusive
 * edições). A sugestão de duração não amplia uma janela nem reduz uma pausa. */
export function analisarRateioSemanal(config, resultado) {
  if (!config.aplicarProposta5x2 && config.tipoEscala !== "5x2") return [];
  return resultado.flatMap((r) => {
    const individual = configDoPerfil(config, r.colaborador) || config;
    const grupos = new Map();
    for (const d of escalaFixa(config) ? diasDoModelo(config, r.dias) : r.dias) {
      const chave = weekKey(dateFromKey(d.data));
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(d);
    }
    const semanas = [];
    for (const dias of grupos.values()) {
      const resumo = apurarSemana(r.colaborador, dias, individual);
      if (!resumo.completa || !Number.isFinite(resumo.alvo) || resumo.alvo <= 0) continue;
      // Excesso é tratado pela validação da jornada, não como rateio concluído.
      if (resumo.estado === "acima") continue;
      const trabalho = dias.filter((d) => ["T", "FE"].includes(d.status));
      const faltantesMin = Math.max(0, Math.round((resumo.alvo - resumo.computadas) * 60));
      // Contratos de 40h ou menos já completos não precisam de recomendação.
      if (!faltantesMin && resumo.alvo <= 40) continue;
      if (!trabalho.length) continue;
      const alvoMin = Math.round(resumo.alvo * 60);
      const creditosMin = Math.round((resumo.abonadas + resumo.creditosIntervalo + resumo.creditosNoturnos) * 60);
      const trabalhoAlvoMin = Math.max(0, alvoMin - creditosMin);
      const horasPorDiaMin = Math.floor(trabalhoAlvoMin / trabalho.length);
      const horasPorDiaMax = Math.ceil(trabalhoAlvoMin / trabalho.length);
      const capacidadeLegalMin = trabalho.reduce((s, d) => s + Math.floor(limiteDiario(individual, d.data) * 60 + 1e-7), 0);
      const viavelLegalmente = capacidadeLegalMin >= trabalhoAlvoMin;
      semanas.push({
        inicio: dias.map((d) => d.data).sort()[0],
        alvoMin,
        computadosMin: Math.round(resumo.computadas * 60),
        faltantesMin,
        diasTrabalho: trabalho.length,
        horasPorDiaMin,
        horasPorDiaMax,
        acrescimoMedioMin: Math.ceil(faltantesMin / trabalho.length),
        viavelLegalmente,
        motivo: !faltantesMin ? "aplicado" : !viavelLegalmente ? "fundamento_coletivo" : trabalho.length < 5 ? "disponibilidade" : "janela",
        aplicado: faltantesMin === 0,
        // Horas trabalhadas e créditos ficam separados: um feriado abonado não
        // vira minutos a recuperar e férias não são redistribuídas como trabalho.
        creditosMin,
      });
    }
    return semanas.length ? [{ colaboradorId: r.colaborador.id, nome: r.colaborador.nome, semanas }] : [];
  });
}
