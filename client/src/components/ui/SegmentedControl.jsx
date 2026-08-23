export function SegmentedControl({ options, value, onChange, name, style }) {
  return (
    <div className="seg" style={{ flexWrap: 'wrap', ...style }}>
      {options.map((option) => (
        <label key={option} className="seg-opt">
          <input type="radio" name={name} checked={value === option} onChange={() => onChange(option)} />
          {option}
        </label>
      ))}
    </div>
  );
}
