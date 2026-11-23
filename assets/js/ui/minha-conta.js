/* Minha conta: editar o próprio nome, trocar o e-mail (confirmado pelo link enviado
 * ao endereço novo) e alterar a senha estando logado (senha atual + nova). */
import { closeDialog } from "./motion.js";
const regras = (v) => ({ tamanho: v.length >= 8 && new TextEncoder().encode(v).length <= 72, letra: /\p{L}/u.test(v), numero: /\d/.test(v) });
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const PAPEIS = { admin: "Admin", manager: "Gerente", operator: "Operador" };

export function openMinhaConta({ document, window, user, fetchImpl = window.fetch.bind(window), returnFocus = null, onNameChange = () => {} }) {
  const existente = document.querySelector("[data-minha-conta-dialog]");
  if (existente) { existente.querySelector("input")?.focus(); return existente; }
  const dialog = document.createElement("dialog");
  dialog.className = "app-dialog minha-conta no-print";
  dialog.dataset.minhaContaDialog = "";
  dialog.setAttribute("aria-labelledby", "minha-conta-titulo");
  dialog.dataset.loadingLabel = "Alterando a senha";
  const campo = (id, rotulo, auto) => `<label for="${id}">${rotulo}</label><div class="conta-senha"><input id="${id}" type="password" autocomplete="${auto}" maxlength="${id === "conta-atual" ? 256 : 72}" required><button type="button" data-ver="${id}" aria-label="Mostrar senha">Mostrar</button></div>`;
  dialog.innerHTML = `<header class="conta-topo"><div><p class="conta-sobretitulo">Minha conta</p><h2 id="minha-conta-titulo">${esc(user?.name || "Minha conta")}</h2><p class="conta-papel">${esc(PAPEIS[user?.role] || "")}</p></div><button type="button" class="conta-fechar" data-fechar aria-label="Fechar">×</button></header>
  <form class="conta-secao" data-nome-form novalidate>
    <h3>Dados pessoais</h3>
    <label for="conta-nome">Nome</label>
    <div class="conta-linha"><input id="conta-nome" type="text" autocomplete="name" maxlength="160" required value="${esc(user?.name || "")}"><button type="submit">Salvar nome</button></div>
    <p class="conta-msg" data-nome-msg role="status" aria-live="polite"></p>
  </form>
  <form class="conta-secao" data-email-form novalidate>
    <h3>E-mail de acesso</h3>
    <p class="conta-email-atual">Atual: <strong data-email-atual>carregando…</strong></p>
    <p class="conta-pendente" data-email-pendente hidden></p>
    <button type="button" class="conta-abrir" data-email-abrir hidden>Alterar e-mail</button>
    <div data-email-campos hidden>
      <label for="conta-email-novo">Novo e-mail</label>
      <input id="conta-email-novo" type="email" autocomplete="email" maxlength="254" required>
      <label for="conta-email-senha">Senha atual</label>
      <div class="conta-senha"><input id="conta-email-senha" type="password" autocomplete="current-password" maxlength="256" required><button type="button" data-ver="conta-email-senha" aria-label="Mostrar senha">Mostrar</button></div>
      <p class="conta-nota">Enviaremos um link ao novo endereço. Até você confirmar (em 24 horas), o e-mail atual continua valendo para entrar.</p>
      <div class="conta-linha conta-linha-fim"><button type="button" data-email-cancelar>Cancelar</button><button type="submit">Enviar confirmação</button></div>
    </div>
    <p class="conta-msg" data-email-msg role="status" aria-live="polite"></p>
  </form>
  <form class="conta-secao" data-senha-form novalidate>
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
  const $ = (s) => dialog.querySelector(s), form = $("[data-senha-form]"), msg = $("[data-msg]");
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
  const postar = async (body) => {
    const res = await fetchImpl("/api/account", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Error(data.error || "Não foi possível salvar. Tente novamente.");
    return data;
  };
  const tarefa = async (rotulo, saida, fn) => {
    if (ocupado) return;
    ocupado = true;
    dialog.dataset.loadingLabel = rotulo;
    dialog.setAttribute("aria-busy", "true");
    saida.removeAttribute("data-tipo");
    saida.textContent = "Salvando…";
    try {
      saida.textContent = await fn();
      saida.dataset.tipo = "ok";
    } catch (error) {
      saida.dataset.tipo = "erro";
      saida.textContent = error.message;
    } finally {
      ocupado = false;
      dialog.removeAttribute("aria-busy");
    }
  };
  // Nome.
  let nomeAtual = user?.name || "";
  $("[data-nome-form]").addEventListener("submit", (e) => {
    e.preventDefault();
    const saida = $("[data-nome-msg]"), nome = $("#conta-nome").value.trim();
    if (nome.length < 2) { saida.dataset.tipo = "erro"; saida.textContent = "Informe o nome completo."; return $("#conta-nome").focus(); }
    if (nome === nomeAtual) { saida.dataset.tipo = "ok"; saida.textContent = "Nenhuma alteração no nome."; return; }
    tarefa("Salvando o nome", saida, async () => {
      const r = await postar({ action: "name", name: nome });
      nomeAtual = r.name || nome;
      $("#minha-conta-titulo").textContent = nomeAtual;
      $("#conta-nome").value = nomeAtual;
      onNameChange(nomeAtual);
      return "Nome atualizado.";
    });
  });
  // E-mail: o novo endereço só vale depois do clique no link enviado a ele.
  const campos = $("[data-email-campos]"), abrir = $("[data-email-abrir]");
  const pendente = (email) => {
    const p = $("[data-email-pendente]");
    p.hidden = !email;
    p.textContent = email ? `Aguardando confirmação de ${email}. Abra o link enviado a esse endereço (vale por 24 horas).` : "";
  };
  const mostrarCampos = (sim) => {
    campos.hidden = !sim;
    abrir.hidden = sim;
    if (sim) $("#conta-email-novo").focus();
  };
  abrir.addEventListener("click", () => mostrarCampos(true));
  $("[data-email-cancelar]").addEventListener("click", () => { mostrarCampos(false); $("[data-email-msg]").textContent = ""; abrir.focus(); });
  $("[data-email-form]").addEventListener("submit", (e) => {
    e.preventDefault();
    if (campos.hidden) return;
    const saida = $("[data-email-msg]"), novo = $("#conta-email-novo").value.trim().toLowerCase(), senha = $("#conta-email-senha").value;
    saida.dataset.tipo = "erro";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(novo)) { saida.textContent = "Informe um e-mail válido."; return $("#conta-email-novo").focus(); }
    if (novo === $("[data-email-atual]").textContent) { saida.textContent = "Este já é o seu e-mail de acesso."; return $("#conta-email-novo").focus(); }
    if (!senha) { saida.textContent = "Informe a senha atual."; return $("#conta-email-senha").focus(); }
    tarefa("Enviando a confirmação", saida, async () => {
      const r = await postar({ action: "email", email: novo, current: senha });
      $("#conta-email-novo").value = "";
      $("#conta-email-senha").value = "";
      mostrarCampos(false);
      pendente(r.pendingEmail || novo);
      return `Enviamos o link de confirmação para ${r.pendingEmail || novo}.`;
    });
  });
  fetchImpl("/api/account", { credentials: "same-origin", cache: "no-store" })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Error(data.error || "");
      $("[data-email-atual]").textContent = data.email || "—";
      pendente(data.pendingEmail);
      if (data.emailChangeEnabled !== false) abrir.hidden = false;
      else $("[data-email-msg]").textContent = "A troca de e-mail depende do envio de e-mails, ainda não configurado.";
    })
    .catch((error) => {
      $("[data-email-atual]").textContent = "indisponível";
      $("[data-email-msg]").textContent = error.message || "Não foi possível carregar os dados da conta.";
    });
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
    dialog.dataset.loadingLabel = "Alterando a senha";
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
