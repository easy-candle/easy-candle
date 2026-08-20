/// <reference types="vite/client" />

declare const __APP_VERSION__: string

declare module '*.svg' {
  const src: string
  export default src
}

declare module '*.svg?raw' {
  const src: string
  export default src
}
