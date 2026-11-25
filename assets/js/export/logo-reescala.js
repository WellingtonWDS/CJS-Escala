/** Logomarca do Reescala (PNG 3:1) para os relatórios PDF. */
export async function carregarLogoReescala(document = globalThis.document) {
  const img = new Image();
  img.src = "/logos/Reescala_original_transparente.png";
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 630;
  canvas.height = 210;
  const ctx = canvas.getContext("2d");
  const ratio = Math.min(630 / img.width, 210 / img.height);
  ctx.drawImage(img, (630 - img.width * ratio) / 2, (210 - img.height * ratio) / 2, img.width * ratio, img.height * ratio);
  return canvas.toDataURL("image/png");
}
