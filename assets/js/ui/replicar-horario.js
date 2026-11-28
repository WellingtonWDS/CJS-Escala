/* Depois de editar o horário de um dia na grade: pergunta se o mesmo horário deve ser
 * replicado para outros dias da semana (só dias de trabalho; folgas não mudam). */
import { closeDialog } from "./motion.js";
import { aplicarHorarioManual } from "../domain/horario-manual.js";
import { dateFromKey, getMonday, formatDateBR } from "../domain/datas-horas.js";

const ORDEM = [1, 2, 3, 4, 5, 6, 0];
const NOMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const trabalha = (d) => ["T", "FE"].includes(d.status);
const assinatura = (d) => [d.entradaMin, d.saidaMin, d.intervaloInicioMin ?? "", d.intervaloFimMin ?? ""].join("|");
const semanaDe = (data) => getMonday(dateFromKey(data)).getTime();

/** Dias de trabalho de destino conforme os dias da semana e o alcance escolhidos. */
export function destinosReplicacao(state, colaboradorId, data, weekdays, escopo) {
  const r = state.escalaGerada.resultado.find((x) => x.colaborador.id === colaboradorId);
  const fixa = state.modeloEscala === "fixa";
  const mes = data.slice(0, 7);
  // No mês inteiro, o próprio dia da semana editado também vale nas outras semanas.
  const editado = r.dias.find((d) => d.data === data)?.weekday;
  const dias = new Set([...weekdays, ...(!fixa && escopo === "mes" ? [editado] : [])]);
  const candidatos = r.dias.filter((d) => d.data !== data && dias.has(d.weekday) && trabalha(d) &&
    (fixa || (escopo === "semana" ? semanaDe(d.data) === semanaDe(data) : d.data.slice(0, 7) === mes)));
  // Na escala fixa, um dia por dia da semana basta: a edição vale para todas as semanas.
  return fixa ? [...new Map(candidatos.map((d) => [d.weekday, d])).values()] : candidatos;
}

/** Aplica o horário aos destinos, um a um; dias que não aceitam o horário ficam de fora. */
export function replicarHorario(state, colaboradorId, destinos, status, jornada) {
  let escala = state.escalaGerada;
  const aplicados = [], ignorados = [];
  for (const d of destinos) {
    try {
      escala = aplicarHorarioManual({ ...state, escalaGerada: escala }, colaboradorId, d.data, d.status === "FE" ? "FE" : status === "FE" && !d.feriado ? "T" : d.status, jornada);
      aplicados.push(d);
    } catch (e) {
      ignorados.push({ dia: d, motivo: e.message.split("\n")[0] });
    }
  }
  return { escala, aplicados, ignorados };
}

/** Diálogo: dias da semana (marcados os que tinham o mesmo horário) e alcance. */
export function perguntarReplicacao(env, state, colaboradorId, diaEditado, antes) {
  const { document } = env;
  const r = state.escalaGerada.resultado.find((x) => x.colaborador.id === colaboradorId);
  const fixa = state.modeloEscala === "fixa";
  const mes = diaEditado.data.slice(0, 7);
  const disponiveis = ORDEM.filter((w) => w !== diaEditado.weekday &&
    r.dias.some((d) => d.weekday === w && trabalha(d) && (fixa || d.data.slice(0, 7) === mes)));
  const outrasSemanas = !fixa && r.dias.some((d) => d.data !== diaEditado.data && d.weekday === diaEditado.weekday && trabalha(d) && d.data.slice(0, 7) === mes);
  if (!disponiveis.length && !outrasSemanas) return Promise.resolve(null);
  const mesmoHorario = new Set(r.dias.filter((d) => trabalha(d) && assinatura(d) === assinatura(antes)).map((d) => d.weekday));
  return new Promise((resolve) => {
    const anterior = document.activeElement;
    const dialog = document.createElement("dialog");
    dialog.className = "app-dialog replicar-dialog no-print";
    dialog.dataset.replicarHorario = "";
    dialog.dataset.appDialog = "replicar";
    dialog.setAttribute("aria-labelledby", "replicar-titulo");
    dialog.innerHTML = `<form method="dialog"><header><span class="app-dialog-symbol" aria-hidden="true">⇄</span><h2 id="replicar-titulo">Replicar este horário?</h2></header>
      <p>O horário de ${fixa ? NOMES[diaEditado.weekday].toLowerCase() : `${NOMES[diaEditado.weekday].toLowerCase()}, ${formatDateBR(dateFromKey(diaEditado.data))}`} foi alterado. Escolha outros dias de trabalho de ${r.colaborador.nome} que devem receber o mesmo horário e intervalo. Folgas não mudam.</p>
      <fieldset class="replicar-dias"><legend>Dias da semana</legend>${disponiveis.map((w) => `<label><input type="checkbox" data-replicar-dia="${w}"${mesmoHorario.has(w) ? " checked" : ""}> ${NOMES[w]}</label>`).join("")}</fieldset>
      ${fixa ? "" : `<fieldset class="replicar-escopo"><legend>Alcance</legend><label><input type="radio" name="replicar-escopo" value="mes" checked> Em todas as semanas do mês (inclui as outras ${NOMES[diaEditado.weekday].toLowerCase()}s)</label><label><input type="radio" name="replicar-escopo" value="semana"> Só nesta semana</label></fieldset>`}
      <p class="replicar-nota">Já marcados: dias que tinham o mesmo horário antes da alteração.</p>
      <div class="app-dialog-actions"><button type="button" data-replicar-nao>Não replicar</button><button type="submit" data-dialog-accept data-replicar-sim>Replicar</button></div></form>`;
    let terminou = false;
    const fim = async (valor) => {
      if (terminou) return;
      terminou = true;
      await closeDialog(dialog, { remove: true });
      if (anterior?.isConnected) anterior.focus({ preventScroll: true });
      resolve(valor);
    };
    dialog.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const weekdays = [...dialog.querySelectorAll("[data-replicar-dia]:checked")].map((x) => Number(x.dataset.replicarDia));
      const escopo = fixa ? "mes" : dialog.querySelector('[name="replicar-escopo"]:checked').value;
      fim(weekdays.length || escopo === "mes" ? { weekdays, escopo } : null);
    });
    dialog.querySelector("[data-replicar-nao]").addEventListener("click", () => fim(null));
    dialog.addEventListener("cancel", (e) => { e.preventDefault(); fim(null); });
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector("[data-replicar-sim]").focus({ preventScroll: true });
  });
}
