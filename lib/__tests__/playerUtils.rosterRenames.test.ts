import { rosterRenames } from '@/lib/playerUtils'

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
