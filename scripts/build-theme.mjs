import postcss from "postcss";
import { readFile, writeFile } from "node:fs/promises";

/** Compile the explicitly designed palette, without guessing colors from the
 * light theme. Scope colors to dark screens; light styles and print stay intact. */
export async function buildTheme(root) {
  const css = postcss.parse(await readFile(`${root}/assets/css/dark-palette.css`, "utf8"));
  css.walkRules(rule => {
    rule.selectors = rule.selectors.map(selector => selector === ":root"
      ? 'html[data-theme="dark"]'
      : `html[data-theme="dark"] ${selector}`);
  });
  const screen = postcss.atRule({ name: "media", params: "screen" });
  screen.append(css.nodes);
  await writeFile(`${root}/assets/css/theme-dark.css`,
    `/* Generated from dark-palette.css. Edit the authoring source, not this file. */\n${screen.toString()}\n`);
}
