import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const surfaceDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));
const deploymentDirectory = resolve(surfaceDirectory, "dist");
const documentRoot = existsSync(resolve(deploymentDirectory, "index.html")) ? deploymentDirectory : surfaceDirectory;
const config = JSON.parse(readFileSync(resolve(surfaceDirectory, "site.config.json"), "utf8"));
const basePath = config.basePath?.replace(/\/$/, "") || "";
const portArgumentIndex = process.argv.indexOf("--port");
const requestedPort = portArgumentIndex >= 0 ? Number(process.argv[portArgumentIndex + 1]) : 4174;
const port = Number.isInteger(requestedPort) && requestedPort >= 0 && requestedPort <= 65535 ? requestedPort : 4174;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function sendHtml(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  response.end(body);
}

function resolveRequestedFile(requestUrl) {
  let pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  if (basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))) {
    pathname = pathname.slice(basePath.length) || "/";
  }
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const requestedFile = resolve(documentRoot, relativePath);
  const relativeRequestedFile = relative(documentRoot, requestedFile);

  if (relativeRequestedFile === "" || relativeRequestedFile === ".." || relativeRequestedFile.startsWith(`..${sep}`)) {
    return null;
  }

  return requestedFile;
}

const server = createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  let requestedFile;

  try {
    requestedFile = resolveRequestedFile(request.url || "/");
  } catch {
    sendHtml(response, 400, "<h1>Bad request</h1>");
    return;
  }

  if (!requestedFile || !existsSync(requestedFile) || !statSync(requestedFile).isFile()) {
    if (requestedFile && existsSync(requestedFile) && statSync(requestedFile).isDirectory()) {
      requestedFile = resolve(requestedFile, "index.html");
    }
    if (!existsSync(requestedFile) || !statSync(requestedFile).isFile()) {
      sendHtml(response, 404, "<h1>Not found</h1><p>Requested file was not found.</p>");
      return;
    }
  }

  const extension = extname(requestedFile).toLowerCase();
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(requestedFile).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Coming-soon site: http://127.0.0.1:${server.address().port}${basePath}/`);
});
