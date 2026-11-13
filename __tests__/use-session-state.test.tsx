/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { useSessionState } from '@/components/new-league/useSessionState'

beforeEach(() => sessionStorage.clear())

describe('useSessionState', () => {
  it('starts from the initial value and stores nothing until it is set', () => {
    const { result } = renderHook(() => useSessionState('k', { n: 1 }))
    expect(result.current[0]).toEqual({ n: 1 })
    expect(result.current[2].loaded).toBe(true)
    expect(sessionStorage.getItem('k')).toBeNull()
  })

  it('restores a stored value', () => {
    sessionStorage.setItem('k', JSON.stringify({ n: 5 }))
    const { result } = renderHook(() => useSessionState('k', { n: 1 }))
    expect(result.current[0]).toEqual({ n: 5 })
  })

  it('writes every change made through the setter', () => {
    const { result } = renderHook(() => useSessionState('k', { n: 1 }))
    act(() => result.current[1]((v) => ({ n: v.n + 1 })))
    expect(result.current[0]).toEqual({ n: 2 })
    expect(JSON.parse(sessionStorage.getItem('k')!)).toEqual({ n: 2 })
  })

  it('clear removes the key and keeps the value in memory', () => {
    const { result } = renderHook(() => useSessionState('k', { n: 1 }))
    act(() => result.current[1]({ n: 2 }))
    act(() => result.current[2].clear())
    expect(sessionStorage.getItem('k')).toBeNull()
    expect(result.current[0]).toEqual({ n: 2 })
  })

  it('falls back to the initial value when the stored JSON is corrupt', () => {
    sessionStorage.setItem('k', '{not json')
    const { result } = renderHook(() => useSessionState('k', { n: 1 }))
    expect(result.current[0]).toEqual({ n: 1 })
    expect(result.current[2].loaded).toBe(true)
  })
})
