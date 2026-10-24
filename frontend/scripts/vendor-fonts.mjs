import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const revision = "ffebf8c1ee449e544955a7e813c54f9b73848eac";
const base = `https://raw.githubusercontent.com/notofonts/noto-fonts/${revision}`;
const files = [
  ["hinted/ttf/NotoSans/NotoSans-Regular.ttf", "noto-sans-regular.ttf"],
  ["hinted/ttf/NotoSans/NotoSans-SemiBold.ttf", "noto-sans-semibold.ttf"],
  ["LICENSE", "OFL.txt"],
];
const provenance = [];
for (const [upstream, local] of files) {
  const url = `${base}/${upstream}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Font download failed: ${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(new URL(`../public/fonts/${local}`, import.meta.url), bytes);
  provenance.push(`- ${local}: ${url}\n  SHA-256: ${createHash("sha256").update(bytes).digest("hex")}`);
}
await writeFile(new URL("../public/fonts/README.md", import.meta.url), `# Bundled Noto Sans fonts\n\nCopyright The Noto Project Authors. Licensed under the SIL Open Font License 1.1; see [OFL.txt](OFL.txt).\n\nThese unmodified fonts provide Latin, Greek and Cyrillic characters, including accented names. CJK and other scripts outside their coverage are not supported by this prototype. No external font requests are made at runtime.\n\nPinned source revision: ${revision}\n\n${provenance.join("\n\n")}\n\nRegenerate with \`docker compose run --rm --entrypoint node tooling scripts/vendor-fonts.mjs\`.\n`);
