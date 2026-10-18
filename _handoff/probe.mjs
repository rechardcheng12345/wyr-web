// Usage: node _handoff/probe.mjs <puppeteerDir> <outDir|-> <url> [<url> ...]
// Prints console messages, page errors and failed requests; saves a 1280px-wide full-page screenshot per URL.
import { createRequire } from "node:module";
import path from "node:path";

const [puppeteerDir, outDir, ...urls] = process.argv.slice(2);
const puppeteer = createRequire(path.join(puppeteerDir, "x.js"))("puppeteer-core");

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-first-run", "--no-default-browser-check"],
});

for (const url of urls) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on("console", (m) => console.log(`[console.${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => console.log(`[pageerror] ${e.stack ?? e.message}`));
  page.on("requestfailed", (r) => console.log(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  page.on("response", (r) => { if (r.status() >= 400) console.log(`[http ${r.status()}] ${r.url()}`); });
  console.log(`=== ${url}`);
  await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  const info = await page.evaluate(() => ({
    rootChildren: document.getElementById("root")?.childElementCount ?? -1,
    h1: [...document.querySelectorAll("h1")].map((h) => h.textContent),
    productLinks: document.querySelectorAll('a[href^="/products/"]').length,
    imgsLoaded: [...document.images].filter((i) => i.complete && i.naturalWidth > 0).length,
    imgsTotal: document.images.length,
    text: document.body.innerText.slice(0, 300).replace(/\s+/g, " "),
  }));
  console.log(JSON.stringify(info));
  if (outDir !== "-") {
    const name = new URL(url).pathname.replace(/^\/|\/$/g, "").replace(/\//g, "_") || "home";
    await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
  }
  await page.close();
}
await browser.close();
