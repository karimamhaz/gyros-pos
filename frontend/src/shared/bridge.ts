export interface PrintResult {
  ok: boolean;
  error?: string;
}

/** What the desktop shell offers. Absent when the page runs in a plain browser. */
interface Bridge {
  printers(): Promise<{ name: string; label: string }[]>;
  print(
    html: string,
    options: { printer?: string; widthMm?: number; copies?: number },
  ): Promise<PrintResult>;
  chooseBackup(): Promise<string | null>;
}

export const bridge = (window as unknown as { pos?: Bridge }).pos ?? null;

export function saveFile(blob: Blob, name: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}
