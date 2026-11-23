import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("pos", {
  printers: () => ipcRenderer.invoke("printers"),
  print: (html: string, options: object) => ipcRenderer.invoke("print", html, options),
  chooseBackup: () => ipcRenderer.invoke("choose-backup"),
});
