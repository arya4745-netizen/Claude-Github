// Pulls week-one questions out of a saved copy of the OSCE Recall Drill page.
// Usage: node tools/extract-drill.mjs <drill.html> > drill-week1.json
import { readFileSync } from "node:fs";
import vm from "node:vm";
const html = readFileSync(process.argv[2], "utf8");
const start = html.indexOf("const Q = [");
const end = html.indexOf("].map(([id, topic, type, q, a, core])", start);
const rows = vm.runInNewContext(html.slice(start + "const Q = ".length, end + 1));
const WEEK1 = new Set(["pcos","fert","hyper","precon","ohss","hmb","hyst","myo","postop","ureter"]);
const out = rows.filter(r => WEEK1.has(r[1])).map(([id, topic, type, q, a]) => ({ id, topic, type, q, a }));
process.stdout.write(JSON.stringify(out));
