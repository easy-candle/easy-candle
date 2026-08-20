import { describe, expect, it } from 'vitest'
import {
  adoptRgb,
  isCssColor,
  parseColor,
  sanitizeCssColor,
  toColorString,
  withAlpha
} from './cssColor'

describe('isCssColor', () => {
  it('accepts hex and rgb(a)', () => {
    expect(isCssColor('#f23645')).toBe(true)
    expect(isCssColor('#F23645AA')).toBe(true)
    expect(isCssColor('#abc')).toBe(true)
    expect(isCssColor('rgba(242, 54, 69, 0.2)')).toBe(true)
    expect(isCssColor('rgb(10, 20, 30)')).toBe(true)
    expect(isCssColor('red')).toBe(false)
    expect(isCssColor('nope')).toBe(false)
  })
})

describe('parseColor / toColorString', () => {
  it('round-trips opaque hex', () => {
    expect(toColorString(parseColor('#f23645'))).toBe('#f23645')
  })

  it('keeps alpha on rgba colors', () => {
    expect(toColorString(parseColor('rgba(242, 54, 69, 0.2)'))).toBe(
      'rgba(242, 54, 69, 0.2)'
    )
  })

  it('reads 8-digit hex alpha', () => {
    const parsed = parseColor('#f2364533')
    expect(parsed.r).toBe(242)
    expect(parsed.g).toBe(54)
    expect(parsed.b).toBe(69)
    expect(parsed.a).toBeCloseTo(0.2)
  })
})

describe('adoptRgb', () => {
  it('takes RGB from the pick and keeps the current opacity', () => {
    expect(adoptRgb('#00ff00', 'rgba(242, 54, 69, 0.2)')).toBe(
      'rgba(0, 255, 0, 0.2)'
    )
    expect(adoptRgb('#00ff00', '#f23645')).toBe('#00ff00')
  })
})

describe('withAlpha / sanitizeCssColor', () => {
  it('applies opacity onto a hex color', () => {
    expect(withAlpha('#f23645', 0.2)).toBe('rgba(242, 54, 69, 0.2)')
  })

  it('normalizes valid colors and rejects junk', () => {
    expect(sanitizeCssColor('rgba(1, 2, 3, 0.5)', '#000000')).toBe(
      'rgba(1, 2, 3, 0.5)'
    )
    expect(sanitizeCssColor('nope', 'rgba(242, 54, 69, 0.2)')).toBe(
      'rgba(242, 54, 69, 0.2)'
    )
  })
})
