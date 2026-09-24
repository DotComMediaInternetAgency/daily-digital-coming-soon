import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "dist");
const config = JSON.parse(readFileSync(join(root, "site.config.json"), "utf8"));
const locales = ["en", "de", "nl", "es", "it", "fr", "pt-br", "ja", "ko"];
const requiredFiles = ["styles.css", "smoke.js", "hero-slider.js", "countdown.js", "locale-router.js", "locale-switcher.js"];
const failures = [];

for (const route of locales) {
  const page = join(output, route, "index.html");
  if (!existsSync(page)) {
    failures.push(`Missing route: ${route}`);
    continue;
  }
  const html = readFileSync(page, "utf8");
  if (html.includes("[[")) failures.push(`Unresolved template placeholder in ${route}`);
  if (!html.includes(config.name)) failures.push(`Configured site name missing from ${route}`);
  if (!html.includes(`data-release-at="${config.releaseAt}"`)) failures.push(`Release date missing from ${route}`);
  if (!html.includes(`data-base-path="${config.basePath}"`)) failures.push(`Configured base path missing from ${route}`);
  if (!html.includes(`${config.basePath}/styles.css`)) failures.push(`Base-path stylesheet URL missing from ${route}`);
  if (/(?:href|src)="\/(?!daily-digital-coming-soon\/)/.test(html)) failures.push(`Unprefixed root URL found in ${route}`);
  if (!html.includes("clarity.ms") && config.analytics.clarityId) failures.push(`Clarity snippet missing from ${route}`);
  if (!html.includes("googletagmanager.com") && config.analytics.ga4MeasurementId) failures.push(`GA4 snippet missing from ${route}`);
}

for (const filename of requiredFiles) {
  if (!existsSync(join(output, filename))) failures.push(`Missing runtime file: ${filename}`);
}
for (const asset of [config.brand.logo, config.brand.favicon, config.brand.socialImage]) {
  if (!existsSync(join(output, asset))) failures.push(`Missing configured brand asset: ${asset}`);
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Verified ${locales.length} locale routes and configured runtime assets.`);
}
