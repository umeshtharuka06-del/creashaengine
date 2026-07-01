"use client";

/**
 * Single source of truth for amount/number inputs across the app.
 *
 * UX rule (project-wide): the field may be emptied completely — we NEVER snap a
 * default back while the user types. `value` is `number | null` (null = empty).
 * A small warning is shown beneath the field when the value is empty or below
 * the minimum; the parent does the real gate on submit. Typing is never locked.
 */
export function AmountInput({
  value,
  onChange,
  min,
  warning,
  placeholder,
  disabled,
  step,
  className = "",
  showWarning = true,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  warning?: string;
  placeholder?: string;
  disabled?: boolean;
  step?: number;
  className?: string;
  showWarning?: boolean;
}) {
  const invalid = value === null || (min != null && value < min);
  return (
    <div className={className}>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        disabled={disabled}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => {
          const t = e.target.value;
          onChange(t === "" ? null : Number(t));
        }}
        className={`input ${invalid && showWarning && warning ? "!border-game-red/60" : ""}`}
      />
      {showWarning && warning && invalid && (
        <p className="mt-1 text-xs font-medium text-game-red-bright">{warning}</p>
      )}
    </div>
  );
}
