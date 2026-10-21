'use client'

import { Component, type ReactNode } from 'react'

interface Props {
  /** Shown in place of the children when a lazily loaded chunk fails to load. */
  fallback: ReactNode
  children: ReactNode
}

interface State {
  failed: boolean
}

/**
 * Catches a failed `next/dynamic` import (offline, or a tab left open across a
 * deploy) so the surrounding UI stays usable instead of unmounting the page.
 */
export class LazyBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[LazyBoundary] chunk failed to load', error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
