import React from "react";

export default class ViewportErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, key: 0 };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Camera Studio viewport crashed", error, info);
    this.props.onError?.(error);
  }

  retry = () => {
    this.setState((state) => ({ error: null, key: state.key + 1 }));
  };

  render() {
    if (!this.state.error) return <React.Fragment key={this.state.key}>{this.props.children}</React.Fragment>;
    return (
      <div className="viewportErrorBoundary" role="alert">
        <strong>3D viewport recovered from an error</strong>
        <p>{this.state.error?.message || "The WebGL viewport stopped unexpectedly."}</p>
        <button type="button" onClick={this.retry}>Restart viewport</button>
      </div>
    );
  }
}
