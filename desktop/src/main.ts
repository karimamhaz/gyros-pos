import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session } from "electron";
import { Backend } from "./backend";
import { printHtml, type PrintOptions } from "./print";

const ORIGIN = "app://pos";
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
};

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const root = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "../..");
const webRoot = app.isPackaged ? path.join(root, "web") : path.join(root, "frontend/dist");
const shared = process.env.ProgramData
  ? path.join(process.env.ProgramData, "GyrosPOS")
  : app.getPath("userData");
const secret = randomBytes(32).toString("hex");
const printPages = new Map<string, string>();
let window: BrowserWindow | null = null;
let fatal = false;

const executable = path.join(root, "backend", "gyros-backend.exe");
const backend = new Backend({
  command: app.isPackaged ? executable : "uv",
  args: app.isPackaged ? [] : ["run", "--no-sync", "python", "-m", "app.main"],
  cwd: path.join(root, "backend"),
  env: {
    POS_LAUNCH_SECRET: secret,
    POS_DATA_DIR: process.env.POS_DATA_DIR ?? path.join(shared, "Data"),
    POS_BACKUP_DIR: process.env.POS_BACKUP_DIR ?? path.join(shared, "Backups"),
  },
  maxRestarts: 3,
  onGiveUp: () => {
    fatal = true;
    void window?.loadURL(`${ORIGIN}/fatal`);
  },
});

const page = (body: string, type = TYPES[".html"]) =>
  new Response(body, { headers: { "Content-Type": type, "Content-Security-Policy": CSP } });

const FATAL = `<!doctype html><meta charset="utf-8"><title>Gyros POS</title>
<body style="background:#161616;color:#fff;font:20px sans-serif;display:grid;place-content:center;height:90vh;text-align:center;gap:16px">
<h1 dir="rtl">توقف النظام ولم يتمكن من العودة</h1><p dir="rtl">أغلق البرنامج وافتحه من جديد. الطلبات المدفوعة محفوظة.</p>
<h1>The system stopped and could not restart</h1><p>Close the app and open it again. Paid orders are saved.</p></body>`;

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.host !== "pos") return new Response(null, { status: 404 });

  if (url.pathname.startsWith("/api/")) {
    // The secret is added here, so the page itself never sees it.
    const headers = new Headers({ "X-Launch-Secret": secret });
    for (const name of ["authorization", "content-type"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    try {
      const port = await backend.port();
      return await net.fetch(`http://127.0.0.1:${port}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body: request.body ? await request.arrayBuffer() : undefined,
      });
    } catch {
      return Response.json({ error: { code: "no_connection", params: {} } }, { status: 503 });
    }
  }
  if (url.pathname === "/fatal") return page(FATAL);
  if (url.pathname.startsWith("/print/")) {
    const html = printPages.get(url.pathname.slice("/print/".length));
    return html ? page(html) : new Response(null, { status: 404 });
  }
  const name = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  const file = path.resolve(webRoot, name);
  if (!file.startsWith(webRoot + path.sep) || !existsSync(file)) {
    return new Response(null, { status: 404 });
  }
  const type = TYPES[path.extname(file)] ?? "application/octet-stream";
  return page((await readFile(file)) as unknown as string, type);
}

const trusted = (event: Electron.IpcMainInvokeEvent) => {
  if (!event.senderFrame?.url.startsWith(`${ORIGIN}/`)) throw new Error("not allowed");
};

ipcMain.handle("printers", async (event) => {
  trusted(event);
  const printers = await event.sender.getPrintersAsync();
  return printers.map((p) => ({ name: p.name, label: p.displayName || p.name }));
});

ipcMain.handle("print", async (event, html: string, options: PrintOptions) => {
  trusted(event);
  const id = randomUUID();
  printPages.set(id, html);
  try {
    return await printHtml(`${ORIGIN}/print/${id}`, options);
  } finally {
    printPages.delete(id);
  }
});

ipcMain.handle("choose-backup", async (event) => {
  trusted(event);
  const result = await dialog.showOpenDialog(window!, {
    properties: ["openFile"],
    filters: [{ name: "Gyros POS", extensions: ["gz"] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

function openWindow() {
  window = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#161616",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });
  window.once("ready-to-show", () => {
    if (app.isPackaged) window?.maximize();
    window?.show();
  });
  window.on("closed", () => (window = null));
  void window.loadURL(fatal ? `${ORIGIN}/fatal` : `${ORIGIN}/`);
}

app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event) => event.preventDefault());
  contents.on("will-attach-webview", (event) => event.preventDefault());
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  let stopped = false;
  app.on("before-quit", (event) => {
    if (stopped) return;
    event.preventDefault();
    void backend.stop().then(() => {
      stopped = true;
      app.quit();
    });
  });
  app.on("window-all-closed", () => app.quit());
  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, done) =>
      done(false),
    );
    protocol.handle("app", handle);
    void backend.start().catch(() => {});
    openWindow();
  });
}
