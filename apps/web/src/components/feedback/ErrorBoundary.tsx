import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { error: Error | null }
> {
  override state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error.message, info.componentStack);
  }

  override render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}
