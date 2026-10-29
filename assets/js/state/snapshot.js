// Lossless dictionary of repeated calculation data; configuration stays readable.
// No shared mutable references are introduced when restoring a snapshot.
const KEY = "resultadosCompactados";
export function compactarSnapshot(state) {
  if (!state || state[KEY] || (!state.escalaGerada && !state.conversao))
    return state;
  const nos = [],
    indices = new Map();
  function intern(v) {
    const node = Array.isArray(v)
      ? [1, v.map(intern)]
      : v && typeof v === "object"
        ? [
            0,
            Object.entries(v)
              .filter(([, x]) => x !== undefined)
              .flatMap(([k, x]) => [intern(k), intern(x)]),
          ]
        : v;
    const signature = JSON.stringify(node);
    if (indices.has(signature)) return indices.get(signature);
    const id = nos.length;
    nos.push(node);
    indices.set(signature, id);
    return id;
  }
  const resultados = JSON.parse(
    JSON.stringify({
      escalaGerada: state.escalaGerada,
      conversao: state.conversao,
    }),
  );
  const raiz = intern(resultados);
  const packed = {
    ...state,
    ...Object.fromEntries(Object.keys(resultados).map((k) => [k, null])),
    [KEY]: { versao: 1, raiz, nos },
  };
  return JSON.stringify(packed).length < JSON.stringify(state).length
    ? packed
    : state;
}
export function expandirSnapshot(state) {
  if (!state?.[KEY]) return state;
  const { versao, raiz, nos } = state[KEY];
  if (versao !== 1 || !Array.isArray(nos) || nos.length > 1000000)
    throw Error("Resultados salvos em formato inválido.");
  let entries = 0,
    chars = 0;
  function expand(id, depth = 0) {
    if (
      !Number.isInteger(id) ||
      id < 0 ||
      id >= nos.length ||
      depth > 200 ||
      ++entries > 3000000
    )
      throw Error("Resultados salvos excedem os limites de leitura.");
    const n = nos[id];
    if (!Array.isArray(n)) {
      if (n !== null && !["string", "number", "boolean"].includes(typeof n))
        throw Error("Resultado salvo inválido.");
      chars += typeof n === "string" ? n.length : 8;
      if (chars > 64 * 1024 * 1024)
        throw Error("Resultados salvos excedem os limites de leitura.");
      return n;
    }
    if (n.length !== 2 || ![0, 1].includes(n[0]) || !Array.isArray(n[1]))
      throw Error("Resultado salvo inválido.");
    if (n[0] === 1) return n[1].map((x) => expand(x, depth + 1));
    if (n[1].length % 2) throw Error("Resultado salvo inválido.");
    const result = {};
    for (let i = 0; i < n[1].length; i += 2) {
      const key = expand(n[1][i], depth + 1);
      if (
        typeof key !== "string" ||
        ["__proto__", "prototype", "constructor"].includes(key)
      )
        throw Error("Chave inválida no resultado salvo.");
      result[key] = expand(n[1][i + 1], depth + 1);
    }
    return result;
  }
  const result = expand(raiz);
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    Object.keys(result).some((k) => !["escalaGerada", "conversao"].includes(k))
  )
    throw Error("Resultados salvos inválidos.");
  const copy = { ...state, ...result };
  delete copy[KEY];
  return copy;
}
