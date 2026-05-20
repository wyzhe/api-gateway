import { forwardRef, type InputHTMLAttributes } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type NumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange" | "min" | "max" | "step"
> & {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
};

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, value, onChange, min, max, step = 1, disabled, ...props }, ref) => {
    // String(step) keeps the fractional digit count so 0.1 steps don't drift
    // into 1.0000000000000001 via float addition.
    const decimals = (String(step).split(".")[1] ?? "").length;
    const clamp = (n: number) => {
      if (min !== undefined && n < min) return min;
      if (max !== undefined && n > max) return max;
      return n;
    };
    const stepBy = (dir: 1 | -1) => {
      const raw = value + dir * step;
      onChange(clamp(decimals ? Number(raw.toFixed(decimals)) : raw));
    };
    const atMin = min !== undefined && value <= min;
    const atMax = max !== undefined && value >= max;

    return (
      <div
        className={cn(
          "flex h-7 w-full overflow-hidden rounded-md border border-border bg-input transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <input
          ref={ref}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          // A native number input doesn't bound typed values; reconcile on blur.
          onBlur={() => onChange(clamp(value))}
          className="number-input-field h-full min-w-0 grow bg-transparent px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed"
          {...props}
        />
        <div className="flex w-6 flex-col border-l border-border">
          <Stepper dir="up" onClick={() => stepBy(1)} disabled={disabled || atMax} />
          <Stepper dir="down" onClick={() => stepBy(-1)} disabled={disabled || atMin} />
        </div>
      </div>
    );
  },
);
NumberInput.displayName = "NumberInput";

function Stepper({
  dir,
  onClick,
  disabled,
}: {
  dir: "up" | "down";
  onClick: () => void;
  disabled?: boolean;
}) {
  const Icon = dir === "up" ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={dir === "up" ? "Increment" : "Decrement"}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex grow items-center justify-center text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:text-dim disabled:hover:bg-transparent disabled:hover:text-dim",
        dir === "down" && "border-t border-border",
      )}
    >
      <Icon className="h-3 w-3" />
    </button>
  );
}
