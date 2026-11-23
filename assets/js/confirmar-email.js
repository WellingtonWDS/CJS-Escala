/* Página aberta pelo link enviado ao endereço novo: o token vem no fragmento
 * (#token=…), sai da barra de endereço na hora e só é usado com um clique,
 * para que leitores automáticos de links não confirmem a troca. */
const $ = (id) => document.getElementById(id);
const status = $("email-status"), form = $("email-form");
const token = new URLSearchParams(location.hash.slice(1)).get("token") || "";
history.replaceState(null, "", location.pathname);
function falha(texto) {
  status.dataset.tipo = "erro";
  status.textContent = texto;
  form.hidden = true;
}
if (!/^[a-f0-9]{64}$/.test(token)) falha("Link incompleto ou inválido. Abra o link do e-mail novamente ou peça a troca outra vez em Minha conta.");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const botao = form.querySelector("button");
  if (botao.disabled) return;
  botao.disabled = true;
  form.setAttribute("aria-busy", "true");
  status.removeAttribute("data-tipo");
  status.textContent = "Confirmando…";
  try {
    const r = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirmEmail", token }), cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if ([409, 410].includes(r.status)) return falha(data.error);
      throw Error(data.error || "Serviço indisponível. Tente novamente.");
    }
    form.hidden = true;
    status.hidden = true;
    $("email-title").textContent = "E-mail confirmado";
    $("email-done").querySelector("p").textContent = `Pronto! A partir de agora, entre no Reescala com ${data.email || "o novo e-mail"}. Avisamos o endereço anterior sobre a troca.`;
    $("email-done").hidden = false;
  } catch (error) {
    status.dataset.tipo = "erro";
    status.textContent = error.message;
  } finally {
    botao.disabled = false;
    form.removeAttribute("aria-busy");
  }
});
window.addEventListener("hashchange", () => { if (/token=/.test(location.hash)) location.reload(); });
