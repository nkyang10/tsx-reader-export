import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("viewer", {
  open: () => ipcRenderer.invoke("viewer:open"),
  renderPath: (p, opts) => ipcRenderer.invoke("viewer:renderPath", p, opts),
  renderSource: (name, text, opts) =>
    ipcRenderer.invoke("viewer:renderSource", name, text, opts),
  save: (payload) => ipcRenderer.invoke("viewer:save", payload),
  print: (payload) => ipcRenderer.invoke("viewer:print", payload),
  openExternal: (url) => ipcRenderer.invoke("viewer:openExternal", url),
});
