const myClientId =
  "client_" +
  Math.random().toString(36).substring(2, 15) +
  Date.now().toString(36);

const chatbox = document.getElementById("chatbox");
const chatContainer = document.getElementById("chat-container");
const chatEmptyState = document.getElementById("chat-empty-state");
const inputElement = document.getElementById("message");
const nicknameElement = document.getElementById("nickname");
const nicknameEditor = document.getElementById("nickname-editor");
const nicknameToggle = document.getElementById("nickname-toggle");
const statusElement = document.getElementById("connection-status");
const statusTextElement = document.getElementById("connection-status-text");
const onlineCountElement = document.getElementById("online-count");
const typingIndicator = document.getElementById("typing-indicator");
const typingText = document.getElementById("typing-text");
const sendButton = document.getElementById("send-button");
const welcomeScreen = document.getElementById("welcome-screen");
const welcomeContinue = document.getElementById("welcome-continue");
const welcomeWidget = document.getElementById("welcome-widget");
const welcomePrefix = document.getElementById("welcome-prefix");
const welcomeBrand = document.getElementById("welcome-brand");
const welcomeSuffix = document.getElementById("welcome-suffix");
const MAX_RENDERED_MESSAGES = 400;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;

const welcomeTranslations = [
  { prefix: "", suffix: "へようこそ", position: "before", lang: "ja" },
];

async function refreshWelcomeText(translation) {
  if (!welcomeWidget?.isConnected) return;

  const whiteParts = [welcomePrefix, welcomeSuffix];
  const outgoingAnimations = whiteParts.map((element) =>
    element.animate(
      [
        { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
        {
          opacity: 0.08,
          transform: "translateY(-4px)",
          filter: "blur(3.5px)",
        },
      ],
      {
        duration: 230,
        easing: "cubic-bezier(0.4, 0, 0.6, 1)",
        fill: "forwards",
      },
    ),
  );
  await Promise.allSettled(
    outgoingAnimations.map((animation) => animation.finished),
  );

  const oldBrandPosition = welcomeBrand.getBoundingClientRect();
  welcomePrefix.textContent = translation.prefix;
  welcomeSuffix.textContent = translation.suffix;
  welcomeWidget.dataset.brandPosition = translation.position;
  welcomeWidget.lang = translation.lang;
  const newBrandPosition = welcomeBrand.getBoundingClientRect();
  const movement = oldBrandPosition.left - newBrandPosition.left;
  const overshoot = movement === 0 ? 0 : movement > 0 ? -1.2 : 1.2;
  outgoingAnimations.forEach((animation) => animation.cancel());

  welcomeBrand.animate(
    [
      { transform: `translateX(${movement}px)`, filter: "blur(0)" },
      {
        offset: 0.44,
        transform: `translateX(${movement * 0.28}px)`,
        filter: "blur(1.4px)",
      },
      {
        offset: 0.8,
        transform: `translateX(${overshoot}px)`,
        filter: "blur(0)",
      },
      { transform: "translateX(0)", filter: "blur(0)" },
    ],
    { duration: 980, easing: "cubic-bezier(0.2, 0.9, 0.25, 1)" },
  );

  whiteParts.forEach((element) => {
    element.animate(
      [
        {
          opacity: 0.08,
          transform: "translateY(5px)",
          filter: "blur(4px)",
        },
        {
          offset: 0.64,
          opacity: 1,
          transform: "translateY(-0.5px)",
          filter: "blur(0)",
        },
        { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
      ],
      { duration: 680, easing: "cubic-bezier(0.2, 0.9, 0.25, 1)" },
    );
  });
}

async function runWelcomeFinale() {
  if (!welcomeWidget?.isConnected) return;

  const visibleWhiteParts = [welcomePrefix, welcomeSuffix].filter((element) =>
    element.textContent.trim(),
  );
  const whiteExitAnimations = visibleWhiteParts.map((element) =>
    element.animate(
      [
        { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
        {
          opacity: 0,
          transform: "translateY(-5px)",
          filter: "blur(6px)",
        },
      ],
      {
        duration: 260,
        easing: "cubic-bezier(0.4, 0, 0.6, 1)",
        fill: "forwards",
      },
    ),
  );
  await Promise.allSettled(
    whiteExitAnimations.map((animation) => animation.finished),
  );

  const oldBrandPosition = welcomeBrand.getBoundingClientRect();
  welcomePrefix.textContent = "";
  welcomeSuffix.textContent = "";
  const centeredBrandPosition = welcomeBrand.getBoundingClientRect();
  const movement = oldBrandPosition.left - centeredBrandPosition.left;
  whiteExitAnimations.forEach((animation) => animation.cancel());

  const centeringAnimation = welcomeBrand.animate(
    [
      { transform: `translateX(${movement}px)`, filter: "blur(0)" },
      {
        offset: 0.52,
        transform: `translateX(${movement * 0.24}px)`,
        filter: "blur(1.2px)",
      },
      { transform: "translateX(0)", filter: "blur(0)" },
    ],
    { duration: 600, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  );
  await Promise.allSettled([centeringAnimation.finished]);

  if (welcomeWidget.isConnected) welcomeWidget.classList.add("is-finalizing");
}

let welcomeStarted = false;

function startWelcome() {
  if (welcomeStarted || !welcomeScreen?.isConnected) return;
  welcomeStarted = true;
  welcomeContinue.disabled = true;
  welcomeContinue.classList.add("is-leaving");
  welcomeContinue.addEventListener(
    "animationend",
    () => {
      welcomeContinue.hidden = true;
    },
    { once: true },
  );
  welcomeScreen.classList.add("has-started");
  document.body.classList.add("welcome-started");

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    welcomeTranslations.forEach((translation, index) => {
      setTimeout(() => refreshWelcomeText(translation), (index + 1) * 1400);
    });
    setTimeout(runWelcomeFinale, 2650);
  }
}

welcomeContinue?.addEventListener("click", startWelcome);

welcomeScreen?.addEventListener("animationend", (event) => {
  if (event.target === welcomeScreen) welcomeScreen.remove();
});

let ws;
let reconnectTimer;
let reconnectAttempts = 0;
let sendGlowTimer;
let typingIdleTimer;
let isTyping = false;
let isComposing = false;

function setNicknameEditorOpen(open) {
  nicknameEditor.classList.toggle("is-open", open);
  nicknameToggle.setAttribute("aria-expanded", String(open));
  nicknameToggle.title = open ? "收起昵称编辑" : "编辑昵称";

  if (open) {
    requestAnimationFrame(() => {
      nicknameElement.focus();
      nicknameElement.select();
    });
  }
}

function revealFirstMessage() {
  if (!chatContainer.classList.contains("is-empty")) return;
  chatEmptyState.classList.add("is-leaving");
  chatContainer.classList.remove("is-empty");
  setTimeout(() => chatEmptyState.remove(), 380);
}

nicknameToggle.addEventListener("click", () => {
  setNicknameEditorOpen(!nicknameEditor.classList.contains("is-open"));
});
nicknameElement.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setNicknameEditorOpen(false);
    nicknameToggle.focus();
  }
});
document.addEventListener("pointerdown", (event) => {
  if (
    nicknameEditor.classList.contains("is-open") &&
    !nicknameEditor.contains(event.target)
  ) {
    setNicknameEditorOpen(false);
  }
});

