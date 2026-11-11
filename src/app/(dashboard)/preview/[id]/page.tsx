import { PreviewScreen } from "@/components/deployment-detail";
export const metadata = { title: "Sandbox preview" };
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <PreviewScreen id={id}/>; }
