const instances = new WeakMap();
export function getDialogs(document = globalThis.document) {
  if (instances.has(document)) return instances.get(document);
  let queue = Promise.resolve();
  function ask(type, message, value = "", options = {}) {
    const task = () =>
      new Promise((resolve) => {
        const previous = document.activeElement;
        const dialog = document.createElement("dialog");
        dialog.className = "app-dialog no-print";
        dialog.dataset.appDialog = type;
        dialog.setAttribute("aria-labelledby", "app-dialog-title");
        dialog.setAttribute("aria-describedby", "app-dialog-message");
        dialog.innerHTML = `<form><header><span class="app-dialog-symbol" aria-hidden="true"></span><h2 id="app-dialog-title"></h2></header><p id="app-dialog-message"></p><label data-dialog-field-label hidden><span data-dialog-label></span><span data-dialog-field></span></label><div class="app-dialog-actions"><button type="button" data-dialog-cancel>Cancelar</button><button type="submit" data-dialog-accept></button></div></form>`;
        dialog.querySelector("h2").textContent =
          options.title ||
          {
            alert: "Atenção",
            confirm: "Confirmar ação",
            prompt: "Alterar informação",
          }[type];
        dialog.querySelector(".app-dialog-symbol").textContent =
          type === "alert" ? "!" : "?";
        dialog.querySelector("p").textContent = String(message);
        const accept = dialog.querySelector("[data-dialog-accept]"),
          cancel = dialog.querySelector("[data-dialog-cancel]");
        accept.textContent =
          options.confirmText || (type === "alert" ? "Entendi" : "Confirmar");
        cancel.textContent = options.cancelText || "Cancelar";
        cancel.hidden = type === "alert";
        let input,
          finished = false;
        if (type === "prompt") {
          dialog.querySelector("[data-dialog-field-label]").hidden = false;
          dialog.querySelector("[data-dialog-label]").textContent =
            options.label || "Informe o valor";
          input = document.createElement(options.choices ? "select" : "input");
          input.dataset.dialogInput = "";
          if (options.choices)
            for (const [key, label] of options.choices) {
              const option = document.createElement("option");
              option.value = key;
              option.textContent = label;
              input.append(option);
            }
          else {
            input.type = "text";
            input.maxLength = options.maxLength || 100;
            input.autocomplete = "off";
          }
          input.value = String(value ?? "");
          dialog.querySelector("[data-dialog-field]").append(input);
        }
        const dismissValue =
          type === "prompt" ? null : type === "confirm" ? false : undefined;
        function finish(result) {
          if (finished) return;
          finished = true;
          dialog.close();
          dialog.remove();
          if (previous?.isConnected) previous.focus({ preventScroll: true });
          resolve(result);
        }
        dialog.querySelector("form").addEventListener("submit", (event) => {
          event.preventDefault();
          finish(
            type === "prompt"
              ? input.value
              : type === "confirm"
                ? true
                : undefined,
          );
        });
        cancel.addEventListener("click", () => finish(dismissValue));
        dialog.addEventListener("cancel", (event) => {
          event.preventDefault();
          finish(dismissValue);
        });
        dialog.addEventListener("close", () => finish(dismissValue));
        document.body.append(dialog);
        dialog.showModal();
        if (input) {
          input.focus({ preventScroll: true });
          input.select?.();
        } else
          (type === "confirm" ? cancel : accept).focus({ preventScroll: true });
      });
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  }
  const api = {
    alert: (message, options) => ask("alert", message, "", options),
    confirm: (message, options) => ask("confirm", message, "", options),
    prompt: (message, value, options) => ask("prompt", message, value, options),
  };
  instances.set(document, api);
  return api;
}
