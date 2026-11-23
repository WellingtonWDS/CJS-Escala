/* Minha conta: alterar a própria senha estando logado (senha atual + nova). */
import { closeDialog } from "./motion.js";
const regras = (v) => ({ tamanho: v.length >= 8 && new TextEncoder().encode(v).length <= 72, letra: /\p{L}/u.test(v), numero: /\d/.test(v) });
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const PAPEIS = { admin: "Admin", manager: "Gerente", operator: "Operador" };

export function openMinhaConta({ document, window, user, fetchImpl = window.fetch.bind(window), returnFocus = null }) {
  const existente = document.querySelector("[data-minha-conta-dialog]");
  if (existente) { existente.querySelector("input")?.focus(); return existente; }
  const dialog = document.createElement("dialog");
  dialog.className = "app-dialog minha-conta no-print";
  dialog.dataset.minhaContaDialog = "";
  dialog.setAttribute("aria-labelledby", "minha-conta-titulo");
  dialog.dataset.loadingLabel = "Alterando a senha";
  const campo = (id, rotulo, auto) => `<label for="${id}">${rotulo}</label><div class="conta-senha"><input id="${id}" type="password" autocomplete="${auto}" maxlength="${id === "conta-atual" ? 256 : 72}" required><button type="button" data-ver="${id}" aria-label="Mostrar senha">Mostrar</button></div>`;
  dialog.innerHTML = `<form novalidate>
    <header class="conta-topo"><div><p class="conta-sobretitulo">Minha conta</p><h2 id="minha-conta-titulo">${esc(user?.name || "Minha conta")}</h2><p class="conta-papel">${esc(PAPEIS[user?.role] || "")}</p></div><button type="button" class="conta-fechar" data-fechar aria-label="Fechar">×</button></header>
    <h3>Alterar senha</h3>
    ${campo("conta-atual", "Senha atual", "current-password")}
    ${campo("conta-nova", "Nova senha", "new-password")}
    <ul class="conta-regras"><li data-regra="tamanho">Pelo menos 8 caracteres</li><li data-regra="letra">Pelo menos uma letra</li><li data-regra="numero">Pelo menos um número</li></ul>
    ${campo("conta-confirmar", "Repita a nova senha", "new-password")}
    <p class="conta-nota">Ao alterar, as sessões abertas em outros aparelhos são encerradas. Você continua conectado aqui e recebe um e-mail de confirmação.</p>
    <p class="conta-msg" data-msg role="status" aria-live="polite"></p>
    <div class="app-dialog-actions"><button type="button" data-fechar>Cancelar</button><button type="submit" data-dialog-accept>Alterar senha</button></div>
  </form>`;
  document.body.append(dialog);
  const $ = (s) => dialog.querySelector(s), form = $("form"), msg = $("[data-msg]");
  let ocupado = false, concluido = false;
  const atualizar = () => {
    const r = regras($("#conta-nova").value);
    dialog.querySelectorAll("[data-regra]").forEach((li) => (li.dataset.ok = String(r[li.dataset.regra])));
  };
  const fechar = async () => {
    if (ocupado) return;
    await closeDialog(dialog, { remove: true });
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  };
  dialog.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", fechar));
  dialog.addEventListener("cancel", (e) => { e.preventDefault(); fechar(); });
  dialog.querySelectorAll("[data-ver]").forEach((b) => b.addEventListener("click", () => {
    const input = $("#" + b.dataset.ver), mostrar = input.type === "password";
    input.type = mostrar ? "text" : "password";
    b.textContent = mostrar ? "Ocultar" : "Mostrar";
    b.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
  }));
  $("#conta-nova").addEventListener("input", atualizar);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (ocupado) return;
    if (concluido) return fechar();
    const atual = $("#conta-atual").value, nova = $("#conta-nova").value, r = regras(nova);
    msg.dataset.tipo = "erro";
    if (!atual) { msg.textContent = "Informe a senha atual."; return $("#conta-atual").focus(); }
    if (!r.tamanho || !r.letra || !r.numero) { msg.textContent = "A nova senha precisa ter de 8 a 72 caracteres, com letras e números."; return $("#conta-nova").focus(); }
    if (nova === atual) { msg.textContent = "A nova senha precisa ser diferente da atual."; return $("#conta-nova").focus(); }
    if (nova !== $("#conta-confirmar").value) { msg.textContent = "As senhas não conferem."; return $("#conta-confirmar").focus(); }
    ocupado = true;
    dialog.setAttribute("aria-busy", "true");
    msg.removeAttribute("data-tipo");
    msg.textContent = "Alterando…";
    try {
      const res = await fetchImpl("/api/password", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "change", current: atual, password: nova }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Error(data.error || "Não foi possível alterar a senha.");
      concluido = true;
      form.querySelectorAll("input, [data-ver]").forEach((el) => (el.disabled = true));
      msg.dataset.tipo = "ok";
      msg.textContent = `Senha alterada.${data.sessionsRevoked ? ` ${data.sessionsRevoked} sessão(ões) em outros aparelhos foram encerradas.` : ""} Use a nova senha no próximo acesso.`;
      $("[data-dialog-accept]").textContent = "Fechar";
      dialog.querySelector(".app-dialog-actions [data-fechar]").hidden = true;
    } catch (error) {
      msg.dataset.tipo = "erro";
      msg.textContent = error.message;
    } finally {
      ocupado = false;
      dialog.removeAttribute("aria-busy");
    }
  });
  atualizar();
  dialog.showModal();
  $("#conta-atual").focus();
  return dialog;
}
