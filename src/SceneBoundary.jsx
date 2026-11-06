import { Component } from 'react'

// Se il 3D va in errore (file mancante, WebGL assente...) il resto del sito resta in piedi.
export default class SceneBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error('[3D] errore nella scena:', error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
