import { db } from "../db";
import { roles, SYSTEM_ROLES, PERMISSIONS } from "@shared/models/auth";
import { eq } from "drizzle-orm";

const ROLE_DEFINITIONS = {
  founder: {
    description: "Startup founder seeking investment",
    permissions: [
      PERMISSIONS.STARTUP_READ,
      PERMISSIONS.STARTUP_WRITE,
      PERMISSIONS.STARTUP_DELETE,
      PERMISSIONS.DEALROOM_READ,
      PERMISSIONS.DEALROOM_WRITE,
      PERMISSIONS.DEALROOM_SHARE,
      PERMISSIONS.INVESTOR_READ,
      PERMISSIONS.DEAL_READ,
      PERMISSIONS.DEAL_WRITE,
      PERMISSIONS.TEAM_MANAGE,
      PERMISSIONS.TEAM_INVITE,
    ],
  },
  investor: {
    description: "Investor looking at deal flow",
    permissions: [
      PERMISSIONS.INVESTOR_READ,
      PERMISSIONS.INVESTOR_WRITE,
      PERMISSIONS.STARTUP_READ,
      PERMISSIONS.DEAL_READ,
      PERMISSIONS.DEAL_WRITE,
      PERMISSIONS.DEAL_DELETE,
      PERMISSIONS.DEAL_SHARE,
      PERMISSIONS.DEALROOM_READ,
      PERMISSIONS.DEALROOM_WRITE,
      PERMISSIONS.DEALROOM_SHARE,
      PERMISSIONS.TEAM_MANAGE,
      PERMISSIONS.TEAM_INVITE,
    ],
  },
  admin: {
    description: "Platform administrator",
    permissions: Object.values(PERMISSIONS),
  },
  team_owner: {
    description: "Team owner with full control",
    permissions: [
      PERMISSIONS.TEAM_MANAGE,
      PERMISSIONS.TEAM_INVITE,
      PERMISSIONS.TEAM_REMOVE,
      PERMISSIONS.DEAL_READ,
      PERMISSIONS.DEAL_WRITE,
      PERMISSIONS.DEAL_DELETE,
      PERMISSIONS.DEAL_SHARE,
      PERMISSIONS.DEALROOM_READ,
      PERMISSIONS.DEALROOM_WRITE,
      PERMISSIONS.DEALROOM_SHARE,
    ],
  },
  team_editor: {
    description: "Team member with edit permissions",
    permissions: [
      PERMISSIONS.DEAL_READ,
      PERMISSIONS.DEAL_WRITE,
      PERMISSIONS.DEALROOM_READ,
      PERMISSIONS.DEALROOM_WRITE,
    ],
  },
  team_viewer: {
    description: "Team member with read-only access",
    permissions: [
      PERMISSIONS.DEAL_READ,
      PERMISSIONS.DEALROOM_READ,
      PERMISSIONS.STARTUP_READ,
      PERMISSIONS.INVESTOR_READ,
    ],
  },
};

export async function seedRoles(): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const roleName of SYSTEM_ROLES) {
    const definition = ROLE_DEFINITIONS[roleName];
    if (!definition) continue;

    const existing = await db.select().from(roles).where(eq(roles.name, roleName)).limit(1);
    
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    await db.insert(roles).values({
      name: roleName,
      description: definition.description,
      permissions: definition.permissions,
      isSystemRole: true,
    });
    inserted++;
  }

  return { inserted, skipped };
}
