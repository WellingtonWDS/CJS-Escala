import { montarTermosAditivos, CATALOGO_CLAUSULAS, CLAUSULAS_PADRAO } from "./termo-aditivo.js";
import { nomeArquivo } from "./relatorio.js";
import { escapeHtml as esc } from "../shared/formatacao.js";
import { initLoading } from "../ui/loading.js";
import { closeDialog } from "../ui/motion.js";

const empresaAtual = (env) => env.document.querySelector("[data-current-company]")?.textContent?.replace("Nenhuma empresa selecionada", "").trim() || "";
const CHAVE = "cjs-termo-clausulas";
const GRUPOS = [
  ["ec141", "Adequação à EC 141", "Preenchidas com o horário, as folgas e a carga da proposta."],
  ["complementar", "Cláusulas complementares", "Texto padrão; confira se se aplica à empresa e ao colaborador."],
  ["final", "Encerramento", ""],
];

/** Cláusulas escolhidas no modal, guardadas neste navegador. */
function clausulasEscolhidas(env) {
  try {
    const salvas = JSON.parse(env.document.defaultView?.localStorage.getItem(CHAVE) || "null");
    if (Array.isArray(salvas)) return salvas.filter((id) => CATALOGO_CLAUSULAS.some((c) => c.id === id));
  } catch {}
  return [...CLAUSULAS_PADRAO];
}
function salvarEscolha(env, ids) {
  try { env.document.defaultView?.localStorage.setItem(CHAVE, JSON.stringify(ids)); } catch {}
}
const montar = (state, env) => montarTermosAditivos(state, { empresa: empresaAtual(env), servidor: env.empresaServidor?.(), clausulas: clausulasEscolhidas(env) });

