import { montarTermosAditivos } from "./termo-aditivo.js";
import { nomeArquivo } from "./relatorio.js";
import { escapeHtml as esc } from "../shared/formatacao.js";
import { initLoading } from "../ui/loading.js";

const empresaAtual = (env) => env.document.querySelector("[data-current-company]")?.textContent?.replace("Nenhuma empresa selecionada", "").trim() || "";

/** Prévia do termo do primeiro colaborador, montada ao abrir o painel. */
export function renderPreviaTermo(state, env) {
  const alvo = env.document.querySelector("[data-termo-previa-conteudo]");
  if (!alvo) return;
  try {
    const { termos, titulo, aviso } = montarTermosAditivos(state, { empresa: empresaAtual(env), servidor: env.empresaServidor?.() });
    const t = termos[0];
    alvo.innerHTML = `<p class="text-xs text-slate-500 mb-2">${esc(aviso)}</p><p class="text-xs text-slate-500 mb-3">Prévia do termo de <b>${esc(t.nome)}</b>; os arquivos trazem um termo para cada um dos ${termos.length} colaborador(es).</p><article class="bg-white border border-slate-200 rounded-md p-4 text-sm leading-relaxed"><h4 class="font-semibold text-center mb-3">${esc(titulo)}</h4><p class="mb-3 text-justify">${esc(t.partes)}</p>${t.clausulas.map((c) => `<p class="font-semibold mt-3">CLÁUSULA ${c.numero}ª – ${esc(c.titulo.toUpperCase())}</p><p class="text-justify">${esc(c.texto)}</p>${c.titulo === "Horário de trabalho" ? `<div class="overflow-x-auto"><table class="text-xs border mt-2"><thead><tr>${["Dias", "Entrada", "Intervalo", "Saída", "Horas"].map((h) => `<th class="border p-1.5 text-left">${h}</th>`).join("")}</tr></thead><tbody>${t.horario.map((h) => `<tr>${[h.rotulo, h.entrada, h.intervalo, h.saida, h.horas].map((v) => `<td class="border p-1.5">${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}`).join("")}<p class="mt-4">${esc(t.local)}</p></article>`;
  } catch (e) {
    alvo.textContent = e.message;
  }
}

export function bindTermoAditivoEvents(state, env) {
  const previa = env.document.querySelector("[data-termo-previa]");
  if (previa) previa.ontoggle = () => { if (previa.open) renderPreviaTermo(state, env); };
  for (const button of env.document.querySelectorAll?.("[data-export-termo]") || [])
    button.onclick = async () => {
      if (button.disabled) return;
      if (env.planGate && !(await env.planGate("exportar"))) return;
      const formato = button.dataset.exportTermo;
      try {
        const { termos, titulo, aviso } = montarTermosAditivos(state, { empresa: empresaAtual(env), servidor: env.empresaServidor?.() });
        button.disabled = true;
        button.dataset.loadingImmediate = "true";
        button.dataset.loadingLabel = "Preparando termos aditivos";
        button.setAttribute("aria-busy", "true");
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
      } catch (e) {
        await env.alert(`Não foi possível preparar os termos aditivos: ${e.message}`);
      } finally {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        initLoading(env.document).refresh();
      }
    };
}
