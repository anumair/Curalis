// Thin wrapper over organic.css's .btn classes — no variant-prop framework
// needed, the design only has four looks.
export function Button({ as: As = 'button', variant = 'primary', block = false, className = '', ...props }) {
  const variantClass = variant === 'primary' ? 'btn-primary' : variant === 'secondary' ? 'btn-secondary' : variant === 'ghost' ? 'btn-ghost' : '';
  const classes = ['btn', variantClass, block ? 'btn-block' : '', className].filter(Boolean).join(' ');
  return <As className={classes} {...props} />;
}
