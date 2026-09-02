import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "@playwright/test";

const root = resolve(".");
const output = resolve(process.env.SHIRABE_UI_EVIDENCE_DIR || resolve(tmpdir(), "shirabe-claude-ui"));
const types = { ".html": "text/html;charset=utf-8", ".css": "text/css;charset=utf-8", ".js": "text/javascript;charset=utf-8", ".woff2": "font/woff2" };
const server = createServer(async (request, response) => {
  try {
    const raw = new URL(request.url, "http://127.0.0.1").pathname;
    const relative = raw.endsWith("/") ? `${raw.slice(1)}index.html` : raw.slice(1);
    const path = resolve(root, relative || "index.html");
    if (!path.startsWith(root)) throw new Error("denied");
    response.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" });
    response.end(await readFile(path));
  } catch {
    response.writeHead(404); response.end("not found");
  }
});

await mkdir(output, { recursive: true });
await new Promise((accept) => server.listen(8791, "127.0.0.1", accept));
const browser = await chromium.launch();
try {
  for (const viewport of [{ name: "phone", width: 390, height: 844 }, { name: "tablet", width: 768, height: 1024 }, { name: "desktop", width: 1440, height: 900 }]) {
    const page = await browser.newPage({ viewport });
    for (const target of [{ name: "en", path: "/services/shirabe/" }, { name: "es", path: "/es/servicios/shirabe/" }]) {
      await page.goto(`http://127.0.0.1:8791${target.path}`, { waitUntil: "networkidle" });
      await page.screenshot({ path: resolve(output, `${target.name}-${viewport.name}.png`), fullPage: true });
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(output);
