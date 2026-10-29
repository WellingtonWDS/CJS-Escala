import { trocarDias, desfazerTroca } from "../domain/troca-dias.js";
import { assinaturaAjustes } from "../domain/ajustes-cobertura.js";
import { DIAS_SEMANA } from "../config/regras-jornada.js";
import { fmtHoras, formatDateBR, dateFromKey } from "../domain/datas-horas.js";
export function bindArrasteEscala({
  container,
  state,
  env,
  permitido,
  render,
  salvar,
  alterou,
}) {
  if (!env.document.createElement || !container.prepend) return;
  let origem = null,
    ocupado = false,
    selecionado = null;
  const buttons = [...container.querySelectorAll("[data-ri][data-di]")];
  const painel = env.document.createElement("div");
  painel.className = "troca-escala-acoes no-print";
  painel.innerHTML =
    '<span>Arraste um dia para outro dia do mesmo colaborador para trocar horários e folgas. No celular, use “Trocar dois dias”.</span><button type="button" data-troca-selecionar>Trocar dois dias</button>' +
    (state.escalaGerada.ultimaTrocaManual
      ? '<button type="button" data-troca-desfazer>Desfazer última troca</button>'
      : "");
  const topo=container.querySelector("[data-rolagem-topo]");
  if(topo)topo.before(painel);else container.append(painel);
  function destino(button) {
    const ri = Number(button.dataset.ri),
      di = Number(button.dataset.di);
    return {
      ri,
      di,
      d: state.escalaGerada.resultado[ri].dias[di],
      id: state.escalaGerada.resultado[ri].colaborador.id,
    };
  }
  async function trocar(a, b) {
    if (ocupado) return;
    ocupado = true;
    try {
      if (!permitido())
        throw Error(
          "A proposta está desatualizada. Gere novamente antes de editar.",
        );
      if (a.id !== b.id) throw Error("Escolha dois dias do mesmo colaborador.");
      const anterior = state.escalaGerada,
        assinatura = assinaturaAjustes(state);
      const nova = trocarDias(state, a.id, a.d.data, b.d.data);
      const rel = nova.coberturaOperacional;
      const faltas = (r) =>
        (r?.lacunas || []).reduce(
          (sum, l) => sum + ((l.fimMin - l.inicioMin) * l.faltantes) / 60,
          0,
        );
      const mensagem = `Trocar ${state.modeloEscala === "fixa" ? DIAS_SEMANA[a.d.weekday] : formatDateBR(dateFromKey(a.d.data))} e ${state.modeloEscala === "fixa" ? DIAS_SEMANA[b.d.weekday] : formatDateBR(dateFromKey(b.d.data))}?${state.modeloEscala === "fixa" ? " A troca se repetirá em todas as semanas do padrão." : ""}\nOs horários completos acompanham o trabalho.\n${rel?.configurada && rel.periodos?.length && !rel.avisos?.length ? `Lacunas de cobertura: ${fmtHoras(faltas(anterior.coberturaOperacional))} → ${fmtHoras(faltas(rel))} horas-pessoa. Confira as faixas após aplicar.` : "Cobertura operacional não avaliada."}`;
      if (!(await env.confirm(mensagem, { title: "Confirmar troca de dias" })))
        return;
      if (
        state.escalaGerada !== anterior ||
        assinaturaAjustes(state) !== assinatura ||
        !permitido()
      )
        throw Error(
          "A escala mudou durante a confirmação. Faça a troca novamente.",
        );
      state.escalaGerada = nova;
      render();
      alterou();
      salvar();
    } catch (e) {
      await env.alert(e.message);
    } finally {
      ocupado = false;
      selecionado = null;
      buttons.forEach((b) => b.classList.remove("troca-selecionado"));
    }
  }
  painel.querySelector("[data-troca-selecionar]").onclick = () => {
    selecionado = {};
    painel.querySelector("span").textContent =
      "Selecione o primeiro dia e depois o segundo dia do mesmo colaborador. Escape cancela.";
  };
  painel
    .querySelector("[data-troca-desfazer]")
    ?.addEventListener("click", async () => {
      try {
        if (!permitido()) return;
        state.escalaGerada = desfazerTroca(state);
        render();
        alterou();
        salvar();
      } catch (e) {
        await env.alert(e.message);
      }
    });
  for (const button of buttons) {
    button.draggable = true;
    button.style.touchAction = "pan-x pan-y";
    button.addEventListener("dragstart", (event) => {
      if (!permitido()) {
        event.preventDefault();
        return;
      }
      origem = destino(button);
      event.dataTransfer.setData("text/plain", `${origem.id}:${origem.d.data}`);
      event.dataTransfer.effectAllowed = "move";
      button.classList.add("troca-selecionado");
    });
    button.addEventListener("dragend", () => {
      origem = null;
      buttons.forEach((b) =>
        b.classList.remove("troca-selecionado", "troca-destino"),
      );
    });
    button.addEventListener("dragover", (event) => {
      if (origem?.id === destino(button).id) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        button.classList.add("troca-destino");
      }
    });
    button.addEventListener("dragleave", () =>
      button.classList.remove("troca-destino"),
    );
    button.addEventListener("drop", (event) => {
      event.preventDefault();
      button.classList.remove("troca-destino");
      if (origem) void trocar(origem, destino(button));
    });
    button.addEventListener(
      "click",
      (event) => {
        if (selecionado === null) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (selecionado.d) void trocar(selecionado, destino(button));
        else {
          selecionado = destino(button);
          button.classList.add("troca-selecionado");
        }
      },
      true,
    );
  }
  container.onkeydown = (e) => {
    if (e.key === "Escape") {
      selecionado = null;
      buttons.forEach((b) => b.classList.remove("troca-selecionado"));
    }
  };
}
