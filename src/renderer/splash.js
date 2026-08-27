import { getReleaseCodename, parseSemverMajor } from '@shared/releaseCodenames'

try {
  if (localStorage.getItem('easy-candle:theme') === 'light') {
    document.documentElement.dataset.theme = 'light'
  }
} catch (_) {
  // ignore quota / private mode / missing storage
}

const mascotUrls = import.meta.glob('./assets/splash/codenames/*.png', {
  eager: true,
  import: 'default'
})

const version = new URLSearchParams(window.location.search).get('v')
const major = version ? parseSemverMajor(version) : undefined
const slug = version ? getReleaseCodename(version) : undefined

const majorEl = document.getElementById('generation-major')
const codeEl = document.getElementById('generation-codename')
const releaseEl = document.getElementById('release')
const mascotEl = document.getElementById('mascot')

if (majorEl && major != null) {
  majorEl.textContent = String(major)
}

if (codeEl && slug) {
  codeEl.textContent = slug
  const metaEl = document.getElementById('generation-meta')
  if (metaEl) metaEl.hidden = false
}

if (releaseEl && version) {
  releaseEl.textContent = `Release ${version}`
}

if (mascotEl instanceof HTMLImageElement && slug) {
  const url = mascotUrls[`./assets/splash/codenames/${slug}.png`]
  if (typeof url === 'string') {
    mascotEl.src = url
  }
}
