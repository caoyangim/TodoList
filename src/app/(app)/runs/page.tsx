import { RunListPage } from "@/features/runs/run-list-page";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ templateId?: string }>;
}) {
  return <RunListPage initialTemplateId={(await searchParams).templateId ?? null} />;
}
