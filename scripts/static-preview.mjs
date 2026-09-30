import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { readFile, stat } from "node:fs/promises";

const PREVIEW_PORT = Number(process.env.QUOTEFLOW_PREVIEW_PORT || 4173);
const API_PORT = Number(process.env.QUOTEFLOW_API_PORT || 8787);
const DIST_DIR = resolve(process.cwd(), "dist");
const HTML_CACHE = "public, max-age=0, must-revalidate";
const ASSET_CACHE = "public, max-age=31536000, immutable";

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".txt", "text/plain; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
]);

function getContentType(filePath) {
  return CONTENT_TYPES.get(extname(filePath).toLowerCase()) || "application/octet-stream";
}

function getCacheControl(pathname) {
  if (pathname === "/sw.js" || pathname === "/index.html" || pathname === "/manifest.webmanifest") {
    return HTML_CACHE;
  }

  if (pathname.startsWith("/assets/")) {
    return ASSET_CACHE;
  }

  return HTML_CACHE;
}

async function readStaticFile(filePath) {
  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) {
    return null;
  }

  return readFile(filePath);
}

async function servePath(response, pathname) {
  const safePath = pathname.replace(/^\/+/, "");
  const targetPath = resolve(DIST_DIR, safePath || "index.html");
  const normalizedRoot = `${DIST_DIR}${process.platform === "win32" ? "\\" : "/"}`;
  const looksLikeAsset = Boolean(extname(pathname));

  if (targetPath !== DIST_DIR && !targetPath.startsWith(normalizedRoot)) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad request.");
    return;
  }

  try {
    const fileBuffer = await readStaticFile(targetPath);
    if (fileBuffer) {
      response.writeHead(200, {
        "Content-Type": getContentType(targetPath),
        "Cache-Control": getCacheControl(pathname),
      });
      response.end(fileBuffer);
      return;
    }
  } catch {}

  if (looksLikeAsset) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found.");
    return;
  }

  const fallbackPath = resolve(DIST_DIR, "index.html");
  const fallbackBuffer = await readFile(fallbackPath);
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": HTML_CACHE,
  });
  response.end(fallbackBuffer);
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url || "/", "http://localhost").pathname;

  if (pathname === "/auth" || pathname.startsWith("/auth/")) {
    response.writeHead(302, {
      Location: "/",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    });
    response.end();
    return;
  }

  if (pathname.startsWith("/api/")) {
    try {
      const apiUrl = new URL(request.url || "/", `http://localhost:${API_PORT}`);
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      const method = request.method || "GET";
      const body =
        method === "GET" || method === "HEAD" || chunks.length === 0
          ? undefined
          : Buffer.concat(chunks);
      const apiResponse = await fetch(apiUrl, {
        method,
        headers: request.headers,
        body,
      });
      response.statusCode = apiResponse.status;
      apiResponse.headers.forEach((value, key) => {
        response.setHeader(key, value);
      });
      response.end(Buffer.from(await apiResponse.arrayBuffer()));
    } catch (error) {
      console.error("[QuoteFlow Preview] Failed to proxy API request", pathname, error);
      response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "The local QuoteFlow API is not running." }));
    }
    return;
  }

  try {
    await servePath(response, pathname);
  } catch (error) {
    console.error("[QuoteFlow Preview] Failed to serve", pathname, error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Preview server error.");
  }
});

server.listen(PREVIEW_PORT, () => {
  console.log(`QuoteFlow preview listening on http://localhost:${PREVIEW_PORT}`);
});
