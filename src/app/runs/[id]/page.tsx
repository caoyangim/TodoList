import { RunDetailPage } from "@/features/runs/run-detail-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <RunDetailPage runId={(await params).id} />;
}
