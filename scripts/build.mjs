import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "dist");
const config = JSON.parse(readFileSync(join(root, "site.config.json"), "utf8"));
const localeEntries = [
  { directory: "en-GB", slug: "en", language: "en-GB", ogLocale: "en_GB", flag: "gb.png" },
  { directory: "de-DE", slug: "de", language: "de-DE", ogLocale: "de_DE", flag: "de.png" },
  { directory: "nl-NL", slug: "nl", language: "nl-NL", ogLocale: "nl_NL", flag: "nl.png" },
  { directory: "es-ES", slug: "es", language: "es-ES", ogLocale: "es_ES", flag: "es.png" },
  { directory: "it-IT", slug: "it", language: "it-IT", ogLocale: "it_IT", flag: "it.png" },
  { directory: "fr-FR", slug: "fr", language: "fr-FR", ogLocale: "fr_FR", flag: "fr.png" },
  { directory: "pt-BR", slug: "pt-br", language: "pt-BR", ogLocale: "pt_BR", flag: "br.png" },
  { directory: "ja-JP", slug: "ja", language: "ja-JP", ogLocale: "ja_JP", flag: "jp.png" },
  { directory: "ko-KR", slug: "ko", language: "ko-KR", ogLocale: "ko_KR", flag: "kr.png" },
];

function assertConfig() {
  if (!config.name?.trim()) throw new Error("site.config.json must include a non-empty name.");
  if (!Number.isFinite(Date.parse(config.releaseAt))) throw new Error("site.config.json releaseAt must be a valid ISO date.");
  for (const [label, value] of Object.entries({
    "brand.logo": config.brand?.logo,
    "brand.favicon": config.brand?.favicon,
    "brand.socialImage": config.brand?.socialImage,
  })) {
    const assetPath = resolve(root, value || "");
    if (!value || !assetPath.startsWith(`${root}${process.platform === "win32" ? "\\" : "/"}`) || !existsSync(assetPath)) {
      throw new Error(`site.config.json ${label} must point to an existing file inside the repository.`);
    }
  }
  for (const [label, value] of Object.entries(config.analytics || {})) {
    if (value && !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`Invalid analytics identifier: ${label}.`);
  }
}

function parseCatalog(catalogPath) {
  const messages = {};
  let messageId = null;
  for (const line of readFileSync(catalogPath, "utf8").split(/\r?\n/)) {
    const idMatch = line.match(/^msgid "(.*)"$/);
    const stringMatch = line.match(/^msgstr "(.*)"$/);
    if (idMatch) messageId = idMatch[1];
    if (stringMatch && messageId) messages[messageId] = stringMatch[1];
  }
  return messages;
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function analyticsMarkup() {
  const clarityId = config.analytics?.clarityId;
  const ga4Id = config.analytics?.ga4MeasurementId;
  const snippets = [];

  if (clarityId) {
    snippets.push(`<script>(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${clarityId}");</script>`);
  }
  if (ga4Id) {
    snippets.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${ga4Id}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","${ga4Id}");</script>`);
  }
  return snippets.join("\n");
}

function renderPage(locale, template, englishMessages) {
  const localeMessages = locale.directory === "en-GB"
    ? englishMessages
    : { ...englishMessages, ...parseCatalog(join(root, "locales", locale.directory, "messages.po")) };
  const basePath = config.basePath?.replace(/\/$/, "") || "";
  const domain = config.domain?.trim().replace(/\/$/, "") || "";
  const alternateLinks = localeEntries
    .map((alternate) => `    <link rel="alternate" hreflang="${alternate.language.toLowerCase()}" href="${domain}${basePath}/${alternate.slug}/">`)
    .concat(`    <link rel="alternate" hreflang="x-default" href="${domain}${basePath}/en/">`)
    .join("\n");
  const values = {
    ...localeMessages,
    site_name: escapeHtml(config.name),
    brand_initials: escapeHtml(config.name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 3).toUpperCase()),
    logo: config.brand.logo,
    favicon: config.brand.favicon,
    social_image: `${basePath}/${config.brand.socialImage}`,
    social_image_type: ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" })[config.brand.socialImage.slice(config.brand.socialImage.lastIndexOf(".")).toLowerCase()] || "application/octet-stream",
    release_at: config.releaseAt,
    release_date: new Intl.DateTimeFormat(locale.language, { dateStyle: "short", timeZone: "UTC" }).format(new Date(config.releaseAt)),
    copyright_year: new Date().getUTCFullYear(),
    html_lang: locale.language,
    locale: locale.directory,
    og_locale: locale.ogLocale,
    base_path: basePath,
    canonical_path: `${domain}${basePath}/${locale.slug}/`,
    alternate_links: alternateLinks,
    analytics_scripts: analyticsMarkup(),
  };

  return template.replace(/\[\[([a-z0-9_]+)\]\]/g, (token, key) => {
    const value = values[key];
    if (value === undefined) return token;
    return String(value).replace(/\[\[([a-z0-9_]+)\]\]/g, (nestedToken, nestedKey) => values[nestedKey] ?? nestedToken);
  });
}

assertConfig();
rmSync(output, { recursive: true, force: true });
mkdirSync(join(output, "brand"), { recursive: true });
mkdirSync(join(output, "flags", "40x30"), { recursive: true });

for (const filename of ["styles.css", "smoke.js", "hero-slider.js", "countdown.js", "locale-router.js", "locale-switcher.js"]) {
  cpSync(join(root, filename), join(output, filename));
}
for (const filename of [config.brand.logo, config.brand.favicon, config.brand.socialImage]) {
  const relativePath = filename.replaceAll("\\", "/");
  const destination = join(output, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  if (filename.endsWith(".svg")) {
    const svg = readFileSync(join(root, filename), "utf8").replaceAll("[[site_name]]", escapeHtml(config.name));
    writeFileSync(destination, svg);
  } else {
    cpSync(join(root, filename), destination);
  }
}
for (const locale of localeEntries) {
  cpSync(join(root, "flags", "40x30", locale.flag), join(output, "flags", "40x30", locale.flag));
}

const englishMessages = parseCatalog(join(root, "locales", "en-GB", "messages.po"));
const template = readFileSync(join(root, "index.html"), "utf8").replace(/((?:href|src)=")\//g, "$1[[base_path]]/");
for (const locale of localeEntries) {
  const destinations = locale.slug === "en" ? [output, join(output, locale.slug)] : [join(output, locale.slug)];
  for (const destination of destinations) {
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(destination, "index.html"), renderPage(locale, template, englishMessages));
  }
}

console.log(`Built static launch site at ${output}`);
