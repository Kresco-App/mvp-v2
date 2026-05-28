'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import RouteErrorState from '@/components/RouteErrorState'
import { reportClientError } from '@/lib/clientTelemetry'

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

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    reportClientError({
      source: 'react-error-boundary',
      message: error.message,
      stack: error.stack,
      component_stack: errorInfo.componentStack ?? '',
    })
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
