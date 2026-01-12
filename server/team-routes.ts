import { Router, Request, Response, NextFunction } from "express";
import { db } from "./db";
import { 
  teams, 
  teamMembers, 
  teamInvitations,
  userRoles,
  roles,
  users,
  type Team,
  type TeamMember,
  type TeamInvitation,
  type User,
  TEAM_MEMBER_ROLES,
  insertTeamSchema,
  insertTeamMemberSchema,
} from "@shared/models/auth";
import { eq, and, or, desc, isNull } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "crypto";

const router = Router();

// Helper to get user from request
function getUser(req: Request): User {
  return req.user as User;
}

// Helper to check if user is authenticated
function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

// Helper to generate URL-safe slug
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}

// Get all teams for the current user
router.get("/api/teams", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).id;
    
    // Get teams where user is owner or member
    const ownedTeams = await db
      .select()
      .from(teams)
      .where(eq(teams.ownerId, userId));
    
    const memberTeams = await db
      .select({ team: teams, membership: teamMembers })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(and(eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)));
    
    // Combine and deduplicate
    const allTeams = [
      ...ownedTeams.map(t => ({ ...t, memberRole: "owner" as const })),
      ...memberTeams
        .filter(m => !ownedTeams.some(t => t.id === m.team.id))
        .map(m => ({ ...m.team, memberRole: m.membership.role })),
    ];
    
    res.json(allTeams);
  } catch (error) {
    console.error("Error fetching teams:", error);
    res.status(500).json({ message: "Failed to fetch teams" });
  }
});

// Get a specific team by ID
router.get("/api/teams/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).id;
    const teamId = req.params.id;
    
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
    
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }
    
    // Check if user has access
    const isOwner = team.ownerId === userId;
    const [membership] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)));
    
    if (!isOwner && !membership) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    // Get team members
    const members = await db
      .select({ 
        member: teamMembers,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.isActive, true)));
    
    res.json({ 
      ...team, 
      members: members.map(m => ({ ...m.member, user: m.user })),
      currentUserRole: isOwner ? "owner" : membership?.role,
    });
  } catch (error) {
    console.error("Error fetching team:", error);
    res.status(500).json({ message: "Failed to fetch team" });
  }
});

// Create a new team
router.post("/api/teams", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).id;
    
    const schema = z.object({
      name: z.string().min(1, "Team name is required").max(100),
      type: z.enum(["startup", "investment_firm", "advisory", "other"]),
      description: z.string().optional(),
      website: z.string().url().optional().or(z.literal("")),
    });
    
    const input = schema.parse(req.body);
    
    // Generate unique slug
    let slug = generateSlug(input.name);
    let slugSuffix = 0;
    while (true) {
      const existingSlug = await db
        .select()
        .from(teams)
        .where(eq(teams.slug, slugSuffix > 0 ? `${slug}-${slugSuffix}` : slug))
        .limit(1);
      
      if (existingSlug.length === 0) {
        if (slugSuffix > 0) slug = `${slug}-${slugSuffix}`;
        break;
      }
      slugSuffix++;
    }
    
    const [newTeam] = await db
      .insert(teams)
      .values({
        name: input.name,
        slug,
        type: input.type,
        description: input.description || null,
        website: input.website || null,
        ownerId: userId,
        settings: { allowMemberInvites: true, visibility: "private" },
      })
      .returning();
    
    // Add owner as a team member
    await db.insert(teamMembers).values({
      teamId: newTeam.id,
      userId,
      role: "owner",
      acceptedAt: new Date(),
      isActive: true,
    });
    
    res.status(201).json(newTeam);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    console.error("Error creating team:", error);
    res.status(500).json({ message: "Failed to create team" });
  }
});

// Update a team
router.patch("/api/teams/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).id;
    const teamId = req.params.id;
    
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
    
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }
    
    // Only owner or admin can update
    const isOwner = team.ownerId === userId;
    const [membership] = await db
      .select()
      .from(teamMembers)
      .where(and(
        eq(teamMembers.teamId, teamId), 
        eq(teamMembers.userId, userId), 
        eq(teamMembers.isActive, true),
        or(eq(teamMembers.role, "owner"), eq(teamMembers.role, "admin"))
      ));
    
    if (!isOwner && !membership) {
      return res.status(403).json({ message: "Only team owners and admins can update the team" });
    }
    
    const schema = z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().optional(),
      website: z.string().url().optional().or(z.literal("")),
      logo: z.string().optional(),
      settings: z.object({
        allowMemberInvites: z.boolean().optional(),
        visibility: z.enum(["public", "private"]).optional(),
      }).optional(),
    });
    
    const input = schema.parse(req.body);
    
    const [updated] = await db
      .update(teams)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(teams.id, teamId))
      .returning();
    
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    console.error("Error updating team:", error);
    res.status(500).json({ message: "Failed to update team" });
  }
});

