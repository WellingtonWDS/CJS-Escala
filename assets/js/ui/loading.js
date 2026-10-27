import { cancelClosing, closeDialog } from "./motion.js";
const instances = new WeakMap();
export function initLoading(document) {
  if (instances.has(document)) return instances.get(document);
  let timer,
    overlay,
    started = 0,
    closing = false,
    cancelAction;
  const window = document.defaultView;
  const label = (root) =>
    root.dataset.loadingLabel ||
    (root.id === "login-form"
      ? "Validando seu acesso"
      : root.id.endsWith("-ajustes")
        ? "Buscando ajustes de cobertura"
        : root.id.endsWith("-edicao-manual")
          ? "Readequando a escala"
          : "Processando sua solicitação");
  function busyRoots() {
    return [...document.querySelectorAll('[aria-busy="true"]')].filter(
      (root) => !root.closest("[data-loading-overlay]"),
    );
  }
  function hide() {
    clearTimeout(timer);
    timer = null;
    if (!overlay?.open || closing) return;
    closing = true;
    closeDialog(overlay).then(() => {
      closing = false;
    });
  }
  function show() {
    timer = null;
    const roots = busyRoots();
    if (
      !roots.length ||
      document.querySelector("dialog[data-app-dialog][open]")
    )
      return;
    if (!overlay) {
      overlay = document.createElement("dialog");
      overlay.className = "loading-overlay no-print";
      overlay.dataset.loadingOverlay = "";
      overlay.setAttribute("aria-label", "Operação em andamento");
      overlay.innerHTML = `<div class="loading-visual" aria-hidden="true"><span class="loading-orbit"></span><span class="loading-orbit loading-orbit-inner"></span><img class="loading-core" src="/logos/Reescala_branco_transparente.png" alt="" width="48" height="42" style="width:48px;height:42px;max-width:48px;object-fit:contain"></div><h2 data-loading-label></h2><p role="status" aria-live="polite">Aguarde um instante…</p><button type="button" hidden data-loading-cancel>Cancelar busca</button>`;
      overlay.addEventListener("cancel", (event) => event.preventDefault());
      overlay.querySelector("button").addEventListener("click", () => {
        const action = cancelAction;
        if (action?.isConnected) action.click();
      });
      document.body.append(overlay);
    }
    cancelClosing(overlay);
    closing = false;
    overlay.querySelector("h2").textContent = label(roots[0]);
    cancelAction = roots
      .map((root) =>
        root.querySelector(
          "[data-ajuste-cancelar]:not([hidden]),[data-manual-cancelar]:not([hidden]),[data-loading-cancel-action]:not([disabled])",
        ),
      )
      .find(Boolean);
    overlay.querySelector("button").hidden = !cancelAction;
    if (!overlay.open) {
      started = performance.now();
      overlay.showModal();
    }
  }
  function refresh() {
    if (document.querySelector("dialog[data-app-dialog][open]")) {
      hide();
      return;
    }
    const roots = busyRoots();
    if (roots.length) {
      if (overlay?.open) {
        if (closing) {
          cancelClosing(overlay);
          closing = false;
        }
        return;
      }
      if (!timer)
        timer = setTimeout(
          show,
          roots.some((root) => root.dataset.loadingImmediate === "true")
            ? 0
            : 180,
        );
    } else {
      clearTimeout(timer);
      timer = null;
      if (overlay?.open && !closing) {
        const remaining = Math.max(0, 300 - (performance.now() - started));
        timer = setTimeout(() => {
          timer = null;
          if (!busyRoots().length) hide();
        }, remaining);
      }
    }
  }
  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-busy", "open"],
  });
  window.addEventListener("pagehide", hide);
  const api = { refresh };
  instances.set(document, api);
  refresh();
  return api;
}
