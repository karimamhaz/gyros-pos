import { BrowserWindow } from "electron";

export interface PrintOptions {
  /** Windows printer name. Ignored when a dialog is shown. */
  printer?: string;
  /** Roll width. Without it the page prints on normal paper with the system dialog. */
  widthMm?: number;
  copies?: number;
}
export interface PrintResult {
  ok: boolean;
  error?: string;
}

const MICRONS_PER_PX = 25400 / 96;
const TIMEOUT_MS = 30_000;

/** Renders the page off screen, so Arabic shaping is done by Chromium. */
export async function printHtml(url: string, options: PrintOptions): Promise<PrintResult> {
  const receipt = options.widthMm !== undefined;
  if (receipt && !options.printer) return { ok: false, error: "no_printer" };
  const width = receipt ? Math.ceil((options.widthMm! / 25.4) * 96) : 800;
  const page = new BrowserWindow({
    show: false,
    width,
    height: 800,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: true },
  });
  try {
    await page.loadURL(url);
    const height: number = await page.webContents.executeJavaScript(
      "document.fonts.ready.then(() => Math.ceil(document.documentElement.scrollHeight))",
    );
    if (receipt) {
      const printers = await page.webContents.getPrintersAsync();
      if (!printers.some((p) => p.name === options.printer)) {
        return { ok: false, error: "printer_missing" };
      }
    }
    const settings: Electron.WebContentsPrintOptions = receipt
      ? {
          silent: true,
          deviceName: options.printer,
          copies: options.copies ?? 1,
          printBackground: true,
          margins: { marginType: "none" },
          pageSize: {
            width: options.widthMm! * 1000,
            height: Math.max(50_000, Math.ceil(height * MICRONS_PER_PX)),
          },
        }
      : { silent: false, printBackground: true };
    return await new Promise<PrintResult>((resolve) => {
      // The system dialog waits for a person; a silent job that hangs is a failure.
      const timer = receipt
        ? setTimeout(() => resolve({ ok: false, error: "timeout" }), TIMEOUT_MS)
        : undefined;
      page.webContents.print(settings, (ok, reason) => {
        clearTimeout(timer);
        resolve(ok ? { ok } : { ok, error: reason || "failed" });
      });
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "failed" };
  } finally {
    page.destroy();
  }
}
