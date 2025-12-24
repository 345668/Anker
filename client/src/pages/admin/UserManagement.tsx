import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, MoreVertical, Shield, ShieldOff, Trash2, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "./AdminLayout";
import type { User } from "@shared/schema";

export default function UserManagement() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<User> }) => {
      return apiRequest(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(data) });
    },
    onSuccess: () => {
      toast({ title: "User updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/users/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast({ title: "User deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setDeleteConfirmOpen(false);
      setUserToDelete(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredUsers = users?.filter(user => {
    const query = searchQuery.toLowerCase();
    return (
      user.email?.toLowerCase().includes(query) ||
      user.firstName?.toLowerCase().includes(query) ||
      user.lastName?.toLowerCase().includes(query)
    );
  });

  const toggleAdmin = (user: User) => {
    updateUserMutation.mutate({ id: user.id, data: { isAdmin: !user.isAdmin } });
  };

  const confirmDelete = (user: User) => {
    setUserToDelete(user);
    setDeleteConfirmOpen(true);
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">User Management</h1>
          <p className="text-white/60">Manage user accounts, roles, and permissions</p>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
              data-testid="input-search-users"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 text-[rgb(142,132,247)] animate-spin" />
          </div>
        ) : (
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-white/50 text-sm font-medium px-4 py-3">User</th>
                    <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Email</th>
                    <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Type</th>
                    <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Status</th>
                    <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Joined</th>
                    <th className="text-right text-white/50 text-sm font-medium px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers?.map((user) => (
                    <tr key={user.id} className="border-b border-white/5" data-testid={`row-user-${user.id}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={user.profileImageUrl || undefined} />
                            <AvatarFallback className="bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] text-xs">
                              {user.firstName?.[0]}{user.lastName?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-white font-medium">
                            {user.firstName} {user.lastName}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/60">{user.email}</td>
                      <td className="px-4 py-3">
                        <Badge 
                          variant="outline" 
                          className={`
                            ${user.userType === 'founder' ? 'border-[rgb(142,132,247)]/50 text-[rgb(142,132,247)]' : ''}
                            ${user.userType === 'investor' ? 'border-[rgb(196,227,230)]/50 text-[rgb(196,227,230)]' : ''}
                            ${!user.userType ? 'border-white/20 text-white/40' : ''}
                          `}
                        >
                          {user.userType || 'Not set'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {user.isAdmin && (
                            <Badge className="bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)] border-0">
                              Admin
                            </Badge>
                          )}
                          {user.onboardingCompleted ? (
                            <Badge className="bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)] border-0">
                              Active
                            </Badge>
                          ) : (
                            <Badge className="bg-white/10 text-white/40 border-0">
                              Pending
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/40 text-sm">
                        {user.createdAt && new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-white/40 hover:text-white">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-[rgb(30,30,30)] border-white/10">
                            <DropdownMenuItem 
                              onClick={() => toggleAdmin(user)}
                              className="text-white hover:bg-white/10"
                            >
                              {user.isAdmin ? (
                                <>
                                  <ShieldOff className="w-4 h-4 mr-2" />
                                  Remove Admin
                                </>
                              ) : (
                                <>
                                  <Shield className="w-4 h-4 mr-2" />
                                  Make Admin
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => confirmDelete(user)}
                              className="text-[rgb(251,194,213)] hover:bg-[rgb(251,194,213)]/10"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent className="bg-[rgb(30,30,30)] border-white/10">
            <DialogHeader>
              <DialogTitle className="text-white">Delete User</DialogTitle>
              <DialogDescription className="text-white/60">
                Are you sure you want to delete {userToDelete?.firstName} {userToDelete?.lastName}? 
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setDeleteConfirmOpen(false)}
                className="border-white/20 text-white"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => userToDelete && deleteUserMutation.mutate(userToDelete.id)}
                disabled={deleteUserMutation.isPending}
                className="bg-[rgb(251,194,213)] hover:bg-[rgb(251,194,213)]/80 text-black"
              >
                {deleteUserMutation.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
