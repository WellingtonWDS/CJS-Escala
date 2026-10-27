import { companyLabel, matchesCompany } from "../shared/empresas.js";

// O select mantém o UUID usado na persistência; somente o combobox é visível.
export function createCompanyCombobox({ root, onChange = () => {} }) {
  const document = root.ownerDocument,
    select = root.querySelector("select"),
    trigger = root.querySelector("[data-company-trigger]"),
    popup = root.querySelector("[data-company-popup]"),
    input = root.querySelector("input"),
    list = root.querySelector('[role="listbox"]'),
    message = root.querySelector('[role="status"]');
  let rows = [],
    matches = [],
    active = -1;
  function highlight(index) {
    active = index;
    [...list.children].forEach((option, i) => {
      option.classList.toggle("is-active", i === active);
    });
    const option = list.children[active];
    if (option) {
      input.setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  }
  function sync() {
    trigger.textContent = rows.find((row) => row.id === select.value)
      ? companyLabel(rows.find((row) => row.id === select.value))
      : rows.length
        ? "Selecione a empresa"
        : "Nenhuma empresa disponível";
    trigger.disabled = select.disabled || !rows.length;
    input.disabled = select.disabled;
    if (trigger.disabled) close();
  }
  function close(focus = false) {
    popup.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    if (focus) trigger.focus();
  }
  function choose(row) {
    const changed = select.value !== row.id;
    select.value = row.id;
    close(true);
    sync();
    if (changed) select.dispatchEvent(new document.defaultView.Event("change"));
  }
  function render() {
    matches = rows.filter((row) => matchesCompany(row, input.value));
    list.replaceChildren(
      ...matches.map((row, i) => {
        const option = document.createElement("button");
        option.type = "button";
        option.id = `${list.id}-${i}`;
        option.dataset.companyId = row.id;
        option.tabIndex = -1;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(row.id === select.value));
        option.textContent = companyLabel(row);
        option.addEventListener("click", () => choose(row));
        return option;
      }),
    );
    message.textContent = matches.length
      ? `${matches.length} empresa(s)`
      : "Nenhuma empresa encontrada";
    highlight(
      matches.length
        ? Math.max(
            0,
            matches.findIndex((row) => row.id === select.value),
          )
        : -1,
    );
  }
  function open() {
    if (trigger.disabled) return;
    popup.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-expanded", "true");
    input.value = "";
    render();
    input.focus();
  }
  trigger.addEventListener("click", () => (popup.hidden ? open() : close()));
  input.addEventListener("input", render);
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !popup.hidden) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (popup.hidden) open();
      else
        highlight(
          matches.length
            ? event.key === "Home"
              ? 0
              : event.key === "End"
                ? matches.length - 1
                : (active +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    matches.length) %
                  matches.length
            : -1,
        );
    } else if (event.key === "Enter" && !popup.hidden) {
      event.preventDefault();
      if (matches[active]) choose(matches[active]);
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!root.contains(event.target)) close();
  });
  root.addEventListener("focusout", (event) => {
    if (!root.contains(event.relatedTarget)) close();
  });
  root.closest("dialog")?.addEventListener("close", () => close());
  select.addEventListener("change", () => {
    sync();
    onChange();
  });
  new document.defaultView.MutationObserver(sync).observe(select, {
    attributes: true,
    attributeFilter: ["disabled"],
    childList: true,
  });
  return {
    setRows(next, selected = "") {
      rows = next;
      select.replaceChildren(
        ...rows.map(
          (row) => new document.defaultView.Option(companyLabel(row), row.id),
        ),
      );
      select.value = selected || rows[0]?.id || "";
      close();
      sync();
    },
  };
}
