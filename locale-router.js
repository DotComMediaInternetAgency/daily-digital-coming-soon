(() => {
  const basePath = document.documentElement.dataset.basePath || "";
  const rootPath = `${basePath}/`;
  const supported = new Map([
    ["en-gb", "en-GB"],
    ["de-de", "de-DE"],
    ["nl-nl", "nl-NL"],
    ["es-es", "es-ES"],
    ["it-it", "it-IT"],
    ["fr-fr", "fr-FR"],
    ["pt-br", "pt-BR"],
    ["ja-jp", "ja-JP"],
    ["ko-kr", "ko-KR"],
  ]);
  const localePaths = {
    "en-GB": `${basePath}/en/`,
    "de-DE": `${basePath}/de/`,
    "nl-NL": `${basePath}/nl/`,
    "es-ES": `${basePath}/es/`,
    "it-IT": `${basePath}/it/`,
    "fr-FR": `${basePath}/fr/`,
    "pt-BR": `${basePath}/pt-br/`,
    "ja-JP": `${basePath}/ja/`,
    "ko-KR": `${basePath}/ko/`,
  };
  const languageFallbacks = {
    en: "en-GB",
    de: "de-DE",
    nl: "nl-NL",
    es: "es-ES",
    it: "it-IT",
    fr: "fr-FR",
    pt: "pt-BR",
    ja: "ja-JP",
    ko: "ko-KR",
  };
  const legacyCookieLocales = {
    en: "en-GB",
    de: "de-DE",
    fr: "fr-FR",
    es: "es-ES",
    "pt-br": "pt-BR",
    ja: "ja-JP",
    ko: "ko-KR",
  };
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path !== rootPath.replace(/\/$/, "") && path !== rootPath) return;

  function readCookie(name) {
    return document.cookie.split("; ").find((value) => value.startsWith(`${name}=`))?.split("=")[1];
  }

  function setLocale(locale) {
    document.cookie = `dd_locale=${locale}; Path=${basePath || "/"}; Max-Age=31536000; SameSite=Lax`;
  }

  function browserLocale() {
    const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const candidate of candidates) {
      const normalized = String(candidate || "").toLowerCase();
      const exact = supported.get(normalized);
      if (exact) return exact;
      const language = normalized.split("-")[0];
      if (languageFallbacks[language]) return languageFallbacks[language];
    }
    return "en";
  }

  const storedLocale = readCookie("dd_locale");
  const normalizedStoredLocale = String(storedLocale || "").toLowerCase();
  const preferred = supported.get(normalizedStoredLocale) || legacyCookieLocales[normalizedStoredLocale] || browserLocale();
  if (localePaths[preferred]) {
    setLocale(preferred);
    window.location.replace(localePaths[preferred]);
  }
})();
