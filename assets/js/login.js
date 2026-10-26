import { safeDestination } from "./session.js";
import { initLoading } from "./ui/loading.js";
initLoading(document);
const form = document.getElementById("login-form");
const message = document.getElementById("login-message");
const params = new URLSearchParams(location.search);
if (params.has("expired"))
  message.textContent = "Sua sessão expirou. Entre novamente.";
let mode;
const configuration = fetch("/api/auth?config=1", { cache: "no-store" })
  .then(async (response) => {
    if (!response.ok) throw Error("Login indisponível. Tente novamente.");
    const data = await response.json();
    mode = data.mode;
    if (mode === "n8n") {
      document.getElementById("login-email").hidden = false;
      form.email.required = true;
      document.getElementById("login-description").textContent =
        "Entre com sua conta autorizada. A sessão dura até 12 horas.";
      form.email.focus();
    }
  })
  .catch((error) => {
    message.textContent = error.message;
    throw error;
  });
configuration.catch(() => {});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  if (button.disabled) return;
  button.disabled = true;
  form.setAttribute("aria-busy", "true");
  message.textContent = "";
  try {
    await configuration;
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: form.password.value,
        ...(mode === "n8n" ? { email: form.email.value } : {}),
      }),
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível entrar.");
    location.replace(safeDestination(params.get("next")));
  } catch (error) {
    message.textContent =
      error.message || "Não foi possível conectar. Tente novamente.";
  } finally {
    button.disabled = false;
    form.removeAttribute("aria-busy");
  }
});