/** Prévia do termo do primeiro colaborador, com as cláusulas escolhidas. */
export function renderPreviaTermo(state, env) {
  const alvo = env.document.querySelector("[data-termo-previa-conteudo]");
  if (!alvo) return;
  try {
    const { termos, titulo, aviso } = montar(state, env);
    const t = termos[0];
    alvo.innerHTML = `<p class="text-xs text-slate-500 mb-2">${esc(aviso)}</p><p class="text-xs text-slate-500 mb-3">Prévia do termo de <b>${esc(t.nome)}</b>; os arquivos trazem um termo para cada um dos ${termos.length} colaborador(es).</p><article class="bg-white border border-slate-200 rounded-md p-4 text-sm leading-relaxed text-justify"><h4 class="font-semibold text-center mb-3">${esc(titulo)}</h4><p class="mb-3">${esc(t.partes)}</p>${t.clausulas.map((c) => `<p class="font-semibold mt-3">CLÁUSULA ${c.numero}ª – ${esc(c.titulo.toUpperCase())}</p>${c.texto.split("\n").map((p) => `<p class="mb-1">${esc(p)}</p>`).join("")}${c.id === "horario" ? `<div class="overflow-x-auto"><table class="text-xs border mt-2"><thead><tr>${["Dias", "Entrada", "Intervalo", "Saída", "Horas"].map((h) => `<th class="border p-1.5 text-left">${h}</th>`).join("")}</tr></thead><tbody>${t.horario.map((h) => `<tr>${[h.rotulo, h.entrada, h.intervalo, h.saida, h.horas].map((v) => `<td class="border p-1.5">${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}`).join("")}<p class="mt-4">${esc(t.local)}</p></article>`;
  } catch (e) {
    alvo.textContent = e.message;
  }
}

async function baixar(state, env, formato, botao, status) {
  if (botao.disabled) return;
  if (env.planGate && !(await env.planGate("exportar"))) return;
  try {
    const { termos, titulo, aviso } = montar(state, env);
    botao.disabled = true;
    botao.dataset.loadingImmediate = "true";
    botao.dataset.loadingLabel = "Preparando termos aditivos";
    botao.setAttribute("aria-busy", "true");
    initLoading(env.document).refresh();
    await new Promise((r) => env.setTimeout(r, 60));
    const libs = await import("/assets/vendor/pdf.js");
    const { criarPdfTermo, criarDocxTermo } = await import("./termo-aditivo-documentos.js");
    const arquivos = Object.create(null);
    arquivos["LEIA-ME.txt"] = new TextEncoder().encode(`${titulo}\r\n\r\n${aviso}\r\n`);
    termos.forEach((t, i) => {
      const nome = `termo-aditivo-${nomeArquivo(t.nome)}-${i + 1}.${formato}`;
      arquivos[nome] = formato === "pdf" ? new Uint8Array(criarPdfTermo(t, titulo, libs)) : criarDocxTermo(t, titulo, libs);
    });
    const bytes = libs.zipSync(arquivos, { level: 0 });
    const url = env.URL.createObjectURL(new env.Blob([bytes], { type: "application/zip" }));
    const a = env.document.createElement("a");
    a.href = url;
    a.download = `${nomeArquivo(termos[0].empresa.nome).slice(0, 55)}-termos-aditivos-${formato === "pdf" ? "pdf" : "word"}.zip`;
    a.click();
    env.setTimeout(() => env.URL.revokeObjectURL(url), 10000);
    if (status) status.textContent = `Termos aditivos em ${formato === "pdf" ? "PDF" : "Word"} baixados: ${termos.length} colaborador(es), ${termos[0].clausulas.length} cláusula(s) no primeiro termo.`;
  } catch (e) {
    if (status) status.textContent = `Não foi possível preparar os termos aditivos: ${e.message}`;
    else await env.alert(`Não foi possível preparar os termos aditivos: ${e.message}`);
  } finally {
    botao.disabled = false;
    botao.removeAttribute("aria-busy");
    initLoading(env.document).refresh();
  }
}

/** Modal "Gerar termo aditivo": escolha das cláusulas e download em PDF ou Word. */
export function abrirModalTermo(state, env) {
  const { document } = env;
  const anterior = document.activeElement;
  // Confere a proposta antes de abrir, para avisar sem mostrar o modal vazio.
  try { montar(state, env); } catch (e) { return env.alert(e.message); }
  const escolhidas = new Set(clausulasEscolhidas(env));
  const dialog = document.createElement("dialog");
  dialog.className = "app-dialog termo-dialog no-print";
  dialog.dataset.termoModal = "";
  dialog.setAttribute("aria-labelledby", "termo-modal-titulo");
  const item = (c) => `<li><label class="termo-opcao"><input type="checkbox" data-termo-clausula="${c.id}"${c.obrigatoria || escolhidas.has(c.id) ? " checked" : ""}${c.obrigatoria ? " disabled" : ""}><span>${esc(c.titulo)}${c.obrigatoria ? ` <small>obrigatória</small>` : c.condicional ? ` <small>quando aplicável: ${esc(c.condicional)}</small>` : ""}</span></label></li>`;
  dialog.innerHTML = `<form method="dialog"><header><span class="app-dialog-symbol" aria-hidden="true">§</span><h2 id="termo-modal-titulo">Gerar termo aditivo</h2></header>
    <p class="termo-modal-intro">Escolha as cláusulas do termo. Um termo é gerado para cada colaborador da proposta, com as cláusulas numeradas na ordem abaixo, e todos vêm juntos em um arquivo ZIP. A escolha fica guardada neste navegador.</p>
    ${GRUPOS.map(([g, titulo, nota]) => `<fieldset class="termo-grupo"><legend>${titulo}</legend>${nota ? `<p class="termo-nota">${nota}</p>` : ""}${g === "complementar" ? `<div class="termo-atalhos"><button type="button" data-termo-todas>Marcar todas</button><button type="button" data-termo-nenhuma>Desmarcar todas</button></div>` : ""}<ul>${CATALOGO_CLAUSULAS.filter((c) => c.grupo === g).map(item).join("")}</ul></fieldset>`).join("")}
    <p class="termo-nota">Modelo de referência: confira com a assessoria jurídica e contábil e a convenção coletiva antes da assinatura. CPF, salário e campos em branco ficam para preenchimento.</p>
    <p class="termo-status" data-termo-status role="status" aria-live="polite"></p>
    <div class="app-dialog-actions"><button type="button" data-termo-fechar>Fechar</button><button type="button" data-export-termo="pdf">Baixar PDF</button><button type="button" data-export-termo="docx" data-dialog-accept>Baixar Word</button></div></form>`;
  const caixas = () => [...dialog.querySelectorAll("[data-termo-clausula]")];
  const salvar = () => {
    salvarEscolha(env, caixas().filter((x) => x.checked).map((x) => x.dataset.termoClausula));
    const previa = document.querySelector("[data-termo-previa]");
    if (previa?.open) renderPreviaTermo(state, env);
  };
  dialog.addEventListener("change", (e) => { if (e.target.matches("[data-termo-clausula]")) salvar(); });
  const marcar = (v) => { caixas().filter((x) => CATALOGO_CLAUSULAS.find((c) => c.id === x.dataset.termoClausula)?.grupo === "complementar").forEach((x) => (x.checked = v)); salvar(); };
  dialog.querySelector("[data-termo-todas]").addEventListener("click", () => marcar(true));
  dialog.querySelector("[data-termo-nenhuma]").addEventListener("click", () => marcar(false));
  const status = dialog.querySelector("[data-termo-status]");
  for (const b of dialog.querySelectorAll("[data-export-termo]"))
    b.addEventListener("click", () => baixar(state, env, b.dataset.exportTermo, b, status));
  const fechar = async () => {
    await closeDialog(dialog, { remove: true });
    if (anterior?.isConnected) anterior.focus({ preventScroll: true });
  };
  dialog.querySelector("[data-termo-fechar]").addEventListener("click", fechar);
  dialog.addEventListener("cancel", (e) => { e.preventDefault(); fechar(); });
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector("[data-termo-fechar]").focus({ preventScroll: true });
  return dialog;
}

export function bindTermoAditivoEvents(state, env) {
  const previa = env.document.querySelector("[data-termo-previa]");
  if (previa) previa.ontoggle = () => { if (previa.open) renderPreviaTermo(state, env); };
  const abrir = env.document.querySelector("[data-termo-abrir]");
  if (abrir) abrir.onclick = async () => {
    if (abrir.disabled) return;
    if (env.planGate && !(await env.planGate("exportar"))) return;
    abrirModalTermo(state, env);
  };
}
