import { Component } from "react";

// Basic error boundary to prevent entire app from crashing on render errors.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // In a real app we could log to a monitoring service here.
    console.error("UI ErrorBoundary caught an error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card">
          <h2>Something went wrong. Please refresh.</h2>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