// Delete a team
router.delete("/api/teams/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).id;
    const teamId = req.params.id;
    
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
    
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }
    
    // Only owner can delete
    if (team.ownerId !== userId) {
      return res.status(403).json({ message: "Only the team owner can delete the team" });
    }
    
    await db.delete(teams).where(eq(teams.id, teamId));
    
    res.json({ message: "Team deleted successfully" });
  } catch (error) {
    console.error("Error deleting team:", error);
    res.status(500).json({ message: "Failed to delete team" });
  }
});

// Get team members
router.get("/api/teams/:id/members", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).id;
    const teamId = req.params.id;
    
    // Check access
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }
    
    const isOwner = team.ownerId === userId;
    const [membership] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)));
    
    if (!isOwner && !membership) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    const members = await db
      .select({ 
        member: teamMembers,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, teamId));
    
    res.json(members.map(m => ({ ...m.member, user: m.user })));
  } catch (error) {
    console.error("Error fetching team members:", error);
    res.status(500).json({ message: "Failed to fetch team members" });
  }
});

// Invite a member to the team
router.post("/api/teams/:id/invite", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).id;
    const teamId = req.params.id;
    
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }
    
    // Check if user can invite (owner, admin, or settings allow)
    const isOwner = team.ownerId === userId;
    const [membership] = await db
      .select()
      .from(teamMembers)
      .where(and(
        eq(teamMembers.teamId, teamId), 
        eq(teamMembers.userId, userId), 
        eq(teamMembers.isActive, true)
      ));
    
    const canInvite = isOwner || 
      membership?.role === "admin" || 
      (membership && (team.settings as any)?.allowMemberInvites);
    
    if (!canInvite) {
      return res.status(403).json({ message: "You don't have permission to invite members" });
    }
    
    const schema = z.object({
      email: z.string().email("Invalid email address"),
      role: z.enum(["admin", "editor", "viewer"]).default("viewer"),
    });
    
    const input = schema.parse(req.body);
    
    // Check if email is already a member
    const [existingUser] = await db.select().from(users).where(eq(users.email, input.email.toLowerCase()));
    if (existingUser) {
      const [existingMember] = await db
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, existingUser.id)));
      
      if (existingMember) {
        return res.status(400).json({ message: "User is already a team member" });
      }
    }
    
    // Check for existing pending invitation
    const [existingInvite] = await db
      .select()
      .from(teamInvitations)
      .where(and(
        eq(teamInvitations.teamId, teamId),
        eq(teamInvitations.email, input.email.toLowerCase()),
        isNull(teamInvitations.acceptedAt)
      ));
    
    if (existingInvite) {
      return res.status(400).json({ message: "An invitation has already been sent to this email" });
    }
    
    // Create invitation
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    const [invitation] = await db
      .insert(teamInvitations)
      .values({
        teamId,
        email: input.email.toLowerCase(),
        role: input.role,
        token,
        invitedBy: userId,
        expiresAt,
      })
      .returning();
    
    // TODO: Send invitation email
    
    res.status(201).json({ 
      message: "Invitation sent successfully",
      invitation: { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    console.error("Error inviting member:", error);
    res.status(500).json({ message: "Failed to send invitation" });
  }
});

