import { createServer, request as httpRequest } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { readManifest } from "./shared.mjs";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
};

const PRECOMPRESSED_EXTENSIONS = [
  ["br", ".br"],
  ["gzip", ".gz"],
];

function getAcceptedEncodings(header) {
  const accepted = new Set();
  for (const entry of String(header ?? "").split(",")) {
    const [name, ...parameters] = entry.trim().toLowerCase().split(";");
    const quality = parameters.map((parameter) => parameter.trim()).find((parameter) => parameter.startsWith("q="));
    if (name && (!quality || Number(quality.slice(2)) > 0)) {
      accepted.add(name);
    }
  }
  return accepted;
}

function findPrecompressedFile(file, acceptEncoding) {
  const accepted = getAcceptedEncodings(acceptEncoding);
  for (const [encoding, extension] of PRECOMPRESSED_EXTENSIONS) {
    if (!accepted.has(encoding)) {
      continue;
    }
    try {
      const info = statSync(`${file}${extension}`);
      if (info.isFile()) {
        return { encoding, file: `${file}${extension}`, info };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function json(response, status, value) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

export function isApiPath(path, headers) {
  return (
    /^\/(health|ready|matchmake|auth|account|room|bot|bug-reports)(\/|$)/.test(path) ||
    (/^\/(tournaments|community|replays|roadmap)(\/|$)/.test(path) && !headers.accept?.includes("text/html"))
  );
}

/** Config stays loaded while only the on-disk routing decision changes. */
export function createGateway({ state, upstreamFor = (slot, index) => `http://aegis-${slot}-api${index}:2567` }) {
  let roundRobin = 0;
  const healthy = new Map();
  const healthRevisions = new Map();

  function syncHealthRevisions(manifest) {
    for (const { slot, revision } of [manifest.active, ...manifest.draining]) {
      if (healthRevisions.get(slot) === revision) continue;
      healthRevisions.set(slot, revision);
      for (const index of [1, 2, 3]) healthy.delete(`${slot}:${index}`);
    }
  }

  async function refreshHealth() {
    let manifest;
    try {
      manifest = readManifest(state);
    } catch {
      return;
    }
    syncHealthRevisions(manifest);
    await Promise.all(
      [manifest.active, ...manifest.draining].flatMap(({ slot, revision }) =>
        [1, 2, 3].map(async (index) => {
          try {
            const response = await fetch(`${upstreamFor(slot, index)}/ready`, { signal: AbortSignal.timeout(1500) });
            if (healthRevisions.get(slot) === revision) healthy.set(`${slot}:${index}`, response.ok);
          } catch {
            if (healthRevisions.get(slot) === revision) healthy.set(`${slot}:${index}`, false);
          }
        }),
      ),
    );
  }

  function target(request, manifest) {
    syncHealthRevisions(manifest);
    const url = new URL(request.url, "http://gateway");
    const slotRoute = /^\/api\/(blue|red|green|g-[a-f0-9]{12})(?:\/p([123]))?(?=\/|$)/.exec(url.pathname);
    const legacyOwner = /^\/p([123])(?=\/|$)/.exec(url.pathname);
    const slot = slotRoute?.[1] ?? manifest.active.slot;
    if (!isApiPath(url.pathname, request.headers) && !slotRoute && !legacyOwner) return undefined;
    if (![manifest.active, ...manifest.draining].some((entry) => entry.slot === slot)) {
      return { error: 410 };
    }
    const path = url.pathname.slice(slotRoute?.[0].length ?? legacyOwner?.[0].length ?? 0) || "/";
    // Administration remains reachable only directly inside the private Docker network.
    if (/^\/deployment(\/|$)/.test(path)) return { error: 404 };
    if (
      request.method === "POST" &&
      /^\/matchmake\/(create|joinOrCreate)(\/|$)/i.test(path) &&
      slot !== manifest.active.slot
    ) {
      return { error: 503, draining: true };
    }
    const owner = Number(slotRoute?.[2] ?? legacyOwner?.[1]);
    const indexes = [1, 2, 3].filter((index) => healthy.get(`${slot}:${index}`) !== false);
    const index = owner || indexes[roundRobin++ % indexes.length];
    if (!index) return { error: 503 };
    return {
      slot,
      origin: upstreamFor(slot, index),
      path: path + url.search,
      explicit: Boolean(slotRoute || legacyOwner),
    };
  }

  function proxyHeaders(request) {
    return {
      ...request.headers,
      "x-forwarded-for": [request.headers["x-forwarded-for"], request.socket.remoteAddress].filter(Boolean).join(", "),
    };
  }

  function proxyHttp(request, response, destination) {
    const upstream = httpRequest(`${destination.origin}${destination.path}`, {
      method: request.method,
      headers: proxyHeaders(request),
    });
    upstream.on("response", (result) => {
      response.writeHead(result.statusCode, result.headers);
      result.pipe(response);
    });
    upstream.on("error", () => {
      if (!response.headersSent) json(response, 502, { error: "Game server unavailable" });
      else response.destroy();
    });
    upstream.setTimeout(30_000, () => upstream.destroy());
    response.on("close", () => upstream.destroy());
    request.pipe(upstream);
  }

  // Older direct-mode tabs can reconnect after the first migration and later cutovers.
  async function legacyRoomRequest(request, response, manifest, destination) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 65_536) return json(response, 413, { error: "Request too large" });
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const headers = proxyHeaders(request);
    delete headers["transfer-encoding"];
    delete headers["content-length"];
    for (const { slot } of [manifest.active, ...manifest.draining]) {
      let result;
      for (const index of [1, 2, 3].filter((candidate) => healthy.get(`${slot}:${candidate}`) !== false)) {
        try {
          result = await fetch(`${upstreamFor(slot, index)}${destination.path}`, {
            method: request.method,
            headers,
            body,
            redirect: "manual",
            signal: AbortSignal.timeout(3000),
          });
          break;
        } catch {
          // A sibling can consult the same room directory, including the retained slot's owners.
        }
      }
      if (!result) continue;
      const bytes = Buffer.from(await result.arrayBuffer());
      // Colyseus encodes missing rooms as 4212, sometimes with HTTP 400.
      let missing = result.status === 404;
      try {
        missing ||= JSON.parse(bytes.toString()).code === 4212;
      } catch {
        // Not a Colyseus error body.
      }
      if (missing && slot !== [manifest.active, ...manifest.draining].at(-1).slot) continue;
      const resultHeaders = Object.fromEntries(result.headers);
      delete resultHeaders["content-encoding"];
      delete resultHeaders["transfer-encoding"];
      resultHeaders["content-length"] = String(bytes.length);
      response.writeHead(result.status, resultHeaders);
      response.end(bytes);
      return;
    }
    json(response, 503, { error: "No room owner could be reached" });
  }

  function staticFile(request, response, manifest) {
    const pathname = decodeURIComponent(new URL(request.url, "http://gateway").pathname);
    if (pathname === "/reset-web-cache") {
      response.writeHead(303, { location: "/", "clear-site-data": '"cache"', "cache-control": "no-store" });
      return response.end();
    }
    if (pathname.endsWith(".map")) return json(response, 404, { error: "Not found" });
    const assets = pathname.startsWith("/assets/");
    const root = resolve(state, assets ? "assets" : `releases/${manifest.webRevision ?? manifest.active.revision}/web`);
    let file = resolve(root, `.${assets ? pathname.slice(7) : pathname}`);
    if (!file.startsWith(root + "/") && file !== root) return json(response, 404, { error: "Not found" });
    let info;
    try {
      info = statSync(file);
      if (!info.isFile()) throw new Error("Not a file");
    } catch {
      if (assets || extname(pathname)) return json(response, 404, { error: "Not found" });
      file = resolve(root, "index.html");
      info = statSync(file);
    }
    const precompressed = findPrecompressedFile(file, request.headers["accept-encoding"]);
    response.writeHead(200, {
      "content-type": MIME_TYPES[extname(file)] ?? "application/octet-stream",
      "content-length": precompressed?.info.size ?? info.size,
      "cache-control": assets ? "public, max-age=31536000, immutable" : "no-store",
      "x-content-type-options": "nosniff",
      vary: "accept-encoding",
      ...(precompressed ? { "content-encoding": precompressed.encoding } : {}),
    });
    if (request.method === "HEAD") return response.end();
    const stream = createReadStream(precompressed?.file ?? file);
    stream.on("error", () => response.destroy());
    response.on("close", () => stream.destroy());
    stream.pipe(response);
  }

  const server = createServer(async (request, response) => {
    try {
      const manifest = readManifest(state);
      const url = new URL(request.url, "http://gateway");
      if (url.pathname === "/deployment/manifest.json") {
        const bundleRevision = request.headers["x-aegis-web-revision"];
        if (manifest.webRevision && typeof bundleRevision === "string" && bundleRevision !== manifest.webRevision) {
          // Older bundles understand fewer slot names. Give them a parseable
          // revision mismatch so they reload before routing with this manifest.
          return json(response, 200, {
            version: 1,
            active: { slot: "green", revision: manifest.webRevision },
            draining: [],
          });
        }
        return json(response, 200, manifest);
      }
      if (/^\/deployment(\/|$)/.test(url.pathname)) {
        return json(response, 404, { error: "Not found" });
      }
      if (
        request.method === "POST" &&
        /^\/(matchmake\/(reconnect|joinbyid)\/|room\/lookup|bot\/join)/i.test(url.pathname)
      ) {
        return await legacyRoomRequest(request, response, manifest, { path: url.pathname + url.search });
      }
      const destination = target(request, manifest);
      if (destination?.error) {
        return json(response, destination.error, {
          code: destination.draining ? "AEGIS_DEPLOYMENT_DRAINING" : "AEGIS_GATEWAY_UNAVAILABLE",
          error: "Game server unavailable for this request",
        });
      }
      if (!destination) return staticFile(request, response, manifest);
      proxyHttp(request, response, destination);
    } catch {
      if (!response.headersSent) json(response, 503, { error: "Deployment routing unavailable" });
      else response.destroy();
    }
  });

  server.on("upgrade", (request, socket, head) => {
    try {
      const destination = target(request, readManifest(state));
      if (!destination?.origin || !destination.explicit) {
        socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
        return;
      }
      const upstream = httpRequest(`${destination.origin}${destination.path}`, {
        headers: proxyHeaders(request),
      });
      upstream.on("upgrade", (result, upstreamSocket, upstreamHead) => {
        upstreamSocket.setTimeout(0);
        socket.write(
          `HTTP/1.1 101 Switching Protocols\r\n${Object.entries(result.headers)
            .map(([key, value]) => `${key}: ${value}`)
            .join("\r\n")}\r\n\r\n`,
        );
        if (head.length) upstreamSocket.write(head);
        if (upstreamHead.length) socket.write(upstreamHead);
        socket.pipe(upstreamSocket).pipe(socket);
        socket.on("error", () => upstreamSocket.destroy());
        upstreamSocket.on("error", () => socket.destroy());
        socket.on("close", () => upstreamSocket.destroy());
        upstreamSocket.on("close", () => socket.destroy());
      });
      upstream.on("response", (result) => {
        socket.end(`HTTP/1.1 ${result.statusCode} Rejected\r\nConnection: close\r\n\r\n`);
        result.resume();
      });
      upstream.on("error", () => socket.destroy());
      upstream.setTimeout(10_000, () => upstream.destroy());
      socket.on("close", () => upstream.destroy());
      upstream.end();
    } catch {
      socket.destroy();
    }
  });
  const interval = setInterval(() => void refreshHealth(), 2000);
  interval.unref();
  server.on("close", () => clearInterval(interval));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createGateway({ state: process.env.AEGIS_ROLLOUT_STATE ?? "/state" }).listen(
    Number(process.env.PORT ?? 80),
    "0.0.0.0",
  );
}
