import { splitPastedNames } from '@/lib/playerUtils'

describe('splitPastedNames', () => {
  it('splits on newlines, commas, ampersands, slashes and the word and', () => {
    expect(splitPastedNames('Alice, Bob & Carl / Dan and Eve\nFrank')).toEqual(['Alice', 'Bob', 'Carl', 'Dan', 'Eve', 'Frank'])
  })

  it('treats and as a separator only as a whole word', () => {
    expect(splitPastedNames('Andy and Sandra')).toEqual(['Andy', 'Sandra'])
    expect(splitPastedNames('Andrea Brand')).toEqual(['Andrea Brand'])
    expect(splitPastedNames('Andžej and Zoë')).toEqual(['Andžej', 'Zoë'])
  })

  it('trims, drops blanks and de-duplicates case-insensitively keeping the first spelling', () => {
    expect(splitPastedNames('  alice ,, Alice,\n\n bob ')).toEqual(['alice', 'bob'])
  })

  it('returns an empty list for empty input', () => {
    expect(splitPastedNames('   ')).toEqual([])
  })
})
