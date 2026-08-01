import { describe, expect, it } from 'vitest'
import { decodeMtTextBuffer } from './mtTextDecode'

const SAMPLE =
  '2025.03.05 02:00\t2914.37\t2914.4\t2912.33\t2913.35\t305\t0\n' +
  '2025.03.05 02:05\t2913.35\t2914.35\t2912.26\t2914.24\t405\t0\n'

describe('decodeMtTextBuffer', () => {
  it('decodes UTF-8 with BOM', () => {
    const body = Buffer.from(SAMPLE, 'utf8')
    const bom = Buffer.from([0xef, 0xbb, 0xbf])
    const text = decodeMtTextBuffer(Buffer.concat([bom, body]))
    expect(text.startsWith('2025.03.05')).toBe(true)
    expect(text).toContain('2914.37')
  })

  it('decodes UTF-16 LE with BOM (MT5 Unicode)', () => {
    const body = Buffer.from(SAMPLE, 'utf16le')
    const bom = Buffer.from([0xff, 0xfe])
    const text = decodeMtTextBuffer(Buffer.concat([bom, body]))
    expect(text).toContain('2025.03.05 02:00')
    expect(text).toContain('2914.37')
    expect(text).not.toContain('\u0000')
  })

  it('decodes UTF-16 LE without BOM', () => {
    const body = Buffer.from(SAMPLE, 'utf16le')
    const text = decodeMtTextBuffer(body)
    expect(text).toContain('2025.03.05 02:05')
    expect(text).toContain('2914.24')
  })

  it('decodes UTF-16 BE with BOM', () => {
    const le = Buffer.from(SAMPLE, 'utf16le')
    const beBody = Buffer.alloc(le.length)
    for (let i = 0; i < le.length; i += 2) {
      beBody[i] = le[i + 1]
      beBody[i + 1] = le[i]
    }
    const bom = Buffer.from([0xfe, 0xff])
    const text = decodeMtTextBuffer(Buffer.concat([bom, beBody]))
    expect(text).toContain('2025.03.05 02:00')
    expect(text).toContain('2913.35')
  })

  it('keeps plain UTF-8 without BOM', () => {
    const text = decodeMtTextBuffer(Buffer.from(SAMPLE, 'utf8'))
    expect(text).toBe(SAMPLE)
  })
})
