export function Tag({ variant = 'neutral', className = '', ...props }) {
  return <span className={`tag tag-${variant} ${className}`.trim()} {...props} />;
}
