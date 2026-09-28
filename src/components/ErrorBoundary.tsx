import { Component, type ReactNode } from 'react';

import { logError } from '../log';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Rendered as given, in place of the children, once a child has thrown while rendering. */
  fallback: ReactNode;
  /** A short identifier chosen by the caller, such as `feed` or `card`, logged with the error. */
  name: string;
}

interface ErrorBoundaryState {
  failed: boolean;
}

/**
 * Catches an error thrown while rendering its children, logs it once as `render_failed` with the
 * boundary's name, and renders `fallback` from then on. It adds no view and no styles of its own.
 *
 * To try the children again, change the boundary's `key`: React remounts it with fresh state.
 * An error thrown by the fallback itself goes to the next boundary up.
 *
 * React error boundaries must be class components; this is the one class component in the app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    logError('render_failed', error, { boundary: this.props.name });
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
