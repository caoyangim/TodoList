import { TemplateEditor } from "@/features/templates/template-editor";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <TemplateEditor templateId={(await params).id} />;
}
