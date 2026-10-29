import { prepararRelatorio, nomeArquivo } from "./relatorio.js";
import { criarPdf } from "./pdf.js";
import { initLoading } from "../ui/loading.js";
async function carregarLogo() {
  const img = new Image();
  img.src = "/logos/Reescala_original_transparente.png";
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 630;
  canvas.height = 210;
  const ctx = canvas.getContext("2d");
  const ratio = Math.min(630 / img.width, 210 / img.height);
  ctx.drawImage(
    img,
    (630 - img.width * ratio) / 2,
    (210 - img.height * ratio) / 2,
    img.width * ratio,
    img.height * ratio,
  );
  return canvas.toDataURL("image/png");
}
export function bindPdfEvents(state, env) {
  for (const button of env.document.querySelectorAll?.("[data-export-pdf]") ||
    [])
    button.onclick = async () => {
      if (button.disabled) return;
      try {
        const rel = prepararRelatorio(state, {
          proposta: button.dataset.origem === "proposta",
          empresa: env.document
            .querySelector("[data-current-company]")
            ?.textContent?.replace("Nenhuma empresa selecionada", ""),
        });
        button.disabled = true;
        button.dataset.loadingImmediate = "true";
        button.dataset.loadingLabel = "Preparando documentos PDF";
        button.setAttribute("aria-busy", "true");
        initLoading(env.document).refresh();
        await new Promise((r) => env.setTimeout(r, 60));
        const libs = await import("/assets/vendor/pdf.js"),
          logo = await carregarLogo();
        const prefix = `${nomeArquivo(rel.empresa).slice(0, 55)}-${nomeArquivo(rel.tipo)}-${rel.fixa ? `fixa-${rel.config.dataReferenciaFixa}` : `${rel.config.ano}-${String(rel.config.mes + 1).padStart(2, "0")}`}`;
        const lote = button.dataset.exportPdf === "colaboradores";
        let bytes;
        if (lote) {
          const arquivos = Object.create(null);
          for (let i = 0; i < rel.pessoas.length; i++) {
            const p = rel.pessoas[i];
            arquivos[
              `${prefix}-${nomeArquivo(p.nome)}-${nomeArquivo(p.id)}-${i + 1}.pdf`
            ] = await criarPdf(rel, [p], { libs, logo });
            await new Promise((r) => env.setTimeout(r, 0));
          }
          bytes = libs.zipSync(arquivos, { level: 0 });
        } else
          bytes = await criarPdf(rel, rel.pessoas, {
            libs,
            logo,
            empregador: true,
          });
        const url = env.URL.createObjectURL(
          new env.Blob([bytes], {
            type: lote ? "application/zip" : "application/pdf",
          }),
        );
        const a = env.document.createElement("a");
        a.href = url;
        a.download = `${prefix}${lote ? "-colaboradores.zip" : ".pdf"}`;
        a.click();
        env.setTimeout(() => env.URL.revokeObjectURL(url), 10000);
      } catch (e) {
        await env.alert(`Não foi possível exportar: ${e.message}`);
      } finally {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        initLoading(env.document).refresh();
      }
    };
}
