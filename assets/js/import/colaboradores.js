export const MAX_COLABORADORES = 500;
export const MAX_ARQUIVO_BYTES = 1024 * 1024;
const CABECALHO = ["Nome", "Sexo", "Cargo / função", "Horas semanais"];
const normalizar = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const CAMPOS = {
  nome: "nome",
  sexo: "sexo",
  cargo: "cargo",
  funcao: "cargo",
  cargofuncao: "cargo",
  horassemanais: "horasSemana",
  horassemana: "horasSemana",
};

export function gerarModeloColaboradores() {
  return "\uFEFF" + CABECALHO.join(";") + "\r\n";
}

export function decodificarPlanilha(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function lerCsv(text, separator, offset) {
  const rows = [];
  let cells = [],
    value = "",
    quoted = false,
    closed = false,
    line = offset + 1,
    start = line;
  const field = () => {
    cells.push(value.trim());
    value = "";
    closed = false;
  };
  const row = () => {
    field();
    if (cells.some(Boolean)) rows.push({ cells, linha: start });
    cells = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        value += char;
        if (char === "\n" || (char === "\r" && text[i + 1] !== "\n")) line++;
      }
    } else if (char === separator) field();
    else if (char === "\n" || char === "\r") {
      row();
      if (char === "\r" && text[i + 1] === "\n") i++;
      line++;
      start = line;
    } else if (char === '"' && !value.trim() && !closed) {
      value = "";
      quoted = true;
    } else if (char === '"' || (closed && char.trim()))
      throw new Error(
        `Linha ${line}: aspas inválidas. Salve novamente como CSV.`,
      );
    else if (!closed) value += char;
    if (rows.length > MAX_COLABORADORES + 1)
      throw new Error(
        `O arquivo deve conter no máximo ${MAX_COLABORADORES} colaboradores.`,
      );
  }
  if (quoted) throw new Error(`Linha ${start}: campo com aspas não fechadas.`);
  row();
  return rows;
}

export function analisarPlanilhaColaboradores(source) {
  const erros = [],
    colaboradores = [];
  if (typeof source !== "string" || source.length > MAX_ARQUIVO_BYTES)
    return {
      colaboradores,
      erros: ["O arquivo está vazio ou excede o limite de 1 MB."],
    };
  let text = source.replace(/^\uFEFF/, "");
  let offset = 0,
    separator;
  const sep = text.match(/^sep=([;,\t])\r?\n/i);
  if (sep) {
    separator = sep[1];
    text = text.slice(sep[0].length);
    offset = 1;
  }
  if (!separator) {
    const header = text.trimStart().split(/[\r\n]/)[0];
    separator = [";", ",", "\t"].sort(
      (a, b) => header.split(b).length - header.split(a).length,
    )[0];
  }
  let rows;
  try {
    rows = lerCsv(text, separator, offset);
  } catch (error) {
    return { colaboradores, erros: [error.message] };
  }
  const header = rows.shift();
  const fields = header?.cells.map((cell) =>
    Object.hasOwn(CAMPOS, normalizar(cell))
      ? CAMPOS[normalizar(cell)]
      : undefined,
  );
  if (
    !fields ||
    fields.length !== 4 ||
    fields.some((field) => !field) ||
    new Set(fields).size !== 4
  ) {
    return {
      colaboradores,
      erros: [
        "Cabeçalho inválido. Use as quatro colunas do modelo: Nome, Sexo, Cargo / função e Horas semanais.",
      ],
    };
  }
  if (!rows.length)
    erros.push(
      "Preencha pelo menos um colaborador a partir da segunda linha da planilha.",
    );
  if (rows.length > MAX_COLABORADORES)
    erros.push(
      `O arquivo deve conter no máximo ${MAX_COLABORADORES} colaboradores.`,
    );
  for (const { cells, linha } of rows) {
    if (cells.length !== fields.length) {
      erros.push(
        `Linha ${linha}: esperadas quatro colunas; recebidas ${cells.length}.`,
      );
      continue;
    }
    const person = Object.fromEntries(
      fields.map((field, i) => [field, cells[i].replace(/\s+/g, " ").trim()]),
    );
    for (const [field, title] of [
      ["nome", "Nome"],
      ["cargo", "Cargo / função"],
    ]) {
      if (
        !person[field] ||
        person[field].length > 120 ||
        /[\x00-\x1f\x7f]/.test(person[field])
      )
        erros.push(
          `Linha ${linha}: ${title} é obrigatório e deve ter até 120 caracteres, sem caracteres de controle.`,
        );
    }
    const sex = normalizar(person.sexo);
    person.sexo = ["f", "feminino"].includes(sex)
      ? "feminino"
      : ["m", "masculino"].includes(sex)
        ? "masculino"
        : undefined;
    if (!person.sexo)
      erros.push(
        `Linha ${linha}: informe Feminino ou Masculino na coluna Sexo (F/M também são aceitos).`,
      );
    const hours = person.horasSemana.replace(",", ".");
    person.horasSemana = Number(hours);
    if (
      !/^\d+(?:\.\d+)?$/.test(hours) ||
      person.horasSemana < 1 ||
      person.horasSemana > 44 ||
      !Number.isInteger(person.horasSemana * 2)
    )
      erros.push(
        `Linha ${linha}: Horas semanais deve ser um número de 1 a 44, em múltiplos de 0,5 (por exemplo, 40 ou 42,5).`,
      );
    colaboradores.push(person);
  }
  return { colaboradores: erros.length ? [] : colaboradores, erros };
}

export function prepararImportacao(state, colaboradores, modo) {
  if (!["adicionar", "substituir"].includes(modo))
    throw new Error("Escolha adicionar ou substituir o cadastro.");
  if (!colaboradores.length)
    throw new Error("Nenhum colaborador válido para importar.");
  const atuais = modo === "adicionar" ? state.colaboradores : [];
  if (atuais.length + colaboradores.length > MAX_COLABORADORES)
    throw new Error(
      `O cadastro resultante não pode ultrapassar ${MAX_COLABORADORES} colaboradores.`,
    );
  let proximoId = Math.max(
    1,
    Number.isSafeInteger(state.proximoId) ? state.proximoId : 1,
    ...state.colaboradores.map((c) =>
      Number.isSafeInteger(c.id) ? c.id + 1 : 1,
    ),
  );
  const novos = colaboradores.map((c) => ({ ...c, id: proximoId++ }));
  return { colaboradores: [...atuais, ...novos], proximoId };
}
