export const MAX_DOMINIO_BYTES = 5 * 1024 * 1024;

// Relatórios BIFF8 da Domínio podem posicionar BLANKs antes do BOF da aba.
// Normaliza somente esse preâmbulo comprovado, sem reinterpretar células.
export function normalizarBiffDominio(bytes, XLSX) {
  if (bytes[0] !== 0xd0 || bytes[1] !== 0xcf) return bytes;
  const cfb = XLSX.CFB.read(bytes, { type: "array" });
  const entry = XLSX.CFB.find(cfb, "Workbook") || XLSX.CFB.find(cfb, "Book");
  if (!entry) return bytes;
  const stream = Uint8Array.from(entry.content),
    view = new DataView(stream.buffer);
  const bounds = [],
    sheets = [];
  let globalEnd = null,
    active = null;
  for (let p = 0; p + 4 <= stream.length; ) {
    const rec = view.getUint16(p, true),
      size = view.getUint16(p + 2, true);
    if (p + 4 + size > stream.length)
      throw new Error("Estrutura XLS incompleta.");
    if (rec === 0x85 && !globalEnd && size >= 8) bounds.push(p + 4);
    if (rec === 0x809 && size >= 4 && view.getUint16(p + 6, true) === 0x10) {
      active = { inicio: p };
      sheets.push(active);
    }
    if (rec === 0x0a) {
      if (active) {
        active.fim = p + 4;
        active = null;
      } else if (!globalEnd) globalEnd = p + 4;
    }
    p += size + 4;
    if (
      globalEnd &&
      bounds.length &&
      sheets.length === bounds.length &&
      sheets.every((s) => s.fim)
    )
      break;
  }
  if (
    !globalEnd ||
    bounds.length !== sheets.length ||
    !sheets.length ||
    sheets.some((s) => !s.fim)
  )
    return bytes;
  let previous = globalEnd,
    changed = false;
  for (let i = 0; i < sheets.length; i++) {
    const advertised = view.getUint32(bounds[i], true),
      sheet = sheets[i];
    if (advertised !== sheet.inicio) {
      if (advertised !== previous || advertised >= sheet.inicio) return bytes;
      for (let p = advertised; p < sheet.inicio; p += 10)
        if (
          p + 10 > sheet.inicio ||
          view.getUint16(p, true) !== 0x201 ||
          view.getUint16(p + 2, true) !== 6
        )
          return bytes;
      changed = true;
    }
    previous = sheet.fim;
  }
  if (!changed) return bytes;
  const fixed = new Uint8Array(
    globalEnd + sheets.reduce((s, a) => s + a.fim - a.inicio, 0),
  );
  fixed.set(stream.slice(0, globalEnd));
  const fixedView = new DataView(fixed.buffer);
  let pos = globalEnd;
  sheets.forEach((s, i) => {
    fixedView.setUint32(bounds[i], pos, true);
    fixed.set(stream.slice(s.inicio, s.fim), pos);
    pos += s.fim - s.inicio;
  });
  entry.content = Array.from(fixed);
  entry.size = fixed.length;
  return new Uint8Array(XLSX.CFB.write(cfb, { type: "array" }));
}

export async function lerArquivoDominio(buffer, leitor) {
  const bytes = new Uint8Array(buffer);
  if (!bytes.length || bytes.byteLength > MAX_DOMINIO_BYTES)
    throw new Error("Selecione uma planilha de até 5 MB.");
  const XLSX = leitor || (await import("../../vendor/xlsx.mjs"));
  const workbook = XLSX.read(normalizarBiffDominio(bytes, XLSX), {
    type: "array",
    cellDates: false,
    cellFormula: true,
  });
  if (!workbook.SheetNames?.length || workbook.SheetNames.length > 20)
    throw new Error("Planilha sem abas válidas ou com mais de 20 abas.");
  return workbook.SheetNames.map((nome) => {
    const sheet = workbook.Sheets?.[nome];
    if (!sheet?.["!ref"]) return { nome, linhas: [] };
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    if (range.e.r >= 10000 || range.e.c >= 200)
      throw new Error(
        "Planilha muito extensa: limite de 10 mil linhas e 200 colunas por aba.",
      );
    if (Object.values(sheet).some((c) => c?.f))
      throw new Error(
        "O relatório contém fórmulas. Exporte o Quadro de Horário de Trabalho com os valores originais da Domínio.",
      );
    return {
      nome,
      linhas: XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        raw: false,
        blankrows: true,
        range: { s: { r: 0, c: 0 }, e: range.e },
      }),
    };
  });
}
