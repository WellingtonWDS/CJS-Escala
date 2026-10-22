const assert = require("node:assert/strict");
const { pbkdf2Sync } = require("node:crypto");
const path = require("node:path");
const { chromium } = require("playwright");
(async () => {
  const { createDevServer } = await import("../scripts/serve.js");
  const { SESSION_MS } = await import("../server/auth.js");
  let now = Date.now();
  const env = {
    AUTH_SESSION_SECRET: "browser-test-secret-32-characters-long",
    AUTH_PASSWORD_HASH: pbkdf2Sync(
      "test-password",
      "cjs-escala-login-v1",
      210000,
      32,
      "sha256",
    ).toString("hex"),
  };
  const server = createDevServer({
    root: path.resolve(__dirname, "../dist"),
    env,
    now: () => now,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  try {
    const context = await browser.newContext();
    await context.route("https://**/*", (route) =>
      route.request().url().includes("tailwind")
        ? route.fulfill({
            contentType: "text/javascript",
            body: "window.tailwind={};",
          })
        : route.abort(),
    );
    const page = await context.newPage();
    await page.goto(base);
    await page.waitForURL("**/login.html?**");
    assert.equal(await page.locator("#password").count(), 1);
    assert.equal(
      (
        await context.request.get(base + "/assets/js/app.js", {
          maxRedirects: 0,
        })
      ).status(),
      303,
    );
    await page.locator("#password").fill("incorrect");
    await page.locator("button[type=submit]").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#login-message")
        .textContent.includes("incorreta"),
    );
    await page.locator("#password").fill("test-password");
    await page.locator("button[type=submit]").click();
    await page.waitForURL(base + "/");
    await page.locator("#btn-sair").waitFor({ state: "visible" });
    await page.evaluate(() =>
      localStorage.setItem("auth-preserve-test", "preserved"),
    );
    const cookies = await context.cookies();
    const session = cookies.find((c) => c.name === "cjs_session");
    assert.ok(session.httpOnly);
    await page.reload();
    await page.waitForFunction(
      () => document.documentElement.dataset.ready === "true",
    );
    await page.locator("#btn-sair").waitFor({ state: "visible" });
    assert.equal(
      (await context.request.get(base + "/assets/js/app.js")).status(),
      200,
    );
    now += SESSION_MS;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForURL("**/login.html?expired=1**");
    assert.equal(
      (
        await context.request.get(base + "/assets/js/app.js", {
          maxRedirects: 0,
        })
      ).status(),
      303,
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("auth-preserve-test")),
      "preserved",
    );
    await page.locator("#password").fill("test-password");
    await page.locator("button[type=submit]").click();
    await page.waitForURL(base + "/");
    await page.locator("#btn-sair").click();
    await page.waitForURL("**/login.html?**");
    assert.ok(!(await context.cookies()).some((c) => c.name === "cjs_session"));
    // Timer blocks an open tab without requiring another request or interaction.
    await page.clock.install();
    await page.locator("#password").fill("test-password");
    await page.locator("button[type=submit]").click();
    await page.waitForURL(base + "/");
    await page.locator("#btn-sair").waitFor({ state: "visible" });
    await page.clock.fastForward(SESSION_MS + 1);
    await page.waitForURL("**/login.html?expired=1**");
    console.log(
      "Login: senha, proteção de recursos, persistência, expiração no servidor e na aba aberta e saída — OK",
    );
    await context.close();
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
