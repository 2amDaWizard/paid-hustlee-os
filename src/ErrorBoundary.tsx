import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCcw, ShieldCheck } from 'lucide-react'

type State = { failed: boolean }

/** A final visible recovery screen if a component crashes during rendering. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }
  static getDerivedStateFromError(): State { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // Do not log workspace contents or client details. Logging the error shape alone is enough for local diagnosis.
    if (import.meta.env.DEV) console.error('Strategy Scale Dashboard interface error:', error.name, info.componentStack)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return <main className="recovery-screen"><div className="recovery-card">
      <div className="recovery-icon"><AlertTriangle size={27}/></div>
      <h1>Something interrupted the workspace.</h1>
      <p>The interface encountered a problem. This screen does not delete your agency data or reset your Supabase account.</p>
      <button className="btn btn-primary" onClick={() => window.location.reload()}><RefreshCcw size={16}/>Reload Dashboard</button>
      <div className="recovery-foot"><ShieldCheck size={16}/>If it keeps happening, return to your previous Netlify deployment and check its deploy logs. Avoid clearing browser storage or resetting your database.</div>
    </div></main>
  }
}
