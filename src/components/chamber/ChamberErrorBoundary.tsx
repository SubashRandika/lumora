"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  onError: (error: Error) => void;
}

interface State {
  failed: boolean;
}

/**
 * Keeps a 3D failure (shader compile error, lost context, bad asset) inside
 * the chamber. The rest of the page, and the fallback, keep working.
 */
export class ChamberErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
