"use client"
import { PlanningWorkspace } from "@/components/planning/planning-workspace"
export function RunwayContent({ orgId }: { orgId: string }) { return <PlanningWorkspace tool="runway" orgId={orgId} /> }
