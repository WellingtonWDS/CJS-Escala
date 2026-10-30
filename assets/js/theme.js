/* Runs before styles are painted, on both login and application. */
(() => {
  const key = "reescala-theme", root = document.documentElement;
  let current = "light";
  try { if (localStorage.getItem(key) === "dark") current = "dark"; } catch {}
  function apply(value) {
    current = value === "dark" ? "dark" : "light";
    root.dataset.theme = current;
    document.querySelectorAll("[data-theme-toggle]").forEach(button => {
      button.setAttribute("aria-checked", String(current === "dark"));
      button.title = current === "dark" ? "Ativar tema claro" : "Ativar tema escuro";
      button.querySelector("[data-theme-icon]").textContent = current === "dark" ? "☾" : "☀";
    });
    document.querySelectorAll("img[data-theme-logo]").forEach(img => {
      img.src = current === "dark" ? "/logos/Reescala_branco_transparente.png" : "/logos/Reescala_original_transparente.png";
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = current === "dark" ? "#101923" : "#0B2545";
  }
  apply(current);
  document.addEventListener("DOMContentLoaded", () => {
    apply(current);
    document.querySelectorAll("[data-theme-toggle]").forEach(button => button.addEventListener("click", () => {
      apply(current === "dark" ? "light" : "dark");
      try { localStorage.setItem(key, current); } catch {}
    }));
  });
  window.addEventListener("storage", event => {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
})();