// Accept invitation
router.post("/api/teams/invitations/:token/accept", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).id;
    const { token } = req.params;
    
    const [invitation] = await db
      .select()
      .from(teamInvitations)
      .where(eq(teamInvitations.token, token));
    
    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }
    
    if (invitation.acceptedAt) {
      return res.status(400).json({ message: "Invitation has already been used" });
    }
    
    if (new Date() > invitation.expiresAt) {
      return res.status(400).json({ message: "Invitation has expired" });
    }
    
    // Verify email matches
    const user = getUser(req);
    if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      return res.status(403).json({ message: "This invitation was sent to a different email address" });
    }
    
    // Add as team member
    await db.insert(teamMembers).values({
      teamId: invitation.teamId,
      userId,
      role: invitation.role as any,
      invitedBy: invitation.invitedBy,
      acceptedAt: new Date(),
      isActive: true,
    });
    
    // Mark invitation as used
    await db
      .update(teamInvitations)
      .set({ acceptedAt: new Date() })
      .where(eq(teamInvitations.id, invitation.id));
    
    const [team] = await db.select().from(teams).where(eq(teams.id, invitation.teamId));
    
    res.json({ message: "Successfully joined team", team });
  } catch (error) {
    console.error("Error accepting invitation:", error);
    res.status(500).json({ message: "Failed to accept invitation" });
  }
});

// Update member role
router.patch("/api/teams/:id/members/:memberId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).id;
    const { id: teamId, memberId } = req.params;
    
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }
    
    // Only owner or admin can update roles
    const isOwner = team.ownerId === userId;
    const [userMembership] = await db
      .select()
      .from(teamMembers)
      .where(and(
        eq(teamMembers.teamId, teamId), 
        eq(teamMembers.userId, userId), 
        eq(teamMembers.isActive, true),
        or(eq(teamMembers.role, "owner"), eq(teamMembers.role, "admin"))
      ));
    
    if (!isOwner && !userMembership) {
      return res.status(403).json({ message: "Only owners and admins can update member roles" });
    }
    
    const [targetMember] = await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.id, memberId));
    
    if (!targetMember || targetMember.teamId !== teamId) {
      return res.status(404).json({ message: "Member not found" });
    }
    
    // Cannot change owner's role
    if (targetMember.role === "owner") {
      return res.status(400).json({ message: "Cannot change the owner's role" });
    }
    
    const schema = z.object({
      role: z.enum(["admin", "editor", "viewer"]),
    });
    
    const input = schema.parse(req.body);
    
    const [updated] = await db
      .update(teamMembers)
      .set({ role: input.role })
      .where(eq(teamMembers.id, memberId))
      .returning();
    
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    console.error("Error updating member role:", error);
    res.status(500).json({ message: "Failed to update member role" });
  }
});

// Remove a member from the team
router.delete("/api/teams/:id/members/:memberId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).id;
    const { id: teamId, memberId } = req.params;
    
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }
    
    const [targetMember] = await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.id, memberId));
    
    if (!targetMember || targetMember.teamId !== teamId) {
      return res.status(404).json({ message: "Member not found" });
    }
    
    // Can't remove the owner
    if (targetMember.role === "owner") {
      return res.status(400).json({ message: "Cannot remove the team owner" });
    }
    
    // Users can remove themselves, or owners/admins can remove others
    const isSelf = targetMember.userId === userId;
    const isOwner = team.ownerId === userId;
    const [userMembership] = await db
      .select()
      .from(teamMembers)
      .where(and(
        eq(teamMembers.teamId, teamId), 
        eq(teamMembers.userId, userId), 
        eq(teamMembers.isActive, true),
        or(eq(teamMembers.role, "owner"), eq(teamMembers.role, "admin"))
      ));
    
    if (!isSelf && !isOwner && !userMembership) {
      return res.status(403).json({ message: "You don't have permission to remove this member" });
    }
    
    await db.delete(teamMembers).where(eq(teamMembers.id, memberId));
    
    res.json({ message: "Member removed successfully" });
  } catch (error) {
    console.error("Error removing member:", error);
    res.status(500).json({ message: "Failed to remove member" });
  }
});

// Get pending invitations for a team
router.get("/api/teams/:id/invitations", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).id;
    const teamId = req.params.id;
    
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }
    
    // Check access
    const isOwner = team.ownerId === userId;
    const [membership] = await db
      .select()
      .from(teamMembers)
      .where(and(
        eq(teamMembers.teamId, teamId), 
        eq(teamMembers.userId, userId), 
        eq(teamMembers.isActive, true),
        or(eq(teamMembers.role, "owner"), eq(teamMembers.role, "admin"))
      ));
    
    if (!isOwner && !membership) {
      return res.status(403).json({ message: "Only owners and admins can view invitations" });
    }
    
    const invitations = await db
      .select()
      .from(teamInvitations)
      .where(and(
        eq(teamInvitations.teamId, teamId),
        isNull(teamInvitations.acceptedAt)
      ))
      .orderBy(desc(teamInvitations.createdAt));
    
    // Filter out expired
    const pending = invitations.filter(inv => new Date() < inv.expiresAt);
    
    res.json(pending);
  } catch (error) {
    console.error("Error fetching invitations:", error);
    res.status(500).json({ message: "Failed to fetch invitations" });
  }
});

