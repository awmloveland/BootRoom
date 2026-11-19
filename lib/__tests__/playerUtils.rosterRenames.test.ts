import { renameSteps, rosterRenames } from '@/lib/playerUtils'

const row = (id: string, name: string) => ({ id, name })

describe('rosterRenames', () => {
  it('returns saved rows whose name has changed', () => {
    expect(rosterRenames(['Will L', 'Bob'], [row('Will L', 'Will L'), row('Bob', 'Bobby')])).toEqual([row('Bob', 'Bobby')])
  })

  it('ignores surrounding whitespace', () => {
    expect(rosterRenames(['Bob'], [row('Bob', ' Bob ')])).toEqual([])
  })

  it('ignores rows that were never saved', () => {
    expect(rosterRenames(['Bob'], [row('Bob', 'Bob'), row('3f2a', 'Carl')])).toEqual([])
  })
})

describe('renameSteps', () => {
  it('frees a name before another player takes it', () => {
    expect(renameSteps([{ from: 'Bob', to: 'Carl' }, { from: 'Carl', to: 'Dan' }])).toEqual([
      { from: 'Carl', to: 'Dan' },
      { from: 'Bob', to: 'Carl' },
    ])
  })

  it('swaps two names by parking one player under a spare name', () => {
    const steps = renameSteps([{ from: 'Bob', to: 'Carl' }, { from: 'Carl', to: 'Bob' }])
    // Replaying the steps on the two names must end with them swapped and no clash on the way.
    const names = new Map([['Bob', 'Bob'], ['Carl', 'Carl']])
    for (const { from, to } of steps) {
      expect([...names.values()]).not.toContain(to)
      const who = [...names].find(([, now]) => now === from)![0]
      names.set(who, to)
    }
    expect(Object.fromEntries(names)).toEqual({ Bob: 'Carl', Carl: 'Bob' })
    expect(steps.every((s) => s.to.length <= 50)).toBe(true)
  })

  it('leaves independent renames in the order given', () => {
    const renames = [{ from: 'Bob', to: 'Bobby' }, { from: 'Carl', to: 'Carlos' }]
    expect(renameSteps(renames)).toEqual(renames)
  })
})
