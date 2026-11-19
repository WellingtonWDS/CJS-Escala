/* Marca do escritório (Gerente/Admin): logomarca, cores e nome exibidos nos
 * relatórios PDF. A imagem é convertida no navegador para PNG de até 1200×400 px. */
import { createBrandingService } from "../services/branding.js";
import { closeDialog } from "./motion.js";
import { COR_PRIMARIA_PADRAO, COR_SECUNDARIA_PADRAO, temaPdf, rgb, contraste } from "../export/marca-pdf.js";

export const MARCA_LIMITES = { bytes: 2 * 1024 * 1024, minLargura: 300, maxLargura: 1200, maxAltura: 400, maxChars: 700000 };
const TIPOS = ["image/png", "image/jpeg", "image/webp"];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const css = (c) => `rgb(${c.join(",")})`;

/** Lê o arquivo e devolve PNG normalizado {logo, largura, altura, aviso}. */
export async function normalizarLogo(file, { document = globalThis.document } = {}) {
  if (!file) throw Error("Selecione um arquivo de imagem.");
  if (!TIPOS.includes(file.type)) throw Error("Formato não aceito. Envie PNG, JPG ou WebP (SVG e PDF não são aceitos).");
  if (file.size > MARCA_LIMITES.bytes) throw Error("O arquivo passa de 2 MB. Exporte a logomarca em tamanho menor.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { throw Error("Não foi possível ler a imagem. Confira se o arquivo não está corrompido."); }
    const { naturalWidth: w0, naturalHeight: h0 } = img;
    if (!w0 || !h0) throw Error("Imagem sem dimensões válidas.");
    let escala = Math.min(1, MARCA_LIMITES.maxLargura / w0, MARCA_LIMITES.maxAltura / h0);
    const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
    let logo = "";
    for (let i = 0; i < 6; i++) {
      canvas.width = Math.max(1, Math.round(w0 * escala));
      canvas.height = Math.max(1, Math.round(h0 * escala));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      logo = canvas.toDataURL("image/png");
      if (logo.length <= MARCA_LIMITES.maxChars) break;
      escala *= 0.8;
    }
    if (logo.length > MARCA_LIMITES.maxChars) throw Error("A imagem continua grande demais. Use uma versão mais simples da logomarca.");
    const avisos = [];
    if (w0 < MARCA_LIMITES.minLargura) avisos.push(`A imagem tem ${w0} px de largura; abaixo de ${MARCA_LIMITES.minLargura} px ela pode ficar serrilhada no PDF.`);
    if (h0 > w0 * 1.2) avisos.push("Logomarcas horizontais ficam melhores no cabeçalho do relatório.");
    if (file.type === "image/jpeg") avisos.push("JPG não tem fundo transparente: o fundo da imagem aparecerá no relatório.");
    return { logo, largura: canvas.width, altura: canvas.height, aviso: avisos.join(" ") };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function openOfficeBranding({ document, window, offices, service = createBrandingService(), onSaved = () => {} }) {
  const dialog = document.createElement("dialog");
  dialog.className = "app-dialog marca-dialog no-print";
  dialog.setAttribute("aria-labelledby", "marca-titulo");
  dialog.dataset.loadingLabel = "Salvando a marca do escritório";
  dialog.innerHTML = `<form method="dialog" class="marca-form" novalidate>
    <header class="marca-topo"><div><p class="marca-sobretitulo">Relatórios</p><h2 id="marca-titulo">Marca do escritório</h2><p>A logomarca e as cores aparecem no cabeçalho dos relatórios PDF. O rodapé indica que o relatório foi elaborado no Reescala.</p></div><button type="button" class="marca-fechar" data-marca-fechar aria-label="Fechar">×</button></header>
    <label class="marca-escritorio" ${offices.length > 1 ? "" : "hidden"}>Escritório<select data-marca-office>${offices.map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join("")}</select></label>
    <div class="marca-grade">
      <div class="marca-campos">
        <section><h3>Logomarca</h3>
          <div class="marca-logo-atual" data-marca-logo-box><img data-marca-logo alt="Logomarca atual do escritório" hidden><span data-marca-sem-logo>Nenhuma logomarca enviada.</span></div>
          <div class="marca-acoes"><label class="marca-upload">Enviar imagem<input type="file" data-marca-arquivo accept="image/png,image/jpeg,image/webp"></label><button type="button" data-marca-remover hidden>Remover logomarca</button></div>
          <details class="marca-instrucoes" open><summary>Orientações para a imagem</summary><ul>
            <li><b>Formato:</b> PNG com fundo transparente (recomendado), JPG ou WebP. SVG e PDF não são aceitos.</li>
            <li><b>Tamanho do arquivo:</b> até 2 MB.</li>
            <li><b>Dimensões:</b> logomarca horizontal, proporção próxima de 3:1. Mínimo de ${MARCA_LIMITES.minLargura} px de largura; ideal 1200 × 400 px.</li>
            <li><b>Recorte:</b> sem margens vazias ao redor; a imagem é ajustada automaticamente para até 1200 × 400 px.</li>
            <li><b>Cores:</b> prefira a versão da logomarca para fundo claro; o cabeçalho do relatório é branco.</li></ul></details>
          <p class="marca-aviso" data-marca-aviso role="status" aria-live="polite"></p></section>
        <section><h3>Nome exibido</h3><label>Nome do escritório no relatório (opcional)<input data-marca-nome maxlength="160" placeholder="Usado no rodapé e quando não houver logomarca" autocomplete="organization"></label></section>
        <section><h3>Cores da marca</h3>
          <div class="marca-cores">
            <label>Cor principal<span class="marca-cor"><input type="color" data-marca-cor="primaryColor"><input data-marca-hex="primaryColor" maxlength="7" spellcheck="false" aria-label="Cor principal em hexadecimal"></span><small>Faixa do topo, títulos e cabeçalho das tabelas.</small></label>
            <label>Cor de destaque<span class="marca-cor"><input type="color" data-marca-cor="secondaryColor"><input data-marca-hex="secondaryColor" maxlength="7" spellcheck="false" aria-label="Cor de destaque em hexadecimal"></span><small>Linhas de folga e destaques.</small></label>
          </div>
          <p class="marca-aviso" data-marca-contraste></p>
          <button type="button" class="marca-link" data-marca-padrao>Restaurar cores padrão</button></section>
      </div>
      <figure class="marca-previa" aria-label="Prévia do cabeçalho do relatório"><figcaption>Prévia do relatório</figcaption>
        <div class="marca-folha" data-marca-folha><div class="marca-faixa"></div>
          <div class="marca-cab"><div><strong data-previa-titulo>Escala da proposta 5×2 • Equipe completa</strong><span>Empresa de exemplo — 00.000.000/0001-91</span><span>Dezembro de 2026</span></div><div class="marca-cab-logo" data-previa-logo></div></div>
          <table><thead><tr><th>Dia</th><th>Situação</th><th>Entrada</th><th>Saída</th></tr></thead><tbody><tr><td>Seg 07/12</td><td>Trabalho</td><td>08:00</td><td>17:24</td></tr><tr data-previa-folga><td>Dom 13/12</td><td>Folga</td><td>—</td><td>—</td></tr></tbody></table>
          <div class="marca-rodape"><img src="/logos/Reescala_original_transparente.png" alt="" width="36" height="12"><span data-previa-rodape>Elaborado no Reescala • Emitido em 19/11/2026</span></div></div></figure>
    </div>
    <p class="marca-status" data-marca-status role="status" aria-live="polite"></p>
    <div class="app-dialog-actions"><button type="button" data-marca-fechar>Cancelar</button><button type="button" data-dialog-accept data-marca-salvar>Salvar marca</button></div>
  </form>`;
  document.body.append(dialog);
  const $ = (s) => dialog.querySelector(s);
  let atual = null, estado = null, busy = false;

  function render() {
    if (!estado) return;
    const tema = temaPdf(estado);
    for (const k of ["primaryColor", "secondaryColor"]) {
      dialog.querySelector(`[data-marca-cor="${k}"]`).value = estado[k];
      const hex = dialog.querySelector(`[data-marca-hex="${k}"]`);
      if (document.activeElement !== hex) hex.value = estado[k];
    }
    if (document.activeElement !== $("[data-marca-nome]")) $("[data-marca-nome]").value = estado.displayName || "";
    const img = $("[data-marca-logo]");
    img.hidden = !estado.logo;
    if (estado.logo) img.src = estado.logo;
    $("[data-marca-sem-logo]").hidden = !!estado.logo;
    $("[data-marca-remover]").hidden = !estado.logo;
    const folha = $("[data-marca-folha]");
    folha.style.setProperty("--marca-primaria", css(tema.primaria));
    folha.style.setProperty("--marca-titulo", css(tema.titulo));
    folha.style.setProperty("--marca-cab-texto", css(tema.cabecalhoTabela.text));
    folha.style.setProperty("--marca-folga", css(tema.folga));
    folha.style.setProperty("--marca-folga-texto", css(tema.textoFolga));
    $("[data-previa-logo]").innerHTML = estado.logo
      ? `<img src="${esc(estado.logo)}" alt="Logomarca na prévia">`
      : estado.displayName ? `<b>${esc(estado.displayName)}</b>` : `<img src="/logos/Reescala_original_transparente.png" alt="Logomarca padrão do Reescala">`;
    $("[data-previa-rodape]").textContent = `${estado.displayName ? `${estado.displayName} • ` : ""}Elaborado no Reescala • Emitido em ${new Date().toLocaleDateString("pt-BR")}`;
    const p = rgb(estado.primaryColor);
    $("[data-marca-contraste]").textContent = p && contraste(p, [255, 255, 255]) < 4.5
      ? "A cor principal é clara: os títulos usarão um tom mais escuro dela para manter a leitura."
      : "";
  }
  async function carregar(officeId) {
    $("[data-marca-status]").textContent = "Carregando a marca…";
    atual = await service.get(officeId);
    estado = { displayName: atual.displayName || "", logo: atual.logo || null, logoWidth: atual.logoWidth ?? null, logoHeight: atual.logoHeight ?? null,
      primaryColor: atual.primaryColor || COR_PRIMARIA_PADRAO, secondaryColor: atual.secondaryColor || COR_SECUNDARIA_PADRAO };
    $("[data-marca-aviso]").textContent = "";
    $("[data-marca-status]").textContent = atual.pending ? "A marca do escritório ainda não está disponível no servidor (migração 012)." : "";
    $("[data-marca-salvar]").disabled = !!atual.pending || atual.canEdit === false;
    render();
  }
  async function fechar() {
    await closeDialog(dialog, { remove: true });
  }
  dialog.addEventListener("cancel", (e) => { e.preventDefault(); if (!busy) fechar(); });
  dialog.querySelectorAll("[data-marca-fechar]").forEach((b) => b.addEventListener("click", () => !busy && fechar()));
  $("[data-marca-office]").addEventListener("change", (e) => carregar(e.target.value).catch((err) => ($("[data-marca-status]").textContent = err.message)));
  $("[data-marca-arquivo]").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const r = await normalizarLogo(file, { document });
      Object.assign(estado, { logo: r.logo, logoWidth: r.largura, logoHeight: r.altura });
      $("[data-marca-aviso]").textContent = r.aviso || `Imagem ajustada para ${r.largura} × ${r.altura} px. Confira a prévia e salve.`;
      render();
    } catch (err) {
      $("[data-marca-aviso]").textContent = err.message;
    }
  });
  $("[data-marca-remover]").addEventListener("click", () => {
    Object.assign(estado, { logo: null, logoWidth: null, logoHeight: null });
    $("[data-marca-aviso]").textContent = "Logomarca removida da prévia. Salve para confirmar.";
    render();
  });
  dialog.querySelectorAll("[data-marca-cor]").forEach((input) => input.addEventListener("input", () => { estado[input.dataset.marcaCor] = input.value.toLowerCase(); render(); }));
  dialog.querySelectorAll("[data-marca-hex]").forEach((input) => input.addEventListener("input", () => {
    const v = input.value.trim().toLowerCase().replace(/^([0-9a-f]{6})$/, "#$1");
    if (/^#[0-9a-f]{6}$/.test(v)) { estado[input.dataset.marcaHex] = v; render(); }
  }));
  $("[data-marca-nome]").addEventListener("input", (e) => { estado.displayName = e.target.value; render(); });
  $("[data-marca-padrao]").addEventListener("click", () => { estado.primaryColor = COR_PRIMARIA_PADRAO; estado.secondaryColor = COR_SECUNDARIA_PADRAO; render(); });
  $("[data-marca-salvar]").addEventListener("click", async () => {
    if (busy || !atual) return;
    busy = true;
    dialog.setAttribute("aria-busy", "true");
    $("[data-marca-status]").textContent = "Salvando…";
    try {
      const salvo = await service.save({ officeId: atual.officeId, revision: atual.revision, displayName: estado.displayName.trim() || null, logo: estado.logo,
        logoWidth: estado.logo ? estado.logoWidth : null, logoHeight: estado.logo ? estado.logoHeight : null, primaryColor: estado.primaryColor, secondaryColor: estado.secondaryColor });
      atual = salvo;
      $("[data-marca-status]").textContent = "Marca salva. Os próximos relatórios deste escritório já usam a logomarca e as cores.";
      window.dispatchEvent(new window.CustomEvent("cjs-brand-changed", { detail: { officeId: salvo.officeId } }));
      onSaved(salvo);
    } catch (err) {
      $("[data-marca-status]").textContent = err.message;
    } finally {
      busy = false;
      dialog.removeAttribute("aria-busy");
    }
  });
  dialog.showModal();
  carregar($("[data-marca-office]").value).catch((err) => ($("[data-marca-status]").textContent = err.message));
  return dialog;
}
