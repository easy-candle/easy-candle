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
  WINDOW_STARTUP_READY: 'window:startup-ready',

  KLINES_FETCH: 'klines:fetch',

  IMPORT_OPEN_DIALOG: 'import:openDialog',
  IMPORT_READ_FILE: 'import:readFile',
  IMPORT_PARSE_FILE: 'import:parseFile',
  IMPORT_DISCARD_PARSE: 'import:discardParse',
  IMPORT_SAVE: 'import:save',
  IMPORT_LIST: 'import:list',
  IMPORT_LOAD: 'import:load',
  IMPORT_DELETE: 'import:delete',
  IMPORT_JOB_PROGRESS: 'import:jobProgress',

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
  UPDATE_ERROR: 'update:error',

  AUTH_SESSION: 'auth:session',
  AUTH_GOOGLE_START: 'auth:google-start',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_REFRESH: 'auth:refresh'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
