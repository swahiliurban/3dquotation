import { createServer } from "node:http";
import { handleApiRequest } from "./shared/api-handler.js";

const API_PORT = Number(process.env.QUOTEFLOW_API_PORT || 8787);

function toWebHeaders(headers) {
  const nextHeaders = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "undefined") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        nextHeaders.append(key, entry);
      }
      continue;
    }

    nextHeaders.set(key, value);
  }

  return nextHeaders;
}

async function readBodyBuffer(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

async function toFetchRequest(request) {
  const host = request.headers.host || `localhost:${API_PORT}`;
  const url = new URL(request.url || "/", `http://${host}`);
  const method = request.method || "GET";
  const headers = toWebHeaders(request.headers);
  const body = method === "GET" || method === "HEAD" ? undefined : await readBodyBuffer(request);

  return new Request(url, {
    method,
    headers,
    ...(body ? { body } : {}),
  });
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Missing request URL." }));
    return;
  }

  try {
    const fetchRequest = await toFetchRequest(request);
    const fetchResponse = await handleApiRequest(fetchRequest);

    response.statusCode = fetchResponse.status;
    fetchResponse.headers.forEach((value, key) => {
      response.setHeader(key, value);
    });

    if (fetchResponse.status === 204) {
      response.end();
      return;
    }

    const body = Buffer.from(await fetchResponse.arrayBuffer());
    response.end(body);
  } catch (error) {
    console.error("[QuoteFlow API] Local server request failed.", error);
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Something went wrong on the server." }));
  }
});

server.listen(API_PORT, () => {
  console.log(`QuoteFlow API listening on http://localhost:${API_PORT}`);
});
