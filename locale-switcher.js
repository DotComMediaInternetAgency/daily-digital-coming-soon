(() => {
  const basePath = document.documentElement.dataset.basePath || "";
  const currentLocale = document.documentElement.dataset.locale;
  const currentLink = document.querySelector(`[data-locale-link="${currentLocale}"]`);
  const currentLanguage = document.querySelector("[data-current-language]");
  const currentFlag = document.querySelector(".language-switcher > summary img");
  if (currentLink && currentLanguage) currentLanguage.textContent = currentLink.textContent;
  if (currentLink && currentFlag) currentFlag.src = currentLink.querySelector("img")?.src || currentFlag.src;
  document.querySelectorAll("[data-locale-link]").forEach((link) => {
    const locale = link.dataset.localeLink;
    if (locale === currentLocale) {
      link.setAttribute("aria-current", "page");
      link.classList.add("is-current");
    }
    link.addEventListener("click", () => {
      document.cookie = `dd_locale=${locale}; Path=${basePath || "/"}; Max-Age=31536000; SameSite=Lax`;
    });
  });
})();
