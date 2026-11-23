import { initSeasonalDecorations } from "./seasonal.js";
import { safeDestination } from "./session.js";
import { initLoading } from "./ui/loading.js";
initLoading(document);
initSeasonalDecorations(document);
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
      document.getElementById("login-forgot-row").hidden = false;
      form.email.required = true;
      if (location.hash === "#esqueci") mostrarEsqueci(true);
      else form.email.focus();
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

// Esqueci minha senha: pedido do link (resposta sempre igual, exista ou não a conta).
const forgot = document.getElementById("forgot-form"),
  forgotMessage = document.getElementById("forgot-message"),
  titulo = document.getElementById("login-title");
function mostrarEsqueci(ativo) {
  forgot.hidden = !ativo;
  form.hidden = ativo;
  titulo.textContent = ativo ? "Recuperar acesso" : "Acesse o sistema";
  if (ativo) {
    forgot.email.value ||= form.email.value;
    forgotMessage.textContent = "";
    forgotMessage.removeAttribute("data-tipo");
    forgot.email.focus();
  } else form.email.focus();
}
document.getElementById("login-forgot").addEventListener("click", (e) => {
  e.preventDefault();
  history.replaceState(null, "", "#esqueci");
  mostrarEsqueci(true);
});
document.getElementById("forgot-back").addEventListener("click", (e) => {
  e.preventDefault();
  history.replaceState(null, "", location.pathname + location.search);
  mostrarEsqueci(false);
});
forgot.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = forgot.querySelector("button[type=submit]");
  if (button.disabled) return;
  const email = forgot.email.value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    forgotMessage.dataset.tipo = "erro";
    forgotMessage.textContent = "Informe um e-mail válido.";
    return;
  }
  button.disabled = true;
  forgot.setAttribute("aria-busy", "true");
  forgotMessage.removeAttribute("data-tipo");
  forgotMessage.textContent = "Enviando…";
  try {
    const response = await fetch("/api/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request", email }),
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível enviar agora. Tente novamente.");
    forgotMessage.dataset.tipo = "ok";
    forgotMessage.textContent = data.message + " Confira também a caixa de spam.";
  } catch (error) {
    forgotMessage.dataset.tipo = "erro";
    forgotMessage.textContent = error.message || "Não foi possível conectar. Tente novamente.";
  } finally {
    button.disabled = false;
    forgot.removeAttribute("aria-busy");
  }
});
window.addEventListener("hashchange", () => {
  if (mode === "n8n") mostrarEsqueci(location.hash === "#esqueci");
});