const systemDetails = {
  windows: {
    name: "Windows",
    icon: '<svg viewBox="0 0 24 24"><path d="M2 3.4 11 2.2v9.3H2V3.4Zm10 8.1V2l10-1.4v10.9H12ZM2 12.5h9v9.3l-9-1.2v-8.1Zm10 0h10v10.9L12 22v-9.5Z"/></svg>',
  },
  macos: {
    name: "macOS",
    icon: '<svg viewBox="0 0 24 24"><rect x="1.5" y="1.5" width="21" height="21" rx="5.2" fill="#38a9e8"/><path d="M12 1.5h5.3a5.2 5.2 0 0 1 5.2 5.2v10.6a5.2 5.2 0 0 1-5.2 5.2H12v-21Z" fill="#bce7f8"/><path d="M12 1.8c.1 3.2-1.2 5.2-2.7 7.1-1 1.3-1.6 2.6-1.3 4" fill="none" stroke="#103b5b" stroke-linecap="round" stroke-width="1.15"/><path d="M7.4 9.1v1.4M16.7 9.1v1.4" fill="none" stroke="#103b5b" stroke-linecap="round" stroke-width="1.3"/><path d="M6.7 15.2c1.3 1.9 3.1 2.8 5.3 2.8s4-.9 5.3-2.8" fill="none" stroke="#103b5b" stroke-linecap="round" stroke-width="1.2"/><rect x="1.5" y="1.5" width="21" height="21" rx="5.2" fill="none" stroke="#d9f3ff" stroke-opacity=".5"/></svg>',
  },
  ios: {
    name: "iOS",
    icon: '<svg viewBox="0 0 24 28"><path d="M16.7 13.5c0-3 2.5-4.4 2.6-4.5-1.4-2.1-3.6-2.3-4.4-2.3-1.9-.2-3.7 1.1-4.6 1.1-1 0-2.4-1.1-4-1.1-2.1 0-4 1.2-5.1 3.1-2.2 3.8-.6 9.4 1.6 12.5 1.1 1.5 2.3 3.2 4 3.1 1.6-.1 2.2-1 4.2-1s2.5 1 4.2.9c1.7 0 2.8-1.5 3.8-3 1.2-1.8 1.7-3.5 1.7-3.6-.1 0-3.4-1.3-3.4-5.2ZM13.7 4.7c.9-1.1 1.5-2.6 1.3-4.1-1.3.1-2.8.9-3.7 2-.8.9-1.5 2.4-1.3 3.8 1.4.1 2.8-.7 3.7-1.7Z"/></svg>',
  },
  android: {
    name: "Android",
    icon: '<svg viewBox="0 0 24 24"><path d="m7.2 5.4-1.4-2a.7.7 0 0 1 1.1-.8l1.5 2.1A8.6 8.6 0 0 1 12 4c1.3 0 2.5.3 3.6.7l1.5-2.1a.7.7 0 0 1 1.1.8l-1.4 2A7.4 7.4 0 0 1 20 11H4a7.4 7.4 0 0 1 3.2-5.6ZM8 8.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM4 12h16v6a2 2 0 0 1-2 2h-1v2a1 1 0 0 1-2 0v-2H9v2a1 1 0 0 1-2 0v-2H6a2 2 0 0 1-2-2v-6Z"/></svg>',
  },
  linux: {
    name: "Linux",
    icon: '<svg viewBox="0 0 24 24"><path d="M12 1.5c-3 0-4.2 2.7-4 5.4-1.8 1.7-3 4.4-3 7.3 0 2.1.8 3.2 2 3.7-.7.8-1.5 1.5-2.4 2.1-.5.4-.2 1.2.4 1.2 1.8 0 3.3-.4 4.4-1.2.8.5 1.7.7 2.6.7s1.8-.2 2.6-.7c1.1.8 2.6 1.2 4.4 1.2.6 0 .9-.8.4-1.2-.9-.6-1.7-1.3-2.4-2.1 1.2-.5 2-1.6 2-3.7 0-2.9-1.2-5.6-3-7.3.2-2.7-1-5.4-4-5.4Z"/><ellipse cx="12" cy="14" rx="4.5" ry="5.2" fill="#f8fafc"/><circle cx="10" cy="6" r="1" fill="#f8fafc"/><circle cx="14" cy="6" r="1" fill="#f8fafc"/><path d="m9.7 8.2 2.3-1 2.3 1-2.3 1.6-2.3-1.6Z" fill="#fbbf24"/></svg>',
  },
  chromeos: {
    name: "ChromeOS",
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ef4444"/><path d="M12 12 4.3 20.2A10 10 0 0 1 2.6 8h9.4Z" fill="#22c55e"/><path d="M12 12h9.4a10 10 0 0 1-17.1 8.2Z" fill="#facc15"/><circle cx="12" cy="12" r="4.2" fill="#38bdf8" stroke="#e0f2fe" stroke-width="1.3"/></svg>',
  },
  unknown: {
    name: "未知系统",
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 21h8M12 17v4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"/></svg>',
  },
};

