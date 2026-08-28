/**
 * Renders the real splash.html into a static PNG for the README.
 * Usage: yarn electron scripts/capture-splash.cjs
 */
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SPLASH_HTML = path.join(ROOT, 'src/renderer/splash.html')
const OUT = path.join(ROOT, 'src/renderer/assets/splash/splash.png')
const WIDTH = 640
const HEIGHT = 380
const VERSION = require(path.join(ROOT, 'package.json')).version

app.commandLine.appendSwitch('force-device-scale-factor', '2')

app.whenReady().then(async () => {
  const source = fs.readFileSync(SPLASH_HTML, 'utf8')
  const frozen = source
    .replace(/<script[\s\S]*?<\/script>/, '')
    .replace(
      'id="generation-major"></span>',
      `id="generation-major">${VERSION.split('.')[0]}</span>`
    )
    .replace('id="generation-meta" hidden>', 'id="generation-meta">')
    .replace('id="generation-codename"></span>', 'id="generation-codename">fox</span>')
    .replace('id="release"></span>', `id="release">Release ${VERSION}</span>`)
    .replace(
      '</style>',
      `
      .copy > *, .mascot, .glow, .tape-line { animation: none !important; }
      .copy > *, .mascot { opacity: 1 !important; transform: none !important; }
      .tape-line { stroke-dasharray: none; }
      .status, .bar { display: none !important; }
      </style>`
    )

  const tmp = path.join(os.tmpdir(), 'easy-candle-splash-capture.html')
  fs.writeFileSync(tmp, frozen, 'utf8')

  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    useContentSize: true,
    frame: false,
    show: false,
    resizable: false,
    backgroundColor: '#18181b',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      offscreen: true
    }
  })

  const mascotSrc = path.join(ROOT, 'src/renderer/assets/splash/codenames/fox.png').replace(/\\/g, '/')
  await win.loadFile(tmp)
  await win.webContents.executeJavaScript(
    `document.getElementById('mascot').src = ${JSON.stringify('file:///' + mascotSrc)}`
  )
  await new Promise((resolve) => setTimeout(resolve, 400))

  const image = await win.webContents.capturePage()
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, image.toPNG())
  fs.unlinkSync(tmp)
  app.exit(0)
})
