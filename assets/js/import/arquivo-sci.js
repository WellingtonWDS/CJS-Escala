import { MAX_SCI_BYTES, MAX_SCI_PAGINAS } from "./sci.js";

/** Lê o texto de um PDF localmente (pdf.js publicado em assets/vendor).
 * Retorna, por página, os trechos de texto com posição. Nenhum dado sai do navegador. */
export async function lerPdfSCI(buffer, carregar = carregarPdfjs) {
  if (buffer.byteLength > MAX_SCI_BYTES) throw new Error("O arquivo excede 5 MB.");
  const cabecalho = new TextDecoder().decode(new Uint8Array(buffer.slice(0, 5)));
  if (cabecalho !== "%PDF-") throw new Error("Selecione um arquivo PDF exportado da SCI.");
  const pdfjs = await carregar();
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false,
    disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  const documento = await tarefa.promise;
  try {
    if (documento.numPages > MAX_SCI_PAGINAS) throw new Error(`O PDF excede ${MAX_SCI_PAGINAS} páginas.`);
    const paginas = [];
    for (let n = 1; n <= documento.numPages; n++) {
      const pagina = await documento.getPage(n);
      const conteudo = await pagina.getTextContent();
      paginas.push(conteudo.items.filter((i) => "str" in i)
        .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5] })));
    }
    return paginas;
  } finally {
    await tarefa.destroy();
  }
}

async function carregarPdfjs() {
  const base = new URL("../../vendor/", import.meta.url);
  const pdfjs = await import(new URL("pdf.min.mjs", base).href);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.mjs", base).href;
  return pdfjs;
}