const systemKeys = {
  Windows: "windows",
  macOS: "macos",
  "iOS/iPadOS": "ios",
  Linux: "linux",
  Android: "android",
  Chromeos: "chromeos",
  Unknown: "unknown",
};

function detectSystem() {
  const userAgentDataPlatform = navigator.userAgentData?.platform || "";
  const source = `${userAgentDataPlatform} ${navigator.platform || ""} ${navigator.userAgent || ""}`;

  if (/CrOS/i.test(source)) return "Chromeos";
  if (/Android/i.test(source)) return "Android";
  if (/iPhone|iPad|iPod/i.test(source)) return "iOS/iPadOS";
  if (/Mac/i.test(source) && navigator.maxTouchPoints > 1) return "iOS/iPadOS";
  if (/Win/i.test(source)) return "Windows";
  if (/Mac/i.test(source)) return "macOS";
  if (/Linux|X11/i.test(source)) return "Linux";
  return "Unknown";
}

const currentSystem = detectSystem();

function getWebSocketUrl() {
  // Android APK loads the bundled interface from a local file, while the chat
  // service continues to run on the public Contento24 server.
  if (window.location.protocol === "file:") {
    return "wss://l.867678.xyz/contento24/";
  }

  if (!window.location.host) return "ws://127.0.0.1:3000/";

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const pathname = window.location.pathname.endsWith("/")
    ? window.location.pathname
    : `${window.location.pathname}/`;
  return `${protocol}//${window.location.host}${pathname}`;
}

function setConnectionStatus(text, connected) {
  statusElement.setAttribute("aria-label", text);
  statusElement.title = text;
  statusTextElement.textContent = text;
  statusElement.dataset.connected = String(connected);
  if (!connected) {
    onlineCountElement.textContent = "–";
    onlineCountElement.title = "连接后显示在线人数";
    setTypingCount(0);
  }
  sendButton.disabled = !connected;
}

function setTypingCount(count) {
  const safeCount = Number.isInteger(count) && count > 0 ? count : 0;
  typingText.textContent = safeCount > 0 ? `${safeCount} 人正在输入` : "";
  typingIndicator.classList.toggle("is-visible", safeCount > 0);
}

function sendTypingState(nextState) {
  if (isTyping === nextState) return;
  isTyping = nextState;
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "typing",
        clientId: myClientId,
        isTyping: nextState,
      }),
    );
  }
}

function setOnlineCount(count) {
  const safeCount = Number.isInteger(count) && count >= 0 ? count : 0;
  onlineCountElement.textContent = String(safeCount);
  onlineCountElement.title = `${safeCount} 人在线`;
  onlineCountElement.classList.remove("count-updated");
  void onlineCountElement.offsetWidth;
  onlineCountElement.classList.add("count-updated");
}

function getReconnectDelay() {
  const exponentialDelay = Math.min(
    RECONNECT_MAX_DELAY_MS,
    RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempts,
  );
  const jitterMultiplier = 0.75 + Math.random() * 0.25;
  reconnectAttempts += 1;
  return Math.round(exponentialDelay * jitterMultiplier);
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  if (!navigator.onLine) {
    setConnectionStatus("网络离线，等待恢复…", false);
    return;
  }

  const delay = getReconnectDelay();
  setConnectionStatus(
    `失去连接，将在 ${Math.ceil(delay / 1000)} 秒后重试…`,
    false,
  );
  reconnectTimer = setTimeout(initWebSocket, delay);
}

function initWebSocket() {
  clearTimeout(reconnectTimer);
  if (
    ws?.readyState === WebSocket.OPEN ||
    ws?.readyState === WebSocket.CONNECTING
  )
    return;

  setConnectionStatus("正在连接…", false);
  const socket = new WebSocket(getWebSocketUrl());
  ws = socket;

  socket.onopen = () => {
    reconnectAttempts = 0;
    setConnectionStatus("已连接", true);
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "presence") {
        setOnlineCount(data.onlineCount);
        return;
      }
      if (data.type === "typing") {
        setTypingCount(data.typingCount);
        return;
      }
      if (data.type !== "message") return;

      revealFirstMessage();

      const isMe = data.clientId === myClientId;
      const row = document.createElement("div");
      row.className = `message-row ${isMe ? "row-me" : "row-other"}`;

      const meta = document.createElement("div");
      meta.className = "message-meta";

      const user = document.createElement("span");
      user.className = "message-user";
      user.textContent = `${data.nickname}${isMe ? " (我)" : ""}`;

      const identity = document.createElement("div");
      identity.className = "message-identity";

      const systemKey = systemKeys[data.system] || "unknown";
      const systemInfo = systemDetails[systemKey];
      const system = document.createElement("span");
      system.className = `message-system system-${systemKey}`;

      const systemIcon = document.createElement("span");
      systemIcon.className = "system-icon";
      systemIcon.setAttribute("aria-hidden", "true");
      systemIcon.innerHTML = systemInfo.icon;

      const systemName = document.createElement("span");
      systemName.textContent = systemInfo.name;
      system.append(systemIcon, systemName);
      identity.append(user, system);

      const time = document.createElement("span");
      time.textContent = data.time;

      const card = document.createElement("div");
      card.className = "message-card";
      const messageText = document.createElement("div");
      messageText.className = "message-text";
      messageText.textContent = data.text;

      if (data.text === "小尹") {
        card.classList.add("message-card-giant-egg");
        messageText.classList.add("message-text-giant-egg");
      }

      meta.append(identity, time);
      card.appendChild(messageText);
      row.append(meta, card);
      chatbox.appendChild(row);
      const renderedMessages = chatbox.querySelectorAll(".message-row");
      if (renderedMessages.length > MAX_RENDERED_MESSAGES) {
        renderedMessages[0].remove();
      }
      chatbox.scrollTo({ top: chatbox.scrollHeight, behavior: "smooth" });
    } catch (err) {
      console.error("Invalid server message", err);
    }
  };

  socket.onerror = (err) => console.error("WebSocket error", err);
  socket.onclose = () => {
    if (ws !== socket) return;
    ws = undefined;
    clearTimeout(typingIdleTimer);
    isTyping = false;
    scheduleReconnect();
  };
}