// Cancel an invitation
router.delete("/api/teams/:id/invitations/:inviteId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).id;
    const { id: teamId, inviteId } = req.params;
    
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }
    
    const [invitation] = await db
      .select()
      .from(teamInvitations)
      .where(eq(teamInvitations.id, inviteId));
    
    if (!invitation || invitation.teamId !== teamId) {
      return res.status(404).json({ message: "Invitation not found" });
    }
    
    // Only owner, admin, or the person who invited can cancel
    const isOwner = team.ownerId === userId;
    const isInviter = invitation.invitedBy === userId;
    const [membership] = await db
      .select()
      .from(teamMembers)
      .where(and(
        eq(teamMembers.teamId, teamId), 
        eq(teamMembers.userId, userId), 
        eq(teamMembers.isActive, true),
        eq(teamMembers.role, "admin")
      ));
    
    if (!isOwner && !isInviter && !membership) {
      return res.status(403).json({ message: "You don't have permission to cancel this invitation" });
    }
    
    await db.delete(teamInvitations).where(eq(teamInvitations.id, inviteId));
    
    res.json({ message: "Invitation cancelled" });
  } catch (error) {
    console.error("Error cancelling invitation:", error);
    res.status(500).json({ message: "Failed to cancel invitation" });
  }
});

// ============================================================================
// USER ROLES API
// ============================================================================

// Get current user's roles
router.get("/api/users/me/roles", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).id;
    
    const userRolesData = await db
      .select({ userRole: userRoles, role: roles })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(userRoles.userId, userId), eq(userRoles.isActive, true)));
    
    res.json(userRolesData.map(r => ({
      id: r.userRole.id,
      roleId: r.role.id,
      roleName: r.role.name,
      permissions: r.role.permissions,
      isActive: r.userRole.isActive,
    })));
  } catch (error) {
    console.error("Error fetching user roles:", error);
    res.status(500).json({ message: "Failed to fetch user roles" });
  }
});

// Switch active role
router.post("/api/users/me/switch-role", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).id;
    
    const schema = z.object({
      role: z.enum(["founder", "investor"]),
    });
    
    const input = schema.parse(req.body);
    
    // Verify user has this role
    const [roleRecord] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, input.role));
    
    if (!roleRecord) {
      return res.status(400).json({ message: "Invalid role" });
    }
    
    const [userRoleRecord] = await db
      .select()
      .from(userRoles)
      .where(and(
        eq(userRoles.userId, userId),
        eq(userRoles.roleId, roleRecord.id),
        eq(userRoles.isActive, true)
      ));
    
    if (!userRoleRecord) {
      return res.status(400).json({ message: "You don't have this role" });
    }
    
    // Update user's active role
    await db
      .update(users)
      .set({ activeRole: input.role, userType: input.role })
      .where(eq(users.id, userId));
    
    res.json({ message: "Role switched successfully", activeRole: input.role });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    console.error("Error switching role:", error);
    res.status(500).json({ message: "Failed to switch role" });
  }
});

// Add a role to the current user
router.post("/api/users/me/roles", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = getUser(req).id;
    
    const schema = z.object({
      role: z.enum(["founder", "investor"]),
    });
    
    const input = schema.parse(req.body);
    
    // Get the role record
    const [roleRecord] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, input.role));
    
    if (!roleRecord) {
      return res.status(400).json({ message: "Invalid role" });
    }
    
    // Check if user already has this role
    const [existingUserRole] = await db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleRecord.id)));
    
    if (existingUserRole) {
      // Reactivate if inactive
      if (!existingUserRole.isActive) {
        await db
          .update(userRoles)
          .set({ isActive: true })
          .where(eq(userRoles.id, existingUserRole.id));
      }
      return res.json({ message: "Role already exists", role: input.role });
    }
    
    // Add the role
    await db.insert(userRoles).values({
      userId,
      roleId: roleRecord.id,
      isActive: true,
    });
    
    res.status(201).json({ message: "Role added successfully", role: input.role });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    console.error("Error adding role:", error);
    res.status(500).json({ message: "Failed to add role" });
  }
});

export default router;
