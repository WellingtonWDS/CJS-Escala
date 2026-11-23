/* Página aberta pelo link do e-mail: o token vem no fragmento (#token=…), que
 * não é enviado em logs de acesso, e é retirado da barra de endereço na hora. */
const $ = (id) => document.getElementById(id);
const status = $("reset-status"), form = $("reset-form"), mensagem = $("reset-message");
const token = new URLSearchParams(location.hash.slice(1)).get("token") || "";
history.replaceState(null, "", location.pathname);
export const regras = (v) => ({ tamanho: v.length >= 8 && new TextEncoder().encode(v).length <= 72, letra: /\p{L}/u.test(v), numero: /\d/.test(v) });
const post = async (body) => {
  const r = await fetch("/api/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(Error(data.error || "Serviço indisponível. Tente novamente."), { status: r.status });
  return data;
};
function invalido(texto) {
  status.dataset.tipo = "erro";
  status.textContent = texto;
  form.hidden = true;
  $("reset-new-link").hidden = false;
}
function atualizarRegras() {
  const r = regras($("nova-senha").value);
  for (const li of document.querySelectorAll("[data-regra]")) li.dataset.ok = String(r[li.dataset.regra]);
}
document.querySelectorAll("[data-ver]").forEach((b) => b.addEventListener("click", () => {
  const input = $(b.dataset.ver), mostrar = input.type === "password";
  input.type = mostrar ? "text" : "password";
  b.textContent = mostrar ? "Ocultar" : "Mostrar";
  b.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
}));
$("nova-senha").addEventListener("input", atualizarRegras);
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const botao = form.querySelector("button[type=submit]");
  if (botao.disabled) return;
  const senha = $("nova-senha").value, r = regras(senha);
  mensagem.dataset.tipo = "erro";
  if (!r.tamanho || !r.letra || !r.numero) { mensagem.textContent = "A senha precisa ter de 8 a 72 caracteres, com letras e números."; return; }
  if (senha !== $("confirmar-senha").value) { mensagem.textContent = "As senhas não conferem."; return; }
  botao.disabled = true;
  form.setAttribute("aria-busy", "true");
  mensagem.textContent = "";
  try {
    await post({ action: "reset", token, password: senha });
    form.hidden = true;
    status.hidden = true;
    $("reset-title").textContent = "Senha alterada";
    $("reset-done").hidden = false;
  } catch (error) {
    if (error.status === 410) invalido(error.message);
    else mensagem.textContent = error.message;
  } finally {
    botao.disabled = false;
    form.removeAttribute("aria-busy");
  }
});
if (!/^[a-f0-9]{64}$/.test(token)) invalido("Link incompleto ou inválido. Abra o link do e-mail novamente ou peça um novo.");
else
  post({ action: "check", token })
    .then((r) => {
      if (!r.valid) return invalido("Este link é inválido, já foi usado ou expirou. Peça um novo.");
      status.removeAttribute("data-tipo");
      status.textContent = "Escolha uma senha nova para entrar no Reescala.";
      form.hidden = false;
      atualizarRegras();
      $("nova-senha").focus();
    })
    .catch((error) => { status.dataset.tipo = "erro"; status.textContent = error.message; });
// Outro link colado na mesma aba: recomeça com o novo token.
window.addEventListener("hashchange", () => { if (/token=/.test(location.hash)) location.reload(); });