window.addEventListener("online", () => {
  reconnectAttempts = 0;
  initWebSocket();
});

window.addEventListener("offline", () => {
  clearTimeout(reconnectTimer);
  setConnectionStatus("网络离线，等待恢复…", false);
  ws?.close();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !ws) initWebSocket();
});

const destructionEgg = {
  prompt: "root@contento24",
  lineDelay: 460,
  revealDelay: 3100,
  theme: "green",
  environment: "UNI RECOVERY ENVIRONMENT",
  status: "SECURE",
  mark: "24",
  kicker: "OPERATION COMPLETE",
  headline: "Nice try.",
  body: "消息本就阅后即逝。<br />你删了个寂寞。",
  messages: [
    "[  OK  ] Elevated privileges granted.",
    "[  OK  ] Locating persistent chat history...",
    "[ WARN ] No persistent records found.",
    "[  OK  ] Purging 0 archived messages.",
    "[  OK  ] Clearing imaginary cache... 100%",
    "[ DONE ] Nothing was destroyed.",
  ],
};

function createMacEgg({ status, mark, kicker, headline, body, messages }) {
  return {
    variant: "macos",
    presentation: "terminal",
    lineDelay: 190,
    theme: "blue",
    environment: "MACOS TERMINAL",
    status,
    mark,
    kicker,
    headline,
    body,
    messages,
  };
}

