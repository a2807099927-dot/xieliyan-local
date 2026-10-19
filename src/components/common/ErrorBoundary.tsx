// ErrorBoundary 
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
 children: ReactNode;
}

interface State {
 hasError: boolean;
 message?: string;
 detail?: string;
}

export class ErrorBoundary extends Component<Props, State> {
 state: State = { hasError: false };

 static getDerivedStateFromError(error: Error): State {
 return { hasError: true, message: error.message };
 }

 componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
 const stackText = [error.stack, errorInfo.componentStack].filter(Boolean).join('\n');
 this.setState({ detail: stackText });
 console.error('[ErrorBoundary]', error, errorInfo);
 }

 render() {
 if (this.state.hasError) {
 return (
	<div className="h-full overflow-auto bg-[var(--bg-primary)] p-6 text-red-600">
	<div className="text-xl font-semibold">发生错误：{this.state.message}</div>
	{this.state.detail ? (
	<pre className="mt-4 whitespace-pre-wrap border border-red-400/30 bg-[var(--surface)] p-3 text-xs text-[var(--text-secondary)]">
	{this.state.detail}
	</pre>
	) : null}
	</div>
 );
 }
 return this.props.children;
 }
}

