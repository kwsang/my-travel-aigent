'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full w-full p-6 text-center bg-card rounded-xl border border-destructive/20 text-destructive min-h-[200px]">
          <AlertTriangle className="w-8 h-8 mb-3 opacity-80" />
          <h2 className="text-sm font-bold mb-1 uppercase tracking-widest">Component Error</h2>
          <p className="text-xs opacity-80 mb-6 max-w-xs truncate">
            {this.props.fallbackMessage || this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 hover:bg-destructive/20 rounded-lg transition-colors text-xs font-semibold"
          >
            <RefreshCcw className="w-3 h-3" />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}