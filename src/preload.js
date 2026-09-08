const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  /** 무대(화면 크기·바닥선) 정보를 가져온다 */
  getStage: () => ipcRenderer.invoke('stage:get'),
  /** 커서가 캐릭터 위에 있는 동안만 true → 그때만 클릭을 받는다 */
  setInteractive: (v) => ipcRenderer.send('mouse:interactive', !!v),
  /** 트레이 메뉴 등에서 오는 명령 */
  onCommand: (cb) => ipcRenderer.on('pet:command', (_e, cmd) => cb(cmd)),
  /** 해상도 변경 시 새 무대 정보 */
  onStage: (cb) => ipcRenderer.on('pet:stage', (_e, stage) => cb(stage)),
});
