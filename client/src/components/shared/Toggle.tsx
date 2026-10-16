import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** What it switches, for screen readers */
  label?: string;
}

const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label }) => (
  <div
    role="switch"
    aria-checked={checked}
    aria-label={label}
    tabIndex={0}
    onClick={() => onChange(!checked)}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onChange(!checked);
      }
    }}
    style={{
      width: 44,
      height: 26,
      borderRadius: 13,
      padding: 3,
      cursor: 'pointer',
      backgroundColor: checked ? 'var(--warm-accent)' : 'var(--warm-border)',
      transition: 'background-color 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      flexShrink: 0,
    }}
  >
    <div
      style={{
        width: 20,
        height: 20,
        borderRadius: '50%',
        backgroundColor: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
        transform: checked ? 'translateX(18px)' : 'translateX(0)',
        transition: 'transform 0.2s ease',
      }}
    />
  </div>
);

export { Toggle };
export default Toggle;
