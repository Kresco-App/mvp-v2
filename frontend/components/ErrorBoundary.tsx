'use client'

import { Component, type ReactNode } from 'react'
import RouteErrorState from '@/components/RouteErrorState'

type ErrorBoundaryProps = {
  children?: ReactNode
  eyebrow?: string
  title?: string
  message?: string
  homeHref?: string
}

type ErrorBoundaryState = {
  error: Error | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch() {
    // Next.js segment error files catch route render failures; this boundary keeps client widgets non-blank.
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <RouteErrorState
        eyebrow={this.props.eyebrow ?? 'Widget error'}
        title={this.props.title ?? 'This part of Kresco failed to load.'}
        message={this.props.message ?? 'Retry this section. The rest of the page should remain available.'}
        homeHref={this.props.homeHref}
        onRetry={this.reset}
      />
    )
  }
}
