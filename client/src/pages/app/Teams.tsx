import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Users, 
  Plus, 
  Settings,
  UserPlus,
  MoreVertical,
  Mail,
  Crown,
  Shield,
  Edit2,
  Eye,
  Trash2,
  Building2,
  Briefcase,
  Globe,
  Loader2,
} from "lucide-react";

interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: "owner" | "admin" | "editor" | "viewer";
  isActive: boolean;
  user: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  };
}

interface Team {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  type: string;
  logo: string | null;
  website: string | null;
  ownerId: string;
  memberRole?: string;
  members?: TeamMember[];
  currentUserRole?: string;
}

const createTeamSchema = z.object({
  name: z.string().min(1, "Team name is required").max(100),
  type: z.enum(["startup", "investment_firm", "advisory", "other"]),
  description: z.string().optional(),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

type CreateTeamFormData = z.infer<typeof createTeamSchema>;

const inviteMemberSchema = z.object({
  email: z.string().email("Must be a valid email"),
  role: z.enum(["admin", "editor", "viewer"]),
});

type InviteMemberFormData = z.infer<typeof inviteMemberSchema>;

const TEAM_TYPES = [
  { value: "startup", label: "Startup", icon: Building2 },
  { value: "investment_firm", label: "Investment Firm", icon: Briefcase },
  { value: "advisory", label: "Advisory", icon: Users },
  { value: "other", label: "Other", icon: Users },
];

const ROLE_LABELS: Record<string, { label: string; icon: typeof Crown; color: string }> = {
  owner: { label: "Owner", icon: Crown, color: "text-yellow-500" },
  admin: { label: "Admin", icon: Shield, color: "text-blue-500" },
  editor: { label: "Editor", icon: Edit2, color: "text-green-500" },
  viewer: { label: "Viewer", icon: Eye, color: "text-muted-foreground" },
};

function TeamCard({ team, onSelect }: { team: Team; onSelect: (team: Team) => void }) {
  const typeInfo = TEAM_TYPES.find(t => t.value === team.type) || TEAM_TYPES[3];
  const TypeIcon = typeInfo.icon;
  const roleInfo = ROLE_LABELS[team.memberRole || "viewer"];
  const RoleIcon = roleInfo.icon;

  return (
    <Card 
      data-testid={`card-team-${team.id}`}
      className="hover-elevate cursor-pointer transition-all"
      onClick={() => onSelect(team)}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-md bg-primary/10 flex items-center justify-center">
            <TypeIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">{team.name}</CardTitle>
            <CardDescription className="flex items-center gap-1 mt-1">
              <RoleIcon className={`h-3 w-3 ${roleInfo.color}`} />
              <span>{roleInfo.label}</span>
            </CardDescription>
          </div>
        </div>
        <Badge variant="outline">{typeInfo.label}</Badge>
      </CardHeader>
      {team.description && (
        <CardContent>
          <p className="text-sm text-muted-foreground line-clamp-2">{team.description}</p>
        </CardContent>
      )}
      <CardFooter className="text-xs text-muted-foreground">
        {team.website && (
          <a 
            href={team.website} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-primary"
            onClick={(e) => e.stopPropagation()}
          >
            <Globe className="h-3 w-3" />
            {new URL(team.website).hostname}
          </a>
        )}
      </CardFooter>
    </Card>
  );
}

function MemberRow({ 
  member, 
  teamId, 
  canManage,
  onRoleChange,
  onRemove,
}: { 
  member: TeamMember; 
  teamId: string;
  canManage: boolean;
  onRoleChange: (memberId: string, role: string) => void;
  onRemove: (memberId: string) => void;
}) {
  const roleInfo = ROLE_LABELS[member.role];
  const RoleIcon = roleInfo.icon;
  const initials = `${member.user.firstName?.[0] || ""}${member.user.lastName?.[0] || ""}`.toUpperCase() || "?";

  return (
    <div 
      data-testid={`member-${member.id}`}
      className="flex items-center justify-between py-3 px-4 border-b last:border-b-0"
    >
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={member.user.profileImageUrl || undefined} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">
            {member.user.firstName} {member.user.lastName}
          </p>
          <p className="text-sm text-muted-foreground">{member.user.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="flex items-center gap-1">
          <RoleIcon className={`h-3 w-3 ${roleInfo.color}`} />
          {roleInfo.label}
        </Badge>
        {canManage && member.role !== "owner" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid={`button-member-menu-${member.id}`}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onRoleChange(member.id, "admin")}>
                Make Admin
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRoleChange(member.id, "editor")}>
                Make Editor
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRoleChange(member.id, "viewer")}>
                Make Viewer
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onRemove(member.id)}
                className="text-destructive"
              >
                Remove from team
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

function TeamDetail({ 
  teamId, 
  onBack 
}: { 
  teamId: string; 
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  const { data: team, isLoading } = useQuery<Team>({
    queryKey: ["/api/teams", teamId],
  });

  const inviteForm = useForm<InviteMemberFormData>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: {
      email: "",
      role: "viewer",
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: InviteMemberFormData) => {
      return apiRequest("POST", `/api/teams/${teamId}/invite`, data);
    },
    onSuccess: () => {
      toast({ title: "Invitation sent", description: "The invitation has been sent to the email address." });
      setInviteDialogOpen(false);
      inviteForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/teams", teamId] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send invitation", description: error.message, variant: "destructive" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      return apiRequest("PATCH", `/api/teams/${teamId}/members/${memberId}`, { role });
    },
    onSuccess: () => {
      toast({ title: "Role updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/teams", teamId] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update role", description: error.message, variant: "destructive" });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      return apiRequest("DELETE", `/api/teams/${teamId}/members/${memberId}`);
    },
    onSuccess: () => {
      toast({ title: "Member removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/teams", teamId] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove member", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Team not found</p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          Go back
        </Button>
      </div>
    );
  }

  const canManage = team.currentUserRole === "owner" || team.currentUserRole === "admin";
  const typeInfo = TEAM_TYPES.find(t => t.value === team.type) || TEAM_TYPES[3];
  const TypeIcon = typeInfo.icon;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} data-testid="button-back">
          ← Back to teams
        </Button>
        {canManage && (
          <div className="flex gap-2">
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-invite-member">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Team Member</DialogTitle>
                  <DialogDescription>
                    Send an invitation to join your team.
                  </DialogDescription>
                </DialogHeader>
                <Form {...inviteForm}>
                  <form onSubmit={inviteForm.handleSubmit((data) => inviteMutation.mutate(data))} className="space-y-4">
                    <FormField
                      control={inviteForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <Input placeholder="colleague@company.com" {...field} data-testid="input-invite-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={inviteForm.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Role</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-invite-role">
                                <SelectValue placeholder="Select a role" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="admin">Admin - Can manage members and content</SelectItem>
                              <SelectItem value="editor">Editor - Can create and edit content</SelectItem>
                              <SelectItem value="viewer">Viewer - Read-only access</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button type="submit" disabled={inviteMutation.isPending} data-testid="button-send-invite">
                        {inviteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Send Invitation
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start gap-4">
          <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center">
            <TypeIcon className="h-8 w-8 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-2xl">{team.name}</CardTitle>
            <CardDescription className="mt-1">{typeInfo.label}</CardDescription>
            {team.description && (
              <p className="text-sm text-muted-foreground mt-2">{team.description}</p>
            )}
            {team.website && (
              <a 
                href={team.website} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline mt-2 inline-flex items-center gap-1"
              >
                <Globe className="h-3 w-3" />
                {team.website}
              </a>
            )}
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members
          </CardTitle>
          <CardDescription>
            {team.members?.length || 0} member{(team.members?.length || 0) !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {team.members && team.members.length > 0 ? (
            <div className="divide-y">
              {team.members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  teamId={teamId}
                  canManage={canManage}
                  onRoleChange={(memberId, role) => updateRoleMutation.mutate({ memberId, role })}
                  onRemove={(memberId) => removeMemberMutation.mutate(memberId)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No members yet. Invite someone to join your team!
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Teams() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data: teams, isLoading } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const createForm = useForm<CreateTeamFormData>({
    resolver: zodResolver(createTeamSchema),
    defaultValues: {
      name: "",
      type: "startup",
      description: "",
      website: "",
    },
  });

  const createTeamMutation = useMutation({
    mutationFn: async (data: CreateTeamFormData) => {
      return apiRequest("POST", "/api/teams", data);
    },
    onSuccess: () => {
      toast({ title: "Team created", description: "Your team has been created successfully." });
      setCreateDialogOpen(false);
      createForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create team", description: error.message, variant: "destructive" });
    },
  });

  if (selectedTeamId) {
    return (
      <AppLayout>
        <div className="container mx-auto max-w-4xl py-8 px-4">
          <TeamDetail teamId={selectedTeamId} onBack={() => setSelectedTeamId(null)} />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto max-w-4xl py-8 px-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
            <p className="text-muted-foreground mt-1">
              Collaborate with your team members on deals and startups
            </p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-team">
                <Plus className="h-4 w-4 mr-2" />
                Create Team
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a New Team</DialogTitle>
                <DialogDescription>
                  Set up a team to collaborate with others on your deals and projects.
                </DialogDescription>
              </DialogHeader>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit((data) => createTeamMutation.mutate(data))} className="space-y-4">
                  <FormField
                    control={createForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Team Name</FormLabel>
                        <FormControl>
                          <Input placeholder="My Company" {...field} data-testid="input-team-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Team Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-team-type">
                              <SelectValue placeholder="Select a type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TEAM_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Brief description of your team..." 
                            {...field} 
                            data-testid="textarea-team-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website (optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="https://example.com" {...field} data-testid="input-team-website" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="submit" disabled={createTeamMutation.isPending} data-testid="button-submit-team">
                      {createTeamMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Create Team
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : teams && teams.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {teams.map((team) => (
              <TeamCard 
                key={team.id} 
                team={team} 
                onSelect={(t) => setSelectedTeamId(t.id)}
              />
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No teams yet</h3>
              <p className="text-muted-foreground text-center max-w-sm mb-4">
                Create a team to collaborate with colleagues on deals, startups, and more.
              </p>
              <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-team-empty">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Team
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
