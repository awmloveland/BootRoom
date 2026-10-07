/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render } from '@testing-library/react'
import { FormatLabel } from '@/components/FormatLabel'

describe('FormatLabel', () => {
  it('keeps the v of an uneven format out of the uppercase transform', () => {
    const { container } = render(<p className="uppercase"><FormatLabel format="6v5" /></p>)
    expect(container).toHaveTextContent('6v5')
    expect(container.querySelector('.normal-case')).toHaveTextContent(/^v$/)
  })

  it('leaves an even format as plain text', () => {
    const { container } = render(<p className="uppercase"><FormatLabel format="5-a-side" /></p>)
    expect(container).toHaveTextContent('5-a-side')
    expect(container.querySelector('.normal-case')).toBeNull()
  })
})
