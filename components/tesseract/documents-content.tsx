"use client"

import { useState } from "react"
import type { User } from "@supabase/supabase-js"
import { 
  FileStack,
  FileText,
  Folder,
  Upload,
  Plus,
  MoreHorizontal,
  Download,
  Trash2,
  Eye,
  Share2,
  Lock,
  Unlock,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronRight,
  FolderOpen,
  File,
  FileSpreadsheet,
  FileImage,
  Presentation,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface DocumentsContentProps {
  user: User
}

type ViewMode = "pitch-deck" | "data-room"

// Default folder structure for data room (users start with empty folders)
const defaultDataRoomFolders = [
  { id: "financials", name: "Financials", icon: FileSpreadsheet, count: 0, isLocked: false },
  { id: "legal", name: "Legal", icon: File, count: 0, isLocked: true },
  { id: "team", name: "Team", icon: FileImage, count: 0, isLocked: false },
  { id: "product", name: "Product", icon: Presentation, count: 0, isLocked: false },
  { id: "market", name: "Market Research", icon: FileText, count: 0, isLocked: false },
]

export function DocumentsContent({ user }: DocumentsContentProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("pitch-deck")
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b border-foreground/10">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileStack className="w-4 h-4 text-foreground" />
                <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                  Documents
                </span>
              </div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                {viewMode === "pitch-deck" ? "Pitch Decks" : "Data Room"}
              </h1>
            </div>
            
            <div className="flex items-center gap-3">
              <Button variant="outline" className="gap-2">
                <Upload className="w-4 h-4" />
                Upload
              </Button>
              {viewMode === "data-room" && (
                <Button variant="outline" className="gap-2">
                  <Plus className="w-4 h-4" />
                  New Folder
                </Button>
              )}
              {viewMode === "pitch-deck" && (
                <Button className="gap-2 bg-foreground text-background hover:bg-foreground/90">
                  <Sparkles className="w-4 h-4" />
                  AI Analysis
                </Button>
              )}
            </div>
          </div>

          {/* View Toggle */}
          <div className="flex p-1 bg-foreground/5 rounded-lg mt-6 w-fit">
            <button
              onClick={() => setViewMode("pitch-deck")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                viewMode === "pitch-deck"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Presentation className="w-4 h-4 inline-block mr-2" />
              Pitch Decks
            </button>
            <button
              onClick={() => setViewMode("data-room")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                viewMode === "data-room"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Folder className="w-4 h-4 inline-block mr-2" />
              Data Room
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="px-8 py-8">
        {viewMode === "pitch-deck" ? (
          <PitchDeckView />
        ) : (
          <DataRoomView 
            selectedFolder={selectedFolder}
            onSelectFolder={setSelectedFolder}
          />
        )}
      </div>
    </div>
  )
}

function PitchDeckView() {
  // In a real app, this would fetch from the database
  const pitchDecks: Array<{
    id: string
    name: string
    version: number
    status: string
    views: number
    lastViewed: string | null
    aiScore: number | null
    updatedAt: string
  }> = []

  return (
    <div className="space-y-8">
      {/* Upload Zone */}
      <div className="border-2 border-dashed border-foreground/20 rounded-xl p-8 text-center hover:border-foreground/40 transition-colors cursor-pointer">
        <div className="w-16 h-16 rounded-xl bg-foreground/5 flex items-center justify-center mx-auto mb-4">
          <Upload className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="font-display text-lg font-semibold mb-2">Upload Your Pitch Deck</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
          Drag & drop your PDF or click to browse. Our AI will analyze it and provide feedback.
        </p>
        <Button variant="outline">Choose File</Button>
      </div>

      {/* Existing Decks */}
      <div>
        <h2 className="font-display font-semibold mb-4">Your Pitch Decks</h2>
        {pitchDecks.length === 0 ? (
          <div className="border border-foreground/10 rounded-xl p-12 text-center">
            <Presentation className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="font-display text-lg font-semibold mb-2">No pitch decks yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Upload your first pitch deck to get AI-powered feedback and track investor views.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pitchDecks.map((deck) => (
              <div 
                key={deck.id}
                className="group bg-background border border-foreground/10 rounded-xl p-5 hover:border-foreground/20 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6 text-red-600" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate">{deck.name}</h3>
                      <span className="px-1.5 py-0.5 text-[10px] font-mono bg-foreground/5 rounded">
                        v{deck.version}
                      </span>
                      {deck.status === "active" ? (
                        <span className="px-1.5 py-0.5 text-[10px] font-mono bg-emerald-50 text-emerald-600 rounded flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Active
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-[10px] font-mono bg-amber-50 text-amber-600 rounded flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Draft
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Updated {deck.updatedAt}
                      {deck.views > 0 && ` · ${deck.views} views`}
                      {deck.lastViewed && ` · Last viewed ${deck.lastViewed}`}
                    </p>
                  </div>

                  {deck.aiScore && (
                    <div className="text-center px-4">
                      <div className="font-display text-xl font-semibold text-emerald-600">{deck.aiScore}</div>
                      <div className="font-mono text-[10px] text-muted-foreground uppercase">AI Score</div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Share2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Download className="w-4 h-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Run AI Analysis
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Share2 className="w-4 h-4 mr-2" />
                          Share Link
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DataRoomView({ 
  selectedFolder, 
  onSelectFolder 
}: { 
  selectedFolder: string | null
  onSelectFolder: (id: string | null) => void 
}) {
  // In a real app, files would be fetched from the database
  const files: Array<{
    id: string
    name: string
    folder: string
    uploadedAt: string
    size: string
  }> = []

  return (
    <div className="grid grid-cols-12 gap-8">
      {/* Folders Sidebar */}
      <div className="col-span-4">
        <h2 className="font-display font-semibold mb-4">Folders</h2>
        <div className="space-y-2">
          {defaultDataRoomFolders.map((folder) => {
            const isSelected = selectedFolder === folder.id
            return (
              <button
                key={folder.id}
                onClick={() => onSelectFolder(isSelected ? null : folder.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all ${
                  isSelected
                    ? "bg-foreground text-background"
                    : "hover:bg-foreground/5"
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isSelected ? "bg-background/20" : "bg-foreground/5"
                }`}>
                  {isSelected ? (
                    <FolderOpen className="w-5 h-5" />
                  ) : (
                    <folder.icon className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{folder.name}</span>
                    {folder.isLocked && (
                      <Lock className={`w-3 h-3 ${isSelected ? "text-background/60" : "text-amber-500"}`} />
                    )}
                  </div>
                  <span className={`text-sm ${isSelected ? "text-background/70" : "text-muted-foreground"}`}>
                    {folder.count} files
                  </span>
                </div>
                <ChevronRight className={`w-4 h-4 ${isSelected ? "" : "text-muted-foreground"}`} />
              </button>
            )
          })}
        </div>
      </div>

      {/* Files */}
      <div className="col-span-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold">
            {selectedFolder 
              ? defaultDataRoomFolders.find(f => f.id === selectedFolder)?.name 
              : "All Files"
            }
          </h2>
          <Button variant="outline" size="sm" className="gap-2">
            <Upload className="w-4 h-4" />
            Upload File
          </Button>
        </div>

        {files.length === 0 ? (
          <div className="border border-dashed border-foreground/20 rounded-xl p-12 text-center">
            <Folder className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="font-display text-lg font-semibold mb-2">No files yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Upload documents to your data room for investor due diligence.
            </p>
            <Button variant="outline" className="gap-2">
              <Upload className="w-4 h-4" />
              Upload Your First File
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file) => (
              <div 
                key={file.id}
                className="group flex items-center gap-4 p-4 bg-background border border-foreground/10 rounded-lg hover:border-foreground/20 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium truncate">{file.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {file.folder} · {file.uploadedAt} · {file.size}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
