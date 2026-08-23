/**
 * Every IPC channel name used between the main and renderer processes.
 *
 * Main registers handlers with these, preload is the only renderer-side caller,
 * and the web bridge mirrors the same surface without IPC. Keeping the strings
 * here means a rename cannot silently break one side.
 */
export const IPC_CHANNELS = {
  APP_GET_VERSION: 'app:getVersion',

  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggle-maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  WINDOW_MAXIMIZED_CHANGED: 'window:maximized-changed',

  KLINES_FETCH: 'klines:fetch',

  IMPORT_OPEN_DIALOG: 'import:openDialog',
  IMPORT_READ_FILE: 'import:readFile',
  DATASET_SAVE: 'datasets:save',
  DATASET_LIST: 'datasets:list',
  DATASET_LOAD: 'datasets:load',
  DATASET_DELETE: 'datasets:delete',

  MT_BRIDGE_START: 'mtbridge:start',
  MT_BRIDGE_STOP: 'mtbridge:stop',
  MT_BRIDGE_STATUS: 'mtbridge:status',
  MT_BRIDGE_PREVIEW: 'mtbridge:preview',
  MT_BRIDGE_EVENT: 'mtbridge:event',

  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_AVAILABLE: 'update:available',
  UPDATE_PROGRESS: 'update:progress',
  UPDATE_DOWNLOADED: 'update:downloaded',
  UPDATE_ERROR: 'update:error'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
