import { getPostProductionWorkspace } from "@/lib/workflows/post-production";
import { PostProductionPageShell } from "../_post-production/page-shell";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getPostProductionWorkspace(slug, "LAUNCH_LISTING");
  return <PostProductionPageShell workspace={workspace} />;
}
