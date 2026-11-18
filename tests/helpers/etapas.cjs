// Navega pelos mesmos links disponíveis ao usuário antes de operar um campo.
async function irParaEtapa(page, seletor) {
  const campo = page.locator(seletor).first();
  if (!(await campo.count())) return;
  const painel = await campo.evaluate(
    (el) => el.closest("main > section[data-etapa]")?.id,
  );
  if (!painel) return;
  const link = page.locator(`[data-etapa-link="${painel}"]`);
  if ((await link.getAttribute("aria-current")) !== "step") await link.click();
  const atual=page.locator('#escala-atual-previa');
  if(await atual.count() && await campo.evaluate(el=>!!el.closest('#escala-atual-previa')) && !(await atual.evaluate(el=>el.open)))
    await atual.locator('> summary').click();
}
module.exports = { irParaEtapa };
