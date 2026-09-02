import { describe, expect, it } from 'vitest'
import { compareSemver, semverEq, semverGt, semverLt } from './semver'

describe('compareSemver', () => {
  it('treats 4-part trailing zero as equal to 3-part', () => {
    expect(compareSemver('2.12.1', '2.12.1.0')).toBe(0)
    expect(semverEq('2.12.1.0', '2.12.1')).toBe(true)
  })

  it('orders major.minor.patch', () => {
    expect(semverLt('2.10.2', '2.12.1')).toBe(true)
    expect(semverGt('2.12.1', '2.10.2')).toBe(true)
    expect(semverLt('2.12.1', '2.12.1')).toBe(false)
  })

  it('strips a leading v', () => {
    expect(semverEq('v2.12.1', '2.12.1')).toBe(true)
  })
})
