import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("viewer", {
  open: () => ipcRenderer.invoke("viewer:open"),
  renderPath: (p) => ipcRenderer.invoke("viewer:renderPath", p),
  renderSource: (name, text) =>
    ipcRenderer.invoke("viewer:renderSource", name, text),
  save: (payload) => ipcRenderer.invoke("viewer:save", payload),
  print: (payload) => ipcRenderer.invoke("viewer:print", payload),
  openExternal: (url) => ipcRenderer.invoke("viewer:openExternal", url),
});