const easterEggProfiles = new Map([
  ["sudo rm -rf /*", destructionEgg],
  ["rm -rf /*", destructionEgg],
  ["rm -rf /", destructionEgg],
  [
    "BAM",
    {
      variant: "quarantine",
      lineDelay: 300,
      theme: "red",
      environment: "CONTENT QUARANTINE",
      status: "BLOCKED",
      mark: "!",
      kicker: "CONTENT REJECTED",
      headline: "到此为止。",
      body: "BAM 与心雨相关内容不受欢迎，<br />晦气不应该出现在 Contento24 中。",
      messages: [
        "[ SCAN ] Unwelcome keyword detected.",
        "[ HOLD ] Message transmission suspended.",
        "[  OK  ] No content was broadcast.",
        "[  OK  ] Conversation atmosphere preserved.",
        "[ DONE ] Input moved to quarantine.",
      ],
    },
  ],
  [
    "sw_vers",
    createMacEgg({
      status: "DARWIN",
      mark: "",
      kicker: "PRODUCT VERSION",
      headline: "macOS Contento",
      body: "版本号会留下。<br />聊天记录不会。",
      messages: [
        "ProductName:            macOS",
        "ProductVersion:         24.0",
        "BuildVersion:           Contento24",
        "ReleaseType:            Ephemeral",
      ],
    }),
  ],
  [
    "system_profiler SPSoftwareDataType",
    createMacEgg({
      status: "REPORT",
      mark: "",
      kicker: "SOFTWARE OVERVIEW",
      headline: "关于本聊天室",
      body: "一份非常详细的报告，<br />唯独没有聊天历史。",
      messages: [
        "System Software Overview:",
        "  System Version: macOS Contento 24",
        "  Kernel Version: Darwin 24.0.0",
        "  Boot Volume: Midnight Glass",
        "  Computer Name: Uni Contento24",
        "  Time since boot: until refresh",
      ],
    }),
  ],
  [
    "defaults write com.apple.finder AppleShowAllFiles -bool true",
    createMacEgg({
      status: "WRITTEN",
      mark: ".*",
      kicker: "FINDER PREFERENCE UPDATED",
      headline: "隐藏文件已现身。",
      body: "`.easter-eggs` 出现了。<br />`.chat_history` 依旧不存在。",
      messages: [
        "Writing domain com.apple.finder...",
        "AppleShowAllFiles = 1",
        "Preference synchronized.",
        "Hint: run `killall Finder` to apply changes.",
      ],
    }),
  ],
  [
    "killall Finder",
    createMacEgg({
      status: "RELAUNCHED",
      mark: ":)",
      kicker: "FINDER RESTARTED",
      headline: "访达回来了。",
      body: "笑脸短暂消失了一下，<br />然后假装什么都没发生。",
      messages: [
        "Sending TERM signal to Finder...",
        "Waiting for launchd...",
        "com.apple.finder relaunched",
        "Desktop icons restored.",
      ],
    }),
  ],
  [
    "killall Dock",
    createMacEgg({
      status: "RELAUNCHED",
      mark: "▤",
      kicker: "DOCK RESTARTED",
      headline: "Dock 掉下去又弹回来了。",
      body: "图标重新排列，放大效果重新加载。<br />你假装这不是在修复 Dock 卡死。",
      messages: [
        "Sending TERM signal to Dock...",
        "Process Dock exited with status 0",
        "launchd: spawning com.apple.Dock.agent",
        "Restoring persistent-apps...",
        "Magnification and hot corners reloaded.",
      ],
    }),
  ],
  [
    "caffeinate",
    createMacEgg({
      status: "AWAKE",
      mark: "☕",
      kicker: "IDLE SLEEP PREVENTED",
      headline: "这台 Mac 不睡了。",
      body: "屏幕可以醒着，<br />但消息仍会在刷新时离开。",
      messages: [
        "Creating power assertion...",
        "PreventUserIdleSystemSleep = 1",
        "Reason: Contento24 conversation in progress",
        "Assertion will expire when this page closes.",
      ],
    }),
  ],
  [
    "pbcopy",
    createMacEgg({
      status: "CLIPBOARD",
      mark: "⌘C",
      kicker: "PASTEBOARD WAITING",
      headline: "你复制了空气。",
      body: "标准输入为空。<br />剪贴板获得了一份非常纯净的内容。",
      messages: [
        "Reading standard input...",
        "0 bytes received",
        "General pasteboard updated",
        "Clipboard now contains: absolutely nothing",
      ],
    }),
  ],
  [
    "open .",
    createMacEgg({
      status: "OPENED",
      mark: "⌘O",
      kicker: "WORKING DIRECTORY REVEALED",
      headline: "已在访达中打开。",
      body: "当前位置：Contento24。<br />里面仍然没有消息归档。",
      messages: [
        "Resolving current directory...",
        "Request sent to LaunchServices",
        "Opening contento24://current-session",
        "Finder activated.",
      ],
    }),
  ],
  [
    "screencapture -i",
    createMacEgg({
      status: "CAPTURE",
      mark: "⌘⇧4",
      kicker: "INTERACTIVE CAPTURE",
      headline: "框选你想留下的瞬间。",
      body: "截图可以保存画面，<br />却保存不了下一次刷新前的聊天室。",
      messages: [
        "Interactive selection mode enabled",
        "Crosshair cursor prepared",
        "Window shadow: enabled",
        "Destination: ~/Desktop/Contento24.png",
      ],
    }),
  ],
  [
    "diskutil list",
    createMacEgg({
      status: "APFS",
      mark: "◉",
      kicker: "DISK INVENTORY",
      headline: "找不到历史分区。",
      body: "所有磁盘都已挂载。<br />Persistent Chat Volume 从未被创建。",
      messages: [
        "/dev/disk24 (synthesized):",
        "  0: APFS Container Scheme              +24.0 GB   disk24",
        "  1: APFS Volume Contento24               2.4 GB   disk24s1",
        "  2: APFS Volume Midnight Glass          24.0 MB   disk24s2",
        "  3: APFS Volume Chat History                 0 B   disk24s3",
      ],
    }),
  ],
  [
    "csrutil status",
    createMacEgg({
      status: "PROTECTED",
      mark: "SIP",
      kicker: "SYSTEM INTEGRITY PROTECTION",
      headline: "System Integrity Protection: enabled.",
      body: "系统受到保护。<br />彩蛋也不会真的修改你的 Mac。",
      messages: [
        "System Integrity Protection status: enabled.",
        "Filesystem Protections: enabled",
        "Debugging Restrictions: enabled",
        "Contento24 Imagination Mode: enabled",
      ],
    }),
  ],
  [
    "spctl --status",
    createMacEgg({
      status: "ASSESSMENTS",
      mark: "✓",
      kicker: "GATEKEEPER ASSESSMENT",
      headline: "assessments enabled",
      body: "Gatekeeper 检查了彩蛋。<br />结论：已签名，但签名者是想象力。",
      messages: [
        "assessments enabled",
        "source=Notarized Developer ID",
        "origin=Developer ID Application: Uni Contento24",
        "verdict=accepted",
      ],
    }),
  ],
  [
    "softwareupdate -l",
    createMacEgg({
      status: "CURRENT",
      mark: "↻",
      kicker: "SOFTWARE UPDATE",
      headline: "Your Mac is up to date.",
      body: "没有新系统可装。<br />Contento24 的下一条消息除外。",
      messages: [
        "Software Update Tool",
        "Finding available software...",
        "No new software available.",
        "Last successful check: just now",
      ],
    }),
  ],
  [
    "xcode-select --install",
    createMacEgg({
      status: "DEVELOPER",
      mark: "⌘",
      kicker: "COMMAND LINE TOOLS",
      headline: "已经装过了，开发者。",
      body: "clang、git 和 make 都在。<br />现在只差一个不在生产环境改代码的习惯。",
      messages: [
        "xcode-select: note: install requested",
        "Checking for Command Line Tools...",
        "Command Line Tools are already installed.",
        "Active developer directory: /Applications/Xcode.app/Contents/Developer",
      ],
    }),
  ],
  [
    "mdfind Contento24",
    createMacEgg({
      status: "SPOTLIGHT",
      mark: "⌕",
      kicker: "METADATA QUERY COMPLETE",
      headline: "Spotlight 找到了你。",
      body: "它找到了项目、README 和图标。<br />唯独搜不到已经消失的消息。",
      messages: [
        "/Applications/Contento24.app",
        "/Users/user/Projects/contento24/README.md",
        "/Users/user/Library/Memories/contento24.alias",
        "Query completed in 0.024 seconds.",
      ],
    }),
  ],
  [
    "say Contento24",
    createMacEgg({
      status: "SPEECH",
      mark: "♫",
      kicker: "SPEECH SYNTHESIZER",
      headline: "Mac 已经念出来了。",
      body: "浏览器为了礼貌保持安静。<br />但你脑海里的 Samantha 已经开口。",
      messages: [
        "Voice: Samantha",
        "Locale: zh_CN / en_US mixed",
        "Speaking: Contento24",
        "Utterance completed.",
      ],
    }),
  ],
  [
    "pmset -g batt",
    createMacEgg({
      status: "BATTERY",
      mark: "⚡",
      kicker: "POWER SOURCE",
      headline: "Now drawing from Battery Power",
      body: "电量足够聊到刷新。<br />然后一切重新从 100% 开始。",
      messages: [
        "Now drawing from 'Battery Power'",
        " -InternalBattery-0 (id=24)  100%; discharging; 24:00 remaining",
        " Low Power Mode: 0",
        " Optimized charging: enabled",
      ],
    }),
  ],
  [
    "networksetup -getinfo Wi-Fi",
    createMacEgg({
      status: "WI-FI",
      mark: "⌁",
      kicker: "NETWORK SERVICE INFORMATION",
      headline: "Wi-Fi 知道怎么回家。",
      body: "路由正常，WebSocket 已连接。<br />IP 地址当然不会写进彩蛋。",
      messages: [
        "DHCP Configuration",
        "IP address: 192.0.2.24",
        "Subnet mask: 255.255.255.0",
        "Router: 192.0.2.1",
        "IPv6: Automatic",
      ],
    }),
  ],
  [
    ":(){ :|:& };:",
    {
      variant: "panic",
      presentation: "card",
      lineDelay: 300,
      theme: "red",
      environment: "PROCESS CONTAINMENT UNIT",
      status: "ISOLATED",
      mark: ":&",
      kicker: "FORK BOMB CONTAINED",
      headline: "Nice fork.",
      body: "无限递归已被关进 /dev/null。<br />CPU 松了一口气。",
      messages: [
        "[ WARN ] Recursive function signature detected.",
        "[  OK  ] Cgroup containment enabled.",
        "[  OK  ] Process limit set to: absolutely not.",
        "[  OK  ] Forks redirected to /dev/null.",
        "[  OK  ] Load average restored to 0.24.",
        "[ DONE ] Timeline preserved.",
      ],
    },
  ],
  [
    "sudo apt install girlfriend",
    {
      variant: "apt",
      presentation: "terminal",
      theme: "amber",
      environment: "APT PACKAGE MANAGER",
      status: "ONLINE",
      mark: "404",
      kicker: "E: PACKAGE HAS NO INSTALLATION CANDIDATE",
      headline: "依赖关系无法解决。",
      body: "girlfriend 依赖 communication、timing 与 mutual-interest。<br />这些包均不在默认软件源中。",
      messages: [
        "Reading package lists... Done",
        "Building dependency tree... Done",
        "Reading state information... Done",
        "E: Package 'girlfriend' has no installation candidate",
        "N: This package cannot be installed non-interactively",
        "0 upgraded, 0 newly installed, 0 to remove.",
      ],
    },
  ],
  [
    "sudo apt update",
    {
      variant: "apt",
      presentation: "terminal",
      theme: "amber",
      environment: "APT SOURCE REFRESH",
      status: "UP TO DATE",
      mark: "APT",
      kicker: "REPOSITORY METADATA REFRESHED",
      headline: "软件源已醒来。",
      body: "可升级的软件包：0。<br />可恢复的聊天记录：同样是 0。",
      messages: [
        "Hit:1 https://repo.contento24.local stable InRelease",
        "Get:2 https://mirror.uni.chat ephemeral/main amd64 Packages [24 kB]",
        "Get:3 https://mirror.uni.chat ephemeral/main Translation-zh_CN [24 B]",
        "Fetched 24.0 kB in 0s (96.0 kB/s)",
        "Reading package lists... Done",
        "All packages are up to date.",
      ],
    },
  ],
  [
    "pacman -Syu",
    {
      variant: "arch",
      presentation: "terminal",
      lineDelay: 360,
      theme: "blue",
      environment: "ARCH ROLLING RELEASE",
      status: "BLEEDING EDGE",
      mark: "A",
      kicker: "TRANSACTION COMPLETED",
      headline: "系统滚到了明天。",
      body: "升级成功，而且没有进入 emergency shell。<br />这本身就是今日彩蛋。",
      messages: [
        ":: Synchronizing package databases...",
        " core                 117.4 KiB   702 KiB/s 00:00 [################] 100%",
        " extra                  8.1 MiB  18.2 MiB/s 00:00 [################] 100%",
        ":: Starting full system upgrade...",
        "resolving dependencies... looking for conflicting packages...",
        "Packages (1) contento24-24.0-1",
      ],
    },
  ],
  [
    "brew update",
    {
      variant: "brew",
      presentation: "receipt",
      theme: "amber",
      environment: "HOMEBREW UPDATE SERVICE",
      status: "POURED",
      mark: "🍺",
      kicker: "TAPS REFRESHED",
      headline: "酒单换新了。",
      body: "新增 ephemeral/tap。<br />persistent-history 已被标记为 discontinued。",
      messages: [
        "==> Updating Homebrew...",
        "Updated 2 taps (homebrew/core and contento24/tap).",
        "==> New Formulae",
        "ephemeral-chat    midnight-glass",
        "==> Outdated Formulae",
        "persistent-history",
      ],
    },
  ],
  [
    "brew upgrade",
    {
      variant: "brew",
      presentation: "receipt",
      theme: "amber",
      environment: "HOMEBREW CELLAR",
      status: "LATEST",
      mark: "↑",
      kicker: "BOTTLES POURED",
      headline: "Cellar 已焕新。",
      body: "旧版本已 cleanup。<br />旧聊天也没有留下 keg-only 副本。",
      messages: [
        "==> Upgrading 2 outdated packages:",
        "contento24 23.9 -> 24.0",
        "websocket 8.20 -> 8.24",
        "==> Pouring contento24--24.0.arm64.bottle.tar.gz",
        "🍺  /opt/homebrew/Cellar/contento24/24.0",
        "==> Running `brew cleanup contento24`...",
      ],
    },
  ],
  [
    "brew doctor",
    {
      variant: "doctor",
      presentation: "terminal",
      lineDelay: 520,
      theme: "cyan",
      environment: "HOMEBREW DIAGNOSTICS",
      status: "HEALTHY",
      mark: "+",
      kicker: "NO ACTION REQUIRED",
      headline: "医生说你很健康。",
      body: "唯一的警告：你正在尝试诊断一个<br />刻意不保留历史记录的聊天室。",
      messages: [
        "Please note that these warnings are just used to help Homebrew maintainers",
        "diagnose issues if you file one.",
        "Checking taps... OK",
        "Checking Cellar permissions... OK",
        "Checking ephemeral message cache... empty",
        "Your system is ready to brew.",
      ],
    },
  ],
  [
    "brew list",
    {
      variant: "cellar",
      presentation: "terminal",
      theme: "blue",
      environment: "HOMEBREW CELLAR INDEX",
      status: "5 KEGS",
      mark: "//",
      kicker: "CELLAR INVENTORY",
      headline: "五只干净的瓶子。",
      body: "配方都在，聊天记录不在。<br />这是 feature，不是 missing dependency。",
      messages: [
        "contento24",
        "ephemeral-chat",
        "midnight-glass",
        "pingfang-semibold",
        "websocket",
        "[ DONE ] 5 formulae listed.",
      ],
    },
  ],
  [
    "brew install contento24",
    {
      variant: "brew",
      presentation: "receipt",
      theme: "purple",
      environment: "HOMEBREW INSTALLER",
      status: "KEGGED",
      mark: "24",
      kicker: "INSTALLATION REFUSED BY REALITY",
      headline: "它早已安装完成。",
      body: "Homebrew 检查了 prefix，随后发现：<br />你此刻就在 Contento24 里面。",
      messages: [
        "==> Fetching contento24",
        "==> Downloading contento24--24.0.arm64.bottle.tar.gz",
        "==> Pouring contento24--24.0.arm64.bottle.tar.gz",
        "==> Caveats: messages vanish after refresh",
        "🍺  /opt/homebrew/Cellar/contento24/24.0: 24 files",
        "==> Installation successful!",
      ],
    },
  ],
  [
    "neofetch",
    {
      variant: "fetch",
      presentation: "terminal",
      lineDelay: 180,
      theme: "cyan",
      environment: "CONTENTOOS SYSTEM INFO",
      status: "TTY24",
      mark: "UNI",
      kicker: "LEGACY FETCH COMPLETE",
      headline: "ContentoOS / tty24",
      body: "一台只活到刷新前的机器。<br />Logo 很大，历史记录为零。",
      messages: [
        "user@contento24",
        "-----------------",
        "OS: ContentoOS 24 x86_64",
        "Kernel: 24.0.0-ephemeral",
        "Shell: contentosh  /  WM: Midnight Glass",
        "Memory: 24 MiB / ∞ MiB",
      ],
    },
  ],
  [
    "fastfetch",
    {
      variant: "fetch fast",
      presentation: "terminal",
      lineDelay: 90,
      theme: "blue",
      environment: "CONTENTOOS FASTFETCH",
      status: "6ms",
      mark: "C24",
      kicker: "6.24 ms · ZERO PLUGINS",
      headline: "快到来不及截图。",
      body: "fastfetch 先完成了。<br />neofetch 还在打印 ASCII Logo。",
      messages: [
        "contento@uni",
        "-------------",
        "OS: ContentoOS 24 (Ephemeral)",
        "Host: Uni Contento24 (WebSocket Edition)",
        "Kernel: 24.0.0-ephemeral  •  Shell: contentosh",
        "Uptime: 00:00:24  •  Packages: 24 (pnpm)",
      ],
    },
  ],
  [
    "uname -a",
    {
      variant: "kernel",
      presentation: "terminal",
      lineDelay: 240,
      theme: "cyan",
      environment: "KERNEL IDENTITY SERVICE",
      status: "GNU/LINUX",
      mark: "🐧",
      kicker: "UNAME(1) · COREUTILS",
      headline: "内核没有秘密。",
      body: "除了它并不存在。<br />这只是浏览器认真扮演的一台 Linux。",
      messages: [
        "Linux contento24 24.0.0-vanish #1 SMP PREEMPT_DYNAMIC",
        "Uni ContentoOS GNU/Linux x86_64",
        "#24 SMP PREEMPT_DYNAMIC Thu Jul 17 00:24:00 CST 2026",
        "x86_64 GNU/Linux",
        "hostname=contento24  namespace=browser",
        "uptime_policy=until-refresh",
      ],
    },
  ],
  [
    "sl",
    {
      variant: "train",
      presentation: "card",
      lineDelay: 220,
      theme: "amber",
      environment: "STEAM LOCOMOTIVE SERVICE",
      status: "DELAYED",
      mark: "SL",
      kicker: "COMMAND NOT FOUND? NOT TODAY.",
      headline: "ls 晚了一步。",
      body: "你敲反了两个字母，<br />于是终端决定给你一整列火车。",
      messages: [
        "      ====        ________                ___________",
        "  _D _|  |_______/        \\__I_I_____===__|_________|",
        "   |(_)---  |   H\\________/ |   |        =|___ ___|",
        "   /     |  |   H  |  |     |   |         ||_| |_||",
        "  |      |  |   H  |__--------------------| [___] |",
        "[ DONE ] Choo choo.",
      ],
    },
  ],
  [
    "ls",
    {
      variant: "files",
      presentation: "terminal",
      lineDelay: 180,
      theme: "cyan",
      environment: "CONTENTO24 FILE SYSTEM",
      status: "READ ONLY",
      mark: "~/",
      kicker: "6 ENTRIES · 0 ARCHIVES",
      headline: "目录会说实话。",
      body: "`memories` 指向 `/dev/null`。<br />你要找的历史记录从未成为文件。",
      messages: [
        "drwxr-xr-x  1 user user  24 Jul 16  contento24/",
        "-rw-------  1 user user   0 Jul 17  chat_history",
        "lrwxrwxrwx  1 user user   9 Jul 17  memories -> /dev/null",
        "-rwxr-xr-x  1 user user  24 Jul 17  welcome.sh*",
        "-rw-r--r--  1 user user  42 Jul 17  README.md",
        "drwx------  1 user user  24 Jul 17  .easter-eggs/",
      ],
    },
  ],
  [
    "sudo make me a sandwich",
    {
      variant: "sandwich",
      presentation: "card",
      lineDelay: 430,
      theme: "purple",
      environment: "SUDO POLICY SERVICE",
      status: "AUTHORIZED",
      mark: "🥪",
      kicker: "XKCD PROTOCOL SATISFIED",
      headline: "Okay.",
      body: "普通请求被拒绝。<br />sudo 请求获得了一份 root 权限三明治。",
      messages: [
        "[sudo] password for user: ********",
        "Checking /etc/sudoers...",
        "User may run sandwich commands.",
        "Slicing dependencies...",
        "Installing lettuce and cheese...",
        "[ DONE ] Sandwich created successfully.",
      ],
    },
  ],
]);

