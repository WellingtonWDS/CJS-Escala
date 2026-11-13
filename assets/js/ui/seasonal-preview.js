import {
  calendarioSazonal,
  dataSazonal,
  temaSazonal,
} from "../config/calendario-sazonal.js";
import { iconeSazonal } from "../seasonal.js";
import { closeDialog } from "./motion.js";

export function openSeasonalPreview({ document, role, returnFocus }) {
  if (role !== "admin") return null;
  const existente = document.querySelector("[data-seasonal-preview-dialog]");
  if (existente) {
    existente.focus();
    return existente;
  }
  const window = document.defaultView,
    anterior = returnFocus || document.activeElement;
  const temas = calendarioSazonal(Number(dataSazonal().slice(0, 4)));
  const atual = temaSazonal();
  const dialog = document.createElement("dialog");
  dialog.className = "app-dialog seasonal-preview no-print";
  dialog.dataset.seasonalPreviewDialog = "";
  dialog.setAttribute("aria-labelledby", "seasonal-preview-title");
  dialog.setAttribute("aria-describedby", "seasonal-preview-help");
  dialog.innerHTML = `<form><header><h2 id="seasonal-preview-title">Prévia das festividades</h2><button type="button" data-seasonal-preview-close aria-label="Fechar prévia">×</button></header>
    <p id="seasonal-preview-help">Escolha uma festividade e passe o mouse no enfeite. No celular, toque nele ou use Reproduzir efeito. Esta prévia não altera o calendário do sistema.</p>
    <div class="seasonal-preview-controls"><label>Festividade<select data-preview-event></select></label><label>Aparência da prévia<select data-preview-appearance><option value="light">Claro</option><option value="dark">Escuro</option></select></label></div>
    <p data-preview-period></p>
    <div class="seasonal-preview-stage" data-preview-stage>
      <section class="seasonal-preview-login" aria-label="Exemplo do login"><div class="seasonal-preview-caption">Login</div><div class="seasonal-preview-sample-brand"><img data-preview-logo width="40" height="35" alt=""><strong>Reescala</strong></div><span class="seasonal-detail" title="" aria-hidden="true" data-preview-ornament></span><div class="seasonal-preview-login-placeholder" aria-hidden="true"><b>Acesse o sistema</b><div>E-mail</div><div>Senha</div><div class="seasonal-preview-fake-button">Entrar</div></div></section>
      <section class="seasonal-preview-menu" aria-label="Exemplo do menu lateral"><div class="seasonal-preview-caption">Menu lateral</div><div class="seasonal-preview-sample-brand"><img src="/logos/Reescala_branco_transparente.png" width="40" height="35" alt=""><strong>Reescala</strong><span class="seasonal-detail" title="" aria-hidden="true" data-preview-ornament></span></div><div class="seasonal-preview-menu-placeholder" aria-hidden="true">Gerar escala<br>Empresa atual e preenchimentos<br>Diagnóstico</div></section>
    </div><div class="app-dialog-actions"><button type="button" data-preview-replay>Reproduzir efeito</button><button type="button" data-seasonal-preview-close>Fechar</button></div><p data-preview-message role="status" aria-live="polite"></p></form>`;
  document.body.append(dialog);
  const select = dialog.querySelector("[data-preview-event]");
  select.replaceChildren(...temas.map((t) => new window.Option(t.nome, t.id)));
  select.value = atual?.id || temas[0].id;
  const appearance = dialog.querySelector("[data-preview-appearance]");
  appearance.value =
    document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const ornaments = [...dialog.querySelectorAll("[data-preview-ornament]")];
  const timers = new Map();
  function stop() {
    timers.forEach((t) => window.clearTimeout(t));
    timers.clear();
    ornaments.forEach((e) => e.classList.remove("is-celebrating"));
  }
  function render() {
    stop();
    const tema = temas.find((t) => t.id === select.value);
    const format = (s) => s.split("-").reverse().join("/");
    dialog.querySelector("[data-preview-period]").textContent =
      `Período no calendário: ${format(tema.inicio)} a ${format(tema.fim)}. Datas específicas podem ter prioridade.`;
    dialog.querySelector("[data-preview-message]").textContent = tema.mensagem;
    for (const el of ornaments) {
      el.dataset.seasonalTheme = tema.id;
      el.dataset.seasonalMessage = tema.mensagem;
      el.dataset.seasonalEffect = tema.efeito;
      el.innerHTML = iconeSazonal(tema);
    }
  }
  function renderAppearance() {
    dialog.querySelector("[data-preview-stage]").dataset.previewTheme =
      appearance.value;
    dialog.querySelector("[data-preview-logo]").src =
      appearance.value === "dark"
        ? "/logos/Reescala_branco_transparente.png"
        : "/logos/Reescala_original_transparente.png";
  }
  function replay(el) {
    window.clearTimeout(timers.get(el));
    el.classList.remove("is-celebrating");
    void el.offsetWidth;
    el.classList.add("is-celebrating");
    timers.set(
      el,
      window.setTimeout(() => el.classList.remove("is-celebrating"), 2500),
    );
  }
  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;
    stop();
    await closeDialog(dialog, { remove: true });
    if (anterior?.isConnected) anterior.focus({ preventScroll: true });
  }
  select.addEventListener("change", render);
  appearance.addEventListener("change", renderAppearance);
  dialog
    .querySelector("[data-preview-replay]")
    .addEventListener("click", () => ornaments.forEach(replay));
  ornaments.forEach((el) =>
    el.addEventListener("click", (event) => {
      event.preventDefault();
      replay(el);
    }),
  );
  dialog
    .querySelectorAll("[data-seasonal-preview-close]")
    .forEach((b) => b.addEventListener("click", close));
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener("submit", (e) => e.preventDefault());
  dialog.addEventListener("click", (e) => {
    if (e.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    )
      close();
  });
  render();
  renderAppearance();
  dialog.showModal();
  select.focus();
  return dialog;
}
