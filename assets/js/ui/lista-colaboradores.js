export function mostrarColaboradores(document, mensagem) {
  for (const id of ["importacao-colaboradores", "importacao-dominio"])
    document.getElementById(id).open = false;
  document.getElementById("colaboradores-mensagem").textContent = mensagem;
  const lista = document.getElementById("colaboradores-cadastrados");
  lista.focus({ preventScroll: true });
  lista.scrollIntoView({ behavior: "smooth", block: "start" });
}
