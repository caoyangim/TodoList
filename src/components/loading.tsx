import { LoaderCircle } from "lucide-react";

export function LoadingSpinner({
  size = 16,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <LoaderCircle
      aria-hidden="true"
      className={`loading-spinner ${className}`.trim()}
      size={size}
    />
  );
}

export function LoadingState({ label = "正在加载..." }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="loading-indicator">
        <LoadingSpinner size={22} />
        <span>{label}</span>
      </span>
    </div>
  );
}