function send() {
  const text = inputElement.value.trim();
  const nickname = nicknameElement.value.trim() || "匿名迪克";

  if (text && ws?.readyState === WebSocket.OPEN) {
    clearTimeout(typingIdleTimer);
    sendTypingState(false);

    if (easterEggProfiles.has(text)) {
      inputElement.value = "";
      triggerEasterEgg(text);
      return;
    }

    clearTimeout(sendGlowTimer);
    sendButton.classList.remove("is-sending");
    void sendButton.offsetWidth;
    sendButton.classList.add("is-sending");
    sendGlowTimer = setTimeout(() => {
      sendButton.classList.remove("is-sending");
    }, 900);

    ws.send(
      JSON.stringify({
        clientId: myClientId,
        nickname,
        system: currentSystem,
        text,
      }),
    );
    inputElement.value = "";
  }
}

let easterEggActive = false;

function triggerEasterEgg(command) {
  if (easterEggActive) return;
  const profile = easterEggProfiles.get(command);
  if (!profile) return;
  easterEggActive = true;

  const overlay = document.createElement("section");
  const variants = profile.variant
    ? profile.variant
        .split(" ")
        .map((variant) => `variant-${variant}`)
        .join(" ")
    : "variant-destruction";
  const presentation = `presentation-${profile.presentation || "card"}`;
  overlay.className = `easter-egg theme-${profile.theme} ${variants} ${presentation}`;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Uni Contento24 彩蛋");

  const terminal = document.createElement("div");
  terminal.className = "easter-terminal";
  terminal.innerHTML = `
    <div class="easter-terminal-bar">
      <span class="terminal-lights" aria-hidden="true"><i></i><i></i><i></i></span>
      <span>${profile.environment}</span>
      <span class="terminal-secure">${profile.status}</span>
    </div>
    <div class="easter-terminal-body">
      <div class="easter-command"><span>${profile.prompt || "user@contento24"}</span>:~% ${command}<i class="terminal-cursor" aria-hidden="true"></i></div>
      <div class="easter-log" id="easter-log" aria-live="polite"></div>
      <div class="easter-result" id="easter-result">
        <div class="easter-mark" aria-hidden="true">${profile.mark}</div>
        <p class="easter-kicker">${profile.kicker}</p>
        <h1>${profile.headline}</h1>
        <p>${profile.body}</p>
        <button type="button" id="easter-return">${profile.actionLabel || "返回聊天室"}</button>
      </div>
    </div>
  `;
  overlay.appendChild(terminal);
  document.body.appendChild(overlay);
  document.body.classList.add("easter-egg-open");
  requestAnimationFrame(() => overlay.classList.add("is-active"));

  const log = terminal.querySelector("#easter-log");
  const result = terminal.querySelector("#easter-result");
  const returnButton = terminal.querySelector("#easter-return");
  const lineDelay = profile.lineDelay || 420;
  const messages = profile.messages.map((message, index) => [
    240 + index * lineDelay,
    message,
  ]);
  const timers = messages.map(([delay, message]) =>
    setTimeout(() => {
      const line = document.createElement("div");
      line.textContent = message;
      log.appendChild(line);
    }, delay),
  );

  const revealDelay =
    profile.revealDelay || 520 + profile.messages.length * lineDelay;
  const revealTimer = setTimeout(() => {
    terminal.classList.add("is-complete");
    result.classList.add("is-visible");
    returnButton.focus();
  }, revealDelay);
  timers.push(revealTimer);

  function closeEasterEgg() {
    timers.forEach(clearTimeout);
    document.removeEventListener("keydown", handleEasterKeydown);
    overlay.classList.remove("is-active");
    document.body.classList.remove("easter-egg-open");
    setTimeout(() => overlay.remove(), 620);
    easterEggActive = false;
    inputElement.focus();
  }

  function handleEasterKeydown(event) {
    if (event.key === "Escape") closeEasterEgg();
  }

  returnButton.addEventListener("click", closeEasterEgg);
  document.addEventListener("keydown", handleEasterKeydown);
}

inputElement.addEventListener("compositionstart", () => {
  isComposing = true;
});
inputElement.addEventListener("compositionend", () => {
  setTimeout(() => {
    isComposing = false;
  }, 0);
});
inputElement.addEventListener("keydown", (event) => {
  if (event.isComposing || isComposing || event.keyCode === 229) return;

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    send();
  }
});
inputElement.addEventListener("input", () => {
  clearTimeout(typingIdleTimer);
  if (!inputElement.value.trim()) {
    sendTypingState(false);
    return;
  }

  sendTypingState(true);
  typingIdleTimer = setTimeout(() => sendTypingState(false), 1500);
});
sendButton.addEventListener("click", send);

initWebSocket();
