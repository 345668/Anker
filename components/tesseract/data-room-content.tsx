"use client"

import type { User } from "@supabase/supabase-js"
import { 
  Folder, 
  Plus,
  Upload,
  FileText,
  Table,
  FileImage,
  File,
  MoreHorizontal,
  Eye,
  Download,
  Share2,
  Lock,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface DataRoomContentProps {
  user: User
}

const folders = [
  { 
    id: 1, 
    name: "Financial Documents", 
    files: 4, 
    lastUpdated: "2 days ago",
    icon: Table,
    color: "bg-green-50 text-green-600",
  },
  { 
    id: 2, 
    name: "Legal Documents", 
    files: 8, 
    lastUpdated: "1 week ago",
    icon: FileText,
    color: "bg-blue-50 text-blue-600",
  },
  { 
    id: 3, 
    name: "Product & Tech", 
    files: 12, 
    lastUpdated: "3 days ago",
    icon: File,
    color: "bg-purple-50 text-purple-600",
  },
  { 
    id: 4, 
    name: "Team & Culture", 
    files: 6, 
    lastUpdated: "2 weeks ago",
    icon: Users,
    color: "bg-amber-50 text-amber-600",
  },
]

const recentFiles = [
  { name: "Q4 2024 Financials.xlsx", type: "Spreadsheet", size: "1.2 MB", folder: "Financial Documents" },
  { name: "Cap Table.xlsx", type: "Spreadsheet", size: "456 KB", folder: "Financial Documents" },
  { name: "Privacy Policy.pdf", type: "PDF", size: "2.1 MB", folder: "Legal Documents" },
  { name: "Product Roadmap.pdf", type: "PDF", size: "3.4 MB", folder: "Product & Tech" },
]

export function DataRoomContent({ user }: DataRoomContentProps) {
  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Folder className="w-4 h-4 text-primary" />
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Secure Storage</span>
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Data Room
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="gap-2">
              <Share2 className="w-4 h-4" />
              Share Room
            </Button>
            <Button size="sm" className="gap-2">
              <Upload className="w-4 h-4" />
              Upload Files
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="px-8 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-card/50 border border-border/50 rounded-xl p-5">
            <p className="text-sm text-muted-foreground mb-1">Total Files</p>
            <p className="font-display text-2xl font-semibold">30</p>
          </div>
          <div className="bg-card/50 border border-border/50 rounded-xl p-5">
            <p className="text-sm text-muted-foreground mb-1">Storage Used</p>
            <p className="font-display text-2xl font-semibold">124 MB</p>
          </div>
          <div className="bg-card/50 border border-border/50 rounded-xl p-5">
            <p className="text-sm text-muted-foreground mb-1">Shared With</p>
            <p className="font-display text-2xl font-semibold">3 investors</p>
          </div>
          <div className="bg-card/50 border border-border/50 rounded-xl p-5">
            <p className="text-sm text-muted-foreground mb-1">Views This Week</p>
            <p className="font-display text-2xl font-semibold">12</p>
          </div>
        </div>

        {/* Folders */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold">Folders</h2>
            <Button variant="ghost" size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              New Folder
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {folders.map((folder) => (
              <div 
                key={folder.id}
                className="bg-card/50 border border-border/50 rounded-xl p-5 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-10 h-10 rounded-lg ${folder.color} flex items-center justify-center`}>
                    <folder.icon className="w-5 h-5" />
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </div>
                <h3 className="font-medium mb-1">{folder.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {folder.files} files • Updated {folder.lastUpdated}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent files */}
        <div className="bg-card/50 border border-border/50 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
            <h2 className="font-display font-semibold">Recent Files</h2>
            <Button variant="ghost" size="sm">View all</Button>
          </div>
          <div className="divide-y divide-border/50">
            {recentFiles.map((file, index) => (
              <div 
                key={index}
                className="px-6 py-4 hover:bg-muted/30 transition-colors cursor-pointer group flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <FileText className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-medium text-sm">{file.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {file.type} • {file.size} • {file.folder}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Security note */}
        <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl">
          <Lock className="w-5 h-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Your data room is encrypted and secure. Only investors you share access with can view your files.
          </p>
        </div>
      </div>
    </div>
  )
}
