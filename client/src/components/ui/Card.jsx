export function Card({ elevation, className = '', ...props }) {
  const elevClass = elevation ? `elev-${elevation}` : '';
  return <div className={`card ${elevClass} ${className}`.trim()} {...props} />;
}
