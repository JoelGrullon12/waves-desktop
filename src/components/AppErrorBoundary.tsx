import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryState {
  error: Error | null;
}

// Without it an error while rendering unmounts the whole app and leaves a
// blank window. The error is also printed, which the main process copies into
// logs/main.log in the data folder.
export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`app crashed: ${error.stack ?? error.message}\n${info.componentStack ?? ""}`);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center text-foreground">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="max-w-lg text-sm text-muted-foreground">{this.state.error.message}</p>
        <p className="max-w-lg text-xs text-muted-foreground">
          Details are in logs/main.log inside the Waves data folder.
        </p>
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </main>
    );
  }
}
