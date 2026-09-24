# Daily Digital Coming Soon

The standalone Daily Digital launch page, published from this repository through GitHub Pages. It is independent of
the authenticated Daily Digital application and the generic `dcm-coming-soon-boilerplate` repository.

## Local build and preview

Requires Node.js 20.9 or newer. Build and verify the localized output:

```powershell
npm run check
```

Start the local server:

```powershell
npm start
```

Open `http://127.0.0.1:4174/daily-digital-coming-soon/`. The server also serves the generated language routes,
for example `/daily-digital-coming-soon/de/`.

## Locales and launch settings

`site.config.json` contains the site name, GitHub Pages base path, public site URL, release date, analytics IDs, and
brand asset paths. The current Clarity and Google Analytics IDs match the archived Daily Digital launch page. Review
privacy and consent settings before changing analytics behavior or moving the page to a new domain.

Localized message source files are in `locales/*/messages.po`; the build substitutes `[[site_name]]` and
`[[release_date]]`. The supported route, locale, and flag mapping is in `scripts/build.mjs`. Keep those definitions,
catalogs, and `flags/40x30/` in sync when adding or removing a language.

The Daily Digital logo and favicon assets in `brand/` are copies of the approved repository brand assets. Generated
HTML lives in `dist/` and is not edited directly.

## GitHub Pages deployment

The workflow in `.github/workflows/pages.yml` runs `npm run check` on pull requests. Pushes to `main` build and publish
`dist/` to GitHub Pages. The repository Pages source must be set to **GitHub Actions**. The site URL is
`https://dotcommediainternetagency.github.io/daily-digital-coming-soon/`.

The generated pages and assets include the repository base path, so direct locale routes and the browser-language
redirect work under the project URL. Keep `basePath` in `site.config.json` synchronized with the repository name.

## Existing domain and Vercel deployment

The existing Daily Digital Vercel deployment and its custom domain remain separate. This repository adds a GitHub
Pages deployment and does not change DNS or Vercel settings. Do not point the current production domain here without
an explicit domain migration plan.

## Secrets

Do not commit `.env` files, credentials, or `.vercel` project-link metadata. The analytics identifiers are public
client-side IDs, not secrets.
