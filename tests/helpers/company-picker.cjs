module.exports = async function selectCompany(page, id) {
  await page.locator("[data-company-trigger]").click();
  await page.locator(`[role="option"][data-company-id="${id}"]`).click();
};
