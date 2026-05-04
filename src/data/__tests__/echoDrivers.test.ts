import { describe, it, expect } from 'vitest'
import { ECHO_DRIVERS, ECHO_DRIVER_LIST } from '../echoDrivers'
import { DRIVER_KEYS } from '../../design-system/tokens'

describe('ECHO_DRIVERS', () => {
  it('has all 4 driver keys', () => {
    for (const key of DRIVER_KEYS) {
      expect(ECHO_DRIVERS).toHaveProperty(key)
    }
  })

  it('has no extra driver keys', () => {
    expect(Object.keys(ECHO_DRIVERS)).toHaveLength(DRIVER_KEYS.length)
  })

  it('each driver has exactly 5 traits', () => {
    for (const key of DRIVER_KEYS) {
      expect(ECHO_DRIVERS[key].traits).toHaveLength(5)
    }
  })

  it('each driver has non-empty name, tagline, blurb, and growth', () => {
    for (const key of DRIVER_KEYS) {
      const d = ECHO_DRIVERS[key]
      expect(d.name).toBeTruthy()
      expect(d.tagline).toBeTruthy()
      expect(d.blurb).toBeTruthy()
      expect(d.growth).toBeTruthy()
    }
  })

  it('each trait has non-empty name and description', () => {
    for (const key of DRIVER_KEYS) {
      for (const trait of ECHO_DRIVERS[key].traits) {
        expect(trait.name).toBeTruthy()
        expect(trait.description).toBeTruthy()
      }
    }
  })

  it('driver key field matches its record key', () => {
    for (const key of DRIVER_KEYS) {
      expect(ECHO_DRIVERS[key].key).toBe(key)
    }
  })

  it('each driver has non-empty color, accent, and soft OKLCH values', () => {
    for (const key of DRIVER_KEYS) {
      const d = ECHO_DRIVERS[key]
      expect(d.color).toMatch(/^oklch/)
      expect(d.accent).toMatch(/^oklch/)
      expect(d.soft).toMatch(/^oklch/)
    }
  })
})

describe('ECHO_DRIVER_LIST', () => {
  it('contains all 4 drivers', () => {
    expect(ECHO_DRIVER_LIST).toHaveLength(4)
  })

  it('list keys match the DriverKey union in order', () => {
    const listKeys = ECHO_DRIVER_LIST.map(d => d.key)
    expect(listKeys).toEqual(['Activator', 'Energizer', 'Analyzer', 'Harmonizer'])
  })

  it('list entries are the same references as ECHO_DRIVERS', () => {
    for (const driver of ECHO_DRIVER_LIST) {
      expect(ECHO_DRIVERS[driver.key]).toBe(driver)
    }
  })
})
