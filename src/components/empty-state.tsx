import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div>
        <Inbox size={34} strokeWidth={1.5} />
        <strong>{title}</strong>
        <div>{description}</div>
        {action ? <div className="empty-state-action">{action}</div> : null}
      </div>
    </div>
  );
}
