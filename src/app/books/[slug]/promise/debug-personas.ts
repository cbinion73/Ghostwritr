"use server";

import { getPromiseWorkspace } from "@/lib/workflows/promise";

export async function debugGetPersonas(slug: string) {
  const workspace = await getPromiseWorkspace(slug);

  return {
    personaCount: workspace.personas.personas?.length || 0,
    personaNames: workspace.personas.personas?.map((p) => p.name) || [],
    firstPersona: workspace.personas.personas?.[0] || null,
  };
}
