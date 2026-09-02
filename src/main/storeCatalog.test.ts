import { describe, expect, it } from 'vitest'
import { buildStoreCatalogUrl, extractStoreLiveVersion, normalizeStoreVersion } from './storeCatalog'

describe('normalizeStoreVersion', () => {
  it('drops a trailing .0 fourth part', () => {
    expect(normalizeStoreVersion('2.12.1.0')).toBe('2.12.1')
  })

  it('keeps a non-zero revision', () => {
    expect(normalizeStoreVersion('2.12.1.1')).toBe('2.12.1.1')
  })
})

describe('buildStoreCatalogUrl', () => {
  it('uses the Details fields template', () => {
    expect(buildStoreCatalogUrl('9N91GNR9SJ14')).toBe(
      'https://displaycatalog.mp.microsoft.com/v7.0/products/9N91GNR9SJ14?market=US&languages=en-us&fieldsTemplate=Details'
    )
  })
})

describe('extractStoreLiveVersion', () => {
  it('reads PackageFullName from Product.DisplaySkuAvailabilities', () => {
    const catalog = {
      Product: {
        DisplaySkuAvailabilities: [
          {
            Sku: {
              Properties: {
                IsTrial: false,
                Packages: [
                  {
                    Version: '563001493094400',
                    PackageFullName: 'sepocim.EasyCandle_2.12.1.0_x64__8t2ewv0he9a5j'
                  }
                ]
              }
            }
          }
        ]
      }
    }
    expect(extractStoreLiveVersion(catalog)).toBe('2.12.1')
  })

  it('prefers paid SKUs over trial', () => {
    const catalog = {
      Products: [
        {
          DisplaySkuAvailabilities: [
            {
              Sku: {
                Properties: {
                  IsTrial: true,
                  Packages: [{ PackageFullName: 'sepocim.EasyCandle_1.0.0.0_x64__x' }]
                }
              }
            },
            {
              Sku: {
                Properties: {
                  IsTrial: false,
                  Packages: [{ PackageFullName: 'sepocim.EasyCandle_2.12.1.0_x64__x' }]
                }
              }
            }
          ]
        }
      ]
    }
    expect(extractStoreLiveVersion(catalog)).toBe('2.12.1')
  })

  it('returns null for empty catalog (fail-open)', () => {
    expect(extractStoreLiveVersion({})).toBeNull()
    expect(extractStoreLiveVersion(null)).toBeNull()
  })
})
