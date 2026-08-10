import { stat as _stat, readFile } from "fs";
import { createServer } from "http";
import { resolve, relative, isAbsolute, extname } from "path";
import { WebSocket, WebSocketServer } from "ws";

const Server = WebSocketServer;
const OPEN = WebSocket.OPEN;

const PORT = Number(process.env.PORT) || 3000;
const STATIC_ROOT = import.meta.dirname;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_NICKNAME_LENGTH = 30;
const RATE_LIMIT_WINDOW_MS = 5000;
const RATE_LIMIT_MESSAGES = 5;
const TYPING_RATE_LIMIT_UPDATES = 10;
const TYPING_TIMEOUT_MS = 2500;
const HEARTBEAT_INTERVAL_MS = 30000;
const allowedSystems = new Set([
  "Windows",
  "macOS",
  "iOS/iPadOS",
  "Linux",
  "Android",
  "Chromeos",
  "Unknown",
]);
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self' ws: wss:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

const RESOURCE_MAX_AGE_SECONDS = 24 * 60 * 60;
const STATIC_CACHE = new Map();

function serveStaticFile(req, res, data, stat, contentType, cacheControl) {
  const etag = `"${stat.mtimeMs.toString(16)}-${stat.size.toString(16)}"`;
  const lastModified = stat.mtime.toUTCString();

  if (
    req.headers["if-none-match"] === etag ||
    req.headers["if-modified-since"] === lastModified
  ) {
    res.writeHead(304, {
      "Cache-Control": cacheControl,
      ETag: etag,
      ...SECURITY_HEADERS,
    });
    return res.end();
  }

  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": cacheControl,
    ETag: etag,
    "Last-Modified": lastModified,
    "X-Content-Type-Options": "nosniff",
    ...SECURITY_HEADERS,
  });
  return res.end(data);
}

const httpServer = createServer((req, res) => {
  let pathname;

  try {
    pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
  } catch {
    res.writeHead(400, {
      "Content-Type": "text/plain; charset=utf-8",
      ...SECURITY_HEADERS,
    });
    return res.end("400 Bad Request");
  }

  // NUL 字节会让 fs.readFile 同步抛错并击穿整个进程，直接拒绝
  if (pathname.includes("\0")) {
    res.writeHead(400, {
      "Content-Type": "text/plain; charset=utf-8",
      ...SECURITY_HEADERS,
    });
    return res.end("400 Bad Request");
  }

  if (pathname === "/") pathname = "/index.html";

  const filePath = resolve(STATIC_ROOT, `.${pathname}`);
  const relativePath = relative(STATIC_ROOT, filePath);
  // 只公开 index.html 与 resources/ 下的静态资源，避免 .git、源码等被下载
  if (
    relativePath.startsWith("..") ||
    isAbsolute(relativePath) ||
    (relativePath !== "index.html" && !relativePath.startsWith("resources/"))
  ) {
    res.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      ...SECURITY_HEADERS,
    });
    return res.end("404 Not Found");
  }

  const contentType =
    mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream";

  const cacheControl =
    relativePath === "index.html"
      ? "no-cache"
      : `public, max-age=${RESOURCE_MAX_AGE_SECONDS}`;

  _stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
        ...SECURITY_HEADERS,
      });
      return res.end("404 Not Found");
    }

    const cached = STATIC_CACHE.get(filePath);
    if (
      cached &&
      cached.mtimeMs === stat.mtimeMs &&
      cached.size === stat.size
    ) {
      return serveStaticFile(
        req,
        res,
        cached.data,
        stat,
        contentType,
        cacheControl,
      );
    }

    readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, {
          "Content-Type": "text/plain; charset=utf-8",
          ...SECURITY_HEADERS,
        });
        return res.end("404 Not Found");
      }

      STATIC_CACHE.set(filePath, {
        data,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
      });
      serveStaticFile(req, res, data, stat, contentType, cacheControl);
    });
  });
});

const wss = new Server({ noServer: true, maxPayload: 16 * 1024 });

httpServer.on("upgrade", (request, socket, head) => {
  const origin = request.headers.origin;
  if (allowedOrigins.size > 0 && (!origin || !allowedOrigins.has(origin))) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

function broadcastOnlineCount() {
  const onlineCount = [...wss.clients].filter(
    (client) => client.readyState === OPEN,
  ).length;
  const payload = JSON.stringify({ type: "presence", onlineCount });

  wss.clients.forEach((client) => {
    if (client.readyState === OPEN) client.send(payload);
  });
}

function broadcastTypingCount() {
  const typingCount = [...wss.clients].filter(
    (client) => client.readyState === OPEN && client.isTyping,
  ).length;
  const payloadOthers = JSON.stringify({ type: "typing", typingCount });
  const payloadSelf = JSON.stringify({
    type: "typing",
    typingCount: Math.max(0, typingCount - 1),
  });

  wss.clients.forEach((client) => {
    if (client.readyState !== OPEN) return;
    client.send(client.isTyping ? payloadSelf : payloadOthers);
  });
}

function isRateLimited(timestamps, limit, now = Date.now()) {
  while (timestamps.length > 0 && timestamps[0] <= now - RATE_LIMIT_WINDOW_MS) {
    timestamps.shift();
  }

  if (timestamps.length >= limit) return true;
  timestamps.push(now);
  return false;
}

function stopTyping(ws, shouldBroadcast = true) {
  clearTimeout(ws.typingTimer);
  if (!ws.isTyping) return;

  ws.isTyping = false;
  if (shouldBroadcast) broadcastTypingCount();
}

const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((client) => {
    if (client.isAlive === false) return client.terminate();

    client.isAlive = false;
    client.ping();
  });
}, HEARTBEAT_INTERVAL_MS);

wss.on("close", () => clearInterval(heartbeatTimer));

wss.on("error", (err) => {
  console.error("WebSocket server error:", err);
});

wss.on("connection", (ws) => {
  const recentMessages = [];
  const recentTypingUpdates = [];
  ws.isAlive = true;
  ws.isTyping = false;
  ws.typingTimer = null;
  broadcastOnlineCount();

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("close", () => {
    stopTyping(ws, false);
    broadcastOnlineCount();
    broadcastTypingCount();
  });

  ws.on("message", (message, isBinary) => {
    if (isBinary) return ws.close(1003, "Only text messages are supported");

    try {
      const parsedData = JSON.parse(message.toString());
      if (!parsedData || typeof parsedData !== "object") return;

      if (parsedData.type === "typing") {
        if (isRateLimited(recentTypingUpdates, TYPING_RATE_LIMIT_UPDATES)) {
          return;
        }

        const nextTypingState = parsedData.isTyping === true;
        clearTimeout(ws.typingTimer);

        if (nextTypingState) {
          ws.typingTimer = setTimeout(() => {
            stopTyping(ws);
          }, TYPING_TIMEOUT_MS);
        }

        if (ws.isTyping === nextTypingState) return;
        ws.isTyping = nextTypingState;
        broadcastTypingCount();
        return;
      }

      const clientId =
        typeof parsedData.clientId === "string"
          ? parsedData.clientId.slice(0, 100)
          : "";
      const nickname =
        typeof parsedData.nickname === "string"
          ? parsedData.nickname.trim().slice(0, MAX_NICKNAME_LENGTH)
          : "";
      const text =
        typeof parsedData.text === "string"
          ? parsedData.text.trim().slice(0, MAX_MESSAGE_LENGTH)
          : "";
      const system = allowedSystems.has(parsedData.system)
        ? parsedData.system
        : "Unknown";

      if (!text) return;

      stopTyping(ws);

      if (isRateLimited(recentMessages, RATE_LIMIT_MESSAGES)) return;

      const broadcastPayload = JSON.stringify({
        type: "message",
        clientId,
        nickname: nickname || "匿名迪克",
        system,
        text,
        time: new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      });

      wss.clients.forEach((client) => {
        if (client.readyState === OPEN) {
          client.send(broadcastPayload);
        }
      });
    } catch (err) {
      console.warn("Ignored invalid WebSocket message:", err.message);
    }
  });
});

httpServer.on("error", (err) => {
  console.error("Server error:", err);
  process.exitCode = 1;
});

httpServer.listen(PORT, "::", () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
