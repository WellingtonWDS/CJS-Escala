/* Painel "Conferência com o diagnóstico da empresa" (etapa de conversão): carrega os
 * diagnósticos da empresa aberta no servidor e confere o escolhido com a proposta. */
import { conferirDiagnostico } from "../diagnostico/conferencia.js";
import { createDiagnosticsService } from "../services/diagnostics.js";
import { escapeHtml as esc } from "../shared/formatacao.js";

const ROTULOS = { divergencia: "Divergência", alerta: "Alerta", conferir: "Conferir", ok: "Coerente" };
const dataBr = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");

export function bindConferenciaDiagnostico(state, env, service = createDiagnosticsService()) {
  const painel = env.document.querySelector("[data-diag-conferencia]");
  if (!painel) return;
  const alvo = painel.querySelector("[data-diag-conferencia-conteudo]");
  let lista = null, contexto = null, escolhido = null, geracao = 0;

  const resultadoHtml = (registro, r) => {
    const resumo = ["divergencia", "alerta", "conferir", "ok"].filter((n) => r.contagem[n])
      .map((n) => `<span class="conf-selo" data-nivel="${n}">${r.contagem[n]} ${{ divergencia: ["divergência", "divergências"], alerta: ["alerta", "alertas"], conferir: ["a conferir", "a conferir"], ok: ["coerente", "coerentes"] }[n][r.contagem[n] > 1 ? 1 : 0]}</span>`).join("");
    const pendencias = Object.values(registro.data?.answers || {}).filter((a) => a?.certainty === "pendente").length;
    return `<p class="conf-nota">Diagnóstico <b>${esc(registro.unit || registro.data?.answers?.q02?.value || "")}</b> · ${registro.status === "concluido" ? "concluído" : "rascunho"} · revisão ${esc(registro.revision)} · ${esc(dataBr(registro.updatedAt))}, conferido com a ${r.escala === "proposta" ? "proposta 5×2" : "escala atual"}.${registro.status !== "concluido" || pendencias ? ` <b>Atenção:</b> ${registro.status !== "concluido" ? "diagnóstico ainda em rascunho" : ""}${registro.status !== "concluido" && pendencias ? "; " : ""}${pendencias ? `${pendencias} resposta(s) pendentes de conferência` : ""}.` : ""}</p>
      <div class="conf-resumo">${resumo || '<span class="conf-selo">Nenhuma resposta verificável</span>'}</div>
      <ul class="conf-lista">${r.itens.map((i) => `<li data-nivel="${i.nivel}"><span class="conf-nivel">${ROTULOS[i.nivel]}</span><div><p class="conf-titulo">${esc(i.titulo)}${i.certeza ? ` <small>resposta: ${esc(i.certeza.toLowerCase())}</small>` : ""}</p><p>${esc(i.detalhe)}</p></div></li>`).join("")}</ul>
      <p class="conf-nota">A conferência lê as respostas estruturadas do diagnóstico (funcionamento, mínimo por função, alterações aceitas, ACT/CCT, prioridades e equipe). Respostas em texto livre aparecem como “Conferir”. Não altera a escala nem o diagnóstico.</p>`;
  };

  async function conferir() {
    const atual = ++geracao;
    if (!escolhido) return;
    const saida = alvo.querySelector("[data-conf-resultado]");
    saida.innerHTML = '<p class="conf-nota">Conferindo…</p>';
    try {
      const registro = await service.get({ ...contexto, id: escolhido });
      if (atual !== geracao) return;
      saida.innerHTML = resultadoHtml(registro, conferirDiagnostico(registro.data, state));
    } catch (e) {
      if (atual === geracao) saida.innerHTML = `<p class="conf-nota">${esc(e.message || "Não foi possível conferir.")}</p>`;
    }
  }

  async function abrir() {
    contexto = env.contextoServidor?.() || null;
    if (!contexto?.companyId) {
      alvo.innerHTML = '<p class="conf-nota">Abra a empresa pelo servidor (tela Empresas) para conferir a proposta com o diagnóstico dela.</p>';
      return;
    }
    alvo.innerHTML = '<p class="conf-nota">Carregando diagnósticos da empresa…</p>';
    try {
      lista = await service.list({ officeId: contexto.officeId, companyId: contexto.companyId });
    } catch (e) {
      alvo.innerHTML = `<p class="conf-nota">${esc(e.status === 403 ? "Somente Gerente e Admin consultam o diagnóstico da empresa." : e.message || "Não foi possível carregar os diagnósticos.")}</p>`;
      return;
    }
    if (!lista.length) {
      alvo.innerHTML = '<p class="conf-nota">Nenhum diagnóstico registrado para esta empresa. Crie um em Empresas → Diagnóstico.</p>';
      return;
    }
    if (!lista.some((d) => d.id === escolhido)) escolhido = (lista.find((d) => d.status === "concluido") || lista[0]).id;
    alvo.innerHTML = `<div class="conf-topo">${lista.length > 1 ? `<label>Diagnóstico<select data-conf-escolha>${lista.map((d) => `<option value="${esc(d.id)}"${d.id === escolhido ? " selected" : ""}>${esc(d.unit)} · ${d.status === "concluido" ? "concluído" : "rascunho"} · ${esc(dataBr(d.updatedAt))}</option>`).join("")}</select></label>` : ""}<button type="button" data-conf-repetir>Conferir novamente</button></div><div data-conf-resultado></div>`;
    alvo.querySelector("[data-conf-escolha]")?.addEventListener("change", (e) => { escolhido = e.target.value; conferir(); });
    alvo.querySelector("[data-conf-repetir]").addEventListener("click", conferir);
    await conferir();
  }
  painel.ontoggle = () => { if (painel.open) abrir(); };
}
