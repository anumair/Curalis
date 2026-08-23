import { forwardRef } from 'react';

// Layout wrapper matching organic.css's .field pattern: label, control,
// then a hint OR an error underneath (never both at once).
export function Field({ label, hint, error, style, children }) {
  return (
    <div className="field" style={style}>
      {label && <label>{label}</label>}
      {children}
      {error ? (
        <p style={{ fontSize: 12, color: 'var(--color-accent-800)', margin: '6px 0 0' }}>{error}</p>
      ) : hint ? (
        <p style={{ fontSize: 11, opacity: 0.6, margin: '5px 0 0' }}>{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={`input ${className}`.trim()} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className = '', ...props }, ref) {
  return <textarea ref={ref} className={`input ${className}`.trim()} {...props} />;
});

export const Select = forwardRef(function Select({ className = '', children, ...props }, ref) {
  return (
    <select ref={ref} className={`input ${className}`.trim()} {...props}>
      {children}
    </select>
  );
});
