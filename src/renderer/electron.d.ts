interface ElectronAPI {
  ipcRenderer: {
    send: (channel: string, data: any) => void;
    on: (channel: string, func: (...args: any[]) => void) => void;
  };
  backendPort: number | null;
}

declare interface Window {
  electron: ElectronAPI;
} 