import { ProjectDetail } from "@/components/project-detail";
export const metadata = { title: "Project workspace" };
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <ProjectDetail id={id}/>; }
