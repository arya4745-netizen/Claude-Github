// Builds index.html from src/game.html, src/content.js, src/engine.js and drill-week1.json.
// Usage: node tools/build.mjs
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("..", import.meta.url);
const read = p => readFileSync(new URL(p, root), "utf8");
const html = read("src/game.html")
  .replace("/*__CONTENT__*/", () => read("src/content.js"))
  .replace("/*__DRILL__*/[]", () => read("drill-week1.json"))
  .replace("/*__ENGINE__*/", () => read("src/engine.js"));
writeFileSync(new URL("index.html", root), html);
console.log("index.html", html.length, "bytes");
