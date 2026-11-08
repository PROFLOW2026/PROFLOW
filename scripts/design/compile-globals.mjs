import fs from "node:fs";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const input = process.argv[2];
const output = process.argv[3];
const css = fs.readFileSync(input, "utf8");
const result = await postcss([tailwind()]).process(css, { from: input });
fs.mkdirSync(output.replace(/[/\\][^/\\]+$/, ""), { recursive: true });
fs.writeFileSync(output, result.css);
console.log(JSON.stringify({ bytes: result.css.length, output }));