const fs = require("fs");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT) || 3000;
const STATIC_ROOT = __dirname;
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
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const httpServer = http.createServer((req, res) => {
  let pathname;

  try {
    pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("400 Bad Request");
  }

  if (pathname === "/") pathname = "/index.html";

  const filePath = path.resolve(STATIC_ROOT, `.${pathname}`);
  const relativePath = path.relative(STATIC_ROOT, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("403 Forbidden");
  }

  const contentType =
    mimeTypes[path.extname(filePath).toLowerCase()] ||
    "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 Not Found");
    }

    res.writeHead(200, {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    });
    return res.end(data);
  });
});

const wss = new WebSocket.Server({
  server: httpServer,
  maxPayload: 16 * 1024,
  verifyClient: ({ origin }, callback) => {
    callback(allowedOrigins.size === 0 || allowedOrigins.has(origin), 403);
  },
});

function broadcastOnlineCount() {
  const onlineCount = [...wss.clients].filter(
    (client) => client.readyState === WebSocket.OPEN,
  ).length;
  const payload = JSON.stringify({ type: "presence", onlineCount });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

function broadcastTypingCount() {
  const typingClients = [...wss.clients].filter(
    (client) => client.readyState === WebSocket.OPEN && client.isTyping,
  );

  wss.clients.forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) return;
    const typingCount = Math.max(
      0,
      typingClients.length - (client.isTyping ? 1 : 0),
    );
    client.send(JSON.stringify({ type: "typing", typingCount }));
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
        if (client.readyState === WebSocket.OPEN) {
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
