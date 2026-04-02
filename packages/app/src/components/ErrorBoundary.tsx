import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-svh flex-col items-center justify-center bg-white px-6 text-center">
          <h1 className="mb-2 text-xl font-bold text-gray-900">
            Something went wrong
          </h1>
          <p className="mb-6 text-sm text-gray-600">
            The app ran into an unexpected error. Tap below to try again.
          </p>
          <button
            onClick={this.handleRetry}
            className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
