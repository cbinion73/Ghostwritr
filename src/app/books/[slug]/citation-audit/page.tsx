import { CitationAuditContent } from "./citation-audit-content";

export default async function CitationAuditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CitationAuditContent slug={slug} />;
}
