import { describe, it, expect } from 'vitest'
import { QUIZ_QUESTIONS, TIE_BREAKER } from '../quizQuestions'
import { DRIVER_KEYS } from '../../design-system/tokens'

const LETTERS = ['A', 'B', 'C', 'D'] as const

describe('QUIZ_QUESTIONS', () => {
  it('has exactly 15 questions', () => {
    expect(QUIZ_QUESTIONS).toHaveLength(15)
  })

  it('every question has exactly 4 options', () => {
    for (const q of QUIZ_QUESTIONS) {
      expect(q.options).toHaveLength(4)
    }
  })

  it('every option has letters A/B/C/D in order and a non-empty driver', () => {
    for (const q of QUIZ_QUESTIONS) {
      q.options.forEach((opt, i) => {
        expect(opt.letter).toBe(LETTERS[i])
        expect(opt.driver).toBeTruthy()
        expect(opt.text).toBeTruthy()
      })
    }
  })

  it('each part 1, 2, 3 has exactly 5 questions', () => {
    for (const part of [1, 2, 3] as const) {
      const count = QUIZ_QUESTIONS.filter(q => q.part === part).length
      expect(count).toBe(5)
    }
  })

  it('every driver appears at least 10 times across all option mappings', () => {
    const tally: Record<string, number> = {
      Activator: 0,
      Energizer: 0,
      Analyzer: 0,
      Harmonizer: 0,
    }
    for (const q of QUIZ_QUESTIONS) {
      for (const opt of q.options) {
        tally[opt.driver] = (tally[opt.driver] ?? 0) + 1
      }
    }
    for (const key of DRIVER_KEYS) {
      expect(tally[key]).toBeGreaterThanOrEqual(10)
    }
  })

  it('question IDs are unique and sequential 1–15', () => {
    const ids = QUIZ_QUESTIONS.map(q => q.id)
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
  })

  it('every partLabel matches its part number', () => {
    const labelMap: Record<number, string> = {
      1: 'How you work',
      2: 'How you connect',
      3: 'Who you are',
    }
    for (const q of QUIZ_QUESTIONS) {
      expect(q.partLabel).toBe(labelMap[q.part])
    }
  })
})

describe('TIE_BREAKER', () => {
  it('has 4 options', () => {
    expect(TIE_BREAKER.options).toHaveLength(4)
  })

  it('has one option for each driver', () => {
    const drivers = TIE_BREAKER.options.map(o => o.driver)
    for (const key of DRIVER_KEYS) {
      expect(drivers).toContain(key)
    }
  })

  it('options are lettered A/B/C/D in order', () => {
    TIE_BREAKER.options.forEach((opt, i) => {
      expect(opt.letter).toBe(LETTERS[i])
    })
  })

  it('has a non-empty prompt', () => {
    expect(TIE_BREAKER.prompt).toBeTruthy()
  })
})
