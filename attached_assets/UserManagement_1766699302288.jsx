import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Users, Search, Loader2, Mail, Shield, MoreHorizontal,
  UserCheck, UserX
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { format } from 'date-fns';

const roles = ['All', 'founder', 'investor', 'lead', 'admin'];

export default function UserManagement() {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');

  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list('-created_date', 500),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.User.update(id, data),
    onSuccess: () => queryClient.invalidateQueries(['users']),
  });

  const filteredUsers = users.filter(user => {
    if (roleFilter !== 'All' && user.user_role !== roleFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!user.full_name?.toLowerCase().includes(query) &&
          !user.email?.toLowerCase().includes(query)) {
        return false;
      }
    }
    return true;
  });

  const roleColors = {
    founder: 'bg-blue-100 text-blue-700',
    investor: 'bg-emerald-100 text-emerald-700',
    lead: 'bg-amber-100 text-amber-700',
    admin: 'bg-red-100 text-red-700',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-slate-500 mt-1">{users.length} users registered</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            {roles.map((role) => (
              <SelectItem key={role} value={role}>
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-slate-900">
            {users.filter(u => u.user_role === 'founder').length}
          </p>
          <p className="text-sm text-slate-500">Founders</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-slate-900">
            {users.filter(u => u.user_role === 'investor').length}
          </p>
          <p className="text-sm text-slate-500">Investors</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-slate-900">
            {users.filter(u => u.user_role === 'lead').length}
          </p>
          <p className="text-sm text-slate-500">Lead Managers</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-2xl font-bold text-slate-900">
            {users.filter(u => u.user_role === 'admin').length}
          </p>
          <p className="text-sm text-slate-500">Admins</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.id} className="group">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.profile_image} />
                      <AvatarFallback className="bg-indigo-100 text-indigo-700">
                        {user.full_name?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-slate-900">{user.full_name}</p>
                      <p className="text-sm text-slate-500">{user.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={cn("capitalize", roleColors[user.user_role])}>
                    {user.user_role || 'founder'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-slate-700">
                    {user.company_name || '—'}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className={user.onboarding_completed ? 'border-emerald-300 text-emerald-700' : 'border-amber-300 text-amber-700'}
                  >
                    {user.onboarding_completed ? 'Active' : 'Onboarding'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-slate-500">
                    {user.created_date ? format(new Date(user.created_date), 'MMM d, yyyy') : '—'}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <a href={`mailto:${user.email}`}>
                          <Mail className="w-4 h-4 mr-2" />
                          Send Email
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => updateMutation.mutate({ 
                          id: user.id, 
                          data: { user_role: 'lead' } 
                        })}
                      >
                        <UserCheck className="w-4 h-4 mr-2" />
                        Make Lead
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => updateMutation.mutate({ 
                          id: user.id, 
                          data: { user_role: 'admin' } 
                        })}
                      >
                        <Shield className="w-4 h-4 mr-2" />
                        Make Admin
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}