/** Fluxo máximo determinístico: uma capacidade de pessoa não é duplicada por habilitação. */
export function criarFluxo() {
  const adj = [];
  const no = () => {
    adj.push([]);
    return adj.length - 1;
  };
  const ligar = (a, b, cap) => {
    if (!(cap > 0)) return;
    const ida = { destino: b, cap, reversa: adj[b].length },
      volta = { destino: a, cap: 0, reversa: adj[a].length };
    adj[a].push(ida);
    adj[b].push(volta);
  };
  function maximo(origem, destino) {
    let total = 0;
    while (true) {
      const nivel = Array(adj.length).fill(-1),
        fila = [origem];
      nivel[origem] = 0;
      for (let i = 0; i < fila.length; i++)
        for (const e of adj[fila[i]])
          if (e.cap > 1e-7 && nivel[e.destino] < 0) {
            nivel[e.destino] = nivel[fila[i]] + 1;
            fila.push(e.destino);
          }
      if (nivel[destino] < 0) break;
      const indice = Array(adj.length).fill(0);
      function enviar(atual, valor) {
        if (atual === destino) return valor;
        for (; indice[atual] < adj[atual].length; indice[atual]++) {
          const e = adj[atual][indice[atual]];
          if (e.cap <= 1e-7 || nivel[e.destino] !== nivel[atual] + 1) continue;
          const recebido = enviar(e.destino, Math.min(valor, e.cap));
          if (recebido > 1e-7) {
            e.cap -= recebido;
            adj[e.destino][e.reversa].cap += recebido;
            return recebido;
          }
        }
        return 0;
      }
      let valor;
      while ((valor = enviar(origem, Number.MAX_SAFE_INTEGER)) > 1e-7)
        total += valor;
    }
    return total;
  }
  return { no, ligar, maximo };
}
