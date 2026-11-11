import { DeploymentDetail } from "@/components/deployment-detail";
export const metadata = { title: "Deployment details" };
export default async function DeploymentPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <DeploymentDetail id={id}/>; }
