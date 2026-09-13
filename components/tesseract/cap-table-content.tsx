"use client"
import { PlanningWorkspace } from "@/components/planning/planning-workspace"
export function CapTableContent({ orgId }: { orgId: string }) { return <PlanningWorkspace tool="cap-table" orgId={orgId} /> }
