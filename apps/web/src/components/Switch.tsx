import { useId } from "react";

/** Accessible on/off control (role="switch") with a label and an explanation of its effect. */
export function Switch({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="switch-row">
      <div className="switch-row__text">
        <span id={`${id}-label`} className="type-body switch-row__label">
          {label}
        </span>
        <span id={`${id}-desc`} className="type-meta text-muted">
          {description}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-desc`}
        className={`switch${checked ? " switch--on" : ""}`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__knob" aria-hidden="true" />
      </button>
    </div>
  );
}
