import React from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-black/20 backdrop-blur-md border border-white/5 rounded-3xl">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6">
            <AlertCircle className="text-red-500" size={32} />
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-2">Something went sideways</h2>
          <p className="text-zinc-400 max-w-md mb-8">
            The application encountered an unexpected error. We've logged the incident and our team will look into it.
          </p>
          
          <button 
            onClick={() => window.location.reload()}
            className="btn btn-primary flex items-center gap-2"
          >
            <RefreshCcw size={18} />
            Reload Application
          </button>
          
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-8 p-4 bg-zinc-900 rounded-xl text-left overflow-auto max-w-full">
              <p className="text-xs font-mono text-red-400 mb-2">{this.state.error?.toString()}</p>
            </div>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
