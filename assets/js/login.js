import { safeDestination } from "./session.js";
const form = document.getElementById("login-form");
const message = document.getElementById("login-message");
const params = new URLSearchParams(location.search);
if (params.has("expired"))
  message.textContent = "Sua sessão expirou. Entre novamente.";
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  message.textContent = "";
  try {
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: form.password.value }),
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
  }
});
