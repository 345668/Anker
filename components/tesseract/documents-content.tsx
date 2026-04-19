"use client"

import { useState, useCallback, useTransition } from "react"
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
  Loader2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"

interface Document {
  id: string
  name: string
  blob_pathname: string
  content_type: string
  size: number
  type: string
  folder: string
  ai_score?: number
  ai_analysis_status?: string
  view_count?: number
  created_at: string
}

interface DocumentsContentProps {
  user: User
  documents?: Document[]
}

type ViewMode = "pitch-deck" | "data-room"

// Default folder structure for data room
const defaultDataRoomFolders = [
  { id: "financials", name: "Financials", icon: FileSpreadsheet, count: 0, isLocked: false },
  { id: "legal", name: "Legal", icon: File, count: 0, isLocked: true },
  { id: "team", name: "Team", icon: FileImage, count: 0, isLocked: false },
  { id: "product", name: "Product", icon: Presentation, count: 0, isLocked: false },
  { id: "market", name: "Market Research", icon: FileText, count: 0, isLocked: false },
]

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function timeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const days = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function DocumentsContent({ user, documents = [] }: DocumentsContentProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("pitch-deck")
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [uploadedDocs, setUploadedDocs] = useState<Document[]>(documents)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null)

  const pitchDecks = uploadedDocs.filter(d => d.type === 'pitch-deck')
  const dataRoomFiles = uploadedDocs.filter(d => d.type === 'data-room')

  const handleFileUpload = useCallback(async (files: FileList, type: ViewMode, folder?: string) => {
    if (files.length === 0) return

    setIsUploading(true)
    setUploadProgress(0)

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const formData = new FormData()
        formData.append('file', file)
        formData.append('type', type)
        if (folder) formData.append('folder', folder)

        const response = await fetch('/api/documents/upload', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Upload failed')
        }

        const result = await response.json()
        
        // Add to local state
        setUploadedDocs(prev => [...prev, {
          id: crypto.randomUUID(),
          name: result.name,
          blob_pathname: result.pathname,
          content_type: result.type,
          size: result.size,
          type: type,
          folder: folder || 'general',
          created_at: new Date().toISOString(),
        }])

        setUploadProgress(((i + 1) / files.length) * 100)
      }

      toast.success(`${files.length} file(s) uploaded successfully`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }, [])

  const handleDelete = useCallback(async (doc: Document) => {
    try {
      const response = await fetch('/api/documents/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathname: doc.blob_pathname }),
      })

      if (!response.ok) throw new Error('Delete failed')

      setUploadedDocs(prev => prev.filter(d => d.id !== doc.id))
      toast.success('Document deleted')
    } catch (error) {
      toast.error('Failed to delete document')
    }
  }, [])

  const handleAnalyze = useCallback(async (doc: Document) => {
    setIsAnalyzing(doc.id)
    
    try {
      const response = await fetch('/api/documents/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathname: doc.blob_pathname, documentId: doc.id }),
      })

      if (!response.ok) throw new Error('Analysis failed')

      // Update local state
      setUploadedDocs(prev => prev.map(d => 
        d.id === doc.id ? { ...d, ai_analysis_status: 'completed', ai_score: 85 } : d
      ))

      toast.success('Analysis complete!')
    } catch (error) {
      toast.error('Analysis failed')
    } finally {
      setIsAnalyzing(null)
    }
  }, [])

  // Calculate folder counts
  const foldersWithCounts = defaultDataRoomFolders.map(f => ({
    ...f,
    count: dataRoomFiles.filter(d => d.folder === f.id).length
  }))

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
              <label className="cursor-pointer">
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt,.csv"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) {
                      handleFileUpload(e.target.files, viewMode, selectedFolder || undefined)
                    }
                  }}
                  disabled={isUploading}
                />
                <Button variant="outline" className="gap-2" asChild>
                  <span>
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Upload
                      </>
                    )}
                  </span>
                </Button>
              </label>
              {viewMode === "data-room" && (
                <Button variant="outline" className="gap-2">
                  <Plus className="w-4 h-4" />
                  New Folder
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
              Pitch Decks ({pitchDecks.length})
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
              Data Room ({dataRoomFiles.length})
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="px-8 py-8">
        {viewMode === "pitch-deck" ? (
          <PitchDeckView 
            pitchDecks={pitchDecks}
            onUpload={(files) => handleFileUpload(files, 'pitch-deck')}
            onDelete={handleDelete}
            onAnalyze={handleAnalyze}
            isUploading={isUploading}
            isAnalyzing={isAnalyzing}
          />
        ) : (
          <DataRoomView 
            files={dataRoomFiles}
            folders={foldersWithCounts}
            selectedFolder={selectedFolder}
            onSelectFolder={setSelectedFolder}
            onUpload={(files, folder) => handleFileUpload(files, 'data-room', folder)}
            onDelete={handleDelete}
            isUploading={isUploading}
          />
        )}
      </div>
    </div>
  )
}

function PitchDeckView({ 
  pitchDecks, 
  onUpload, 
  onDelete, 
  onAnalyze,
  isUploading,
  isAnalyzing 
}: { 
  pitchDecks: Document[]
  onUpload: (files: FileList) => void
  onDelete: (doc: Document) => void
  onAnalyze: (doc: Document) => void
  isUploading: boolean
  isAnalyzing: string | null
}) {
  const [dragActive, setDragActive] = useState(false)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUpload(e.dataTransfer.files)
    }
  }, [onUpload])

  return (
    <div className="space-y-8">
      {/* Upload Zone */}
      <div 
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragActive 
            ? "border-foreground bg-foreground/5" 
            : "border-foreground/20 hover:border-foreground/40"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <label className="cursor-pointer block">
          <input
            type="file"
            className="hidden"
            accept=".pdf,.ppt,.pptx"
            onChange={(e) => e.target.files && onUpload(e.target.files)}
            disabled={isUploading}
          />
          <div className="w-16 h-16 rounded-xl bg-foreground/5 flex items-center justify-center mx-auto mb-4">
            {isUploading ? (
              <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
            ) : (
              <Upload className="w-8 h-8 text-muted-foreground" />
            )}
          </div>
          <h3 className="font-display text-lg font-semibold mb-2">
            {isUploading ? 'Uploading...' : 'Upload Your Pitch Deck'}
          </h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            Drag & drop your PDF or PowerPoint, or click to browse. Our AI will analyze it and provide feedback.
          </p>
          <Button variant="outline" disabled={isUploading}>
            {isUploading ? 'Uploading...' : 'Choose File'}
          </Button>
        </label>
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
                        {formatFileSize(deck.size)}
                      </span>
                      {deck.ai_analysis_status === 'completed' ? (
                        <span className="px-1.5 py-0.5 text-[10px] font-mono bg-emerald-50 text-emerald-600 rounded flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Analyzed
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-[10px] font-mono bg-amber-50 text-amber-600 rounded flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Pending
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Uploaded {timeAgo(deck.created_at)}
                      {deck.view_count && deck.view_count > 0 && ` · ${deck.view_count} views`}
                    </p>
                  </div>

                  {deck.ai_score && (
                    <div className="text-center px-4">
                      <div className="font-display text-xl font-semibold text-emerald-600">{deck.ai_score}</div>
                      <div className="font-mono text-[10px] text-muted-foreground uppercase">AI Score</div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => onAnalyze(deck)}
                      disabled={isAnalyzing === deck.id}
                    >
                      {isAnalyzing === deck.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => window.open(`/api/documents/file?pathname=${encodeURIComponent(deck.blob_pathname)}`, '_blank')}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Share2 className="w-4 h-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onAnalyze(deck)}>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Run AI Analysis
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Share2 className="w-4 h-4 mr-2" />
                          Share Link
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => window.open(`/api/documents/file?pathname=${encodeURIComponent(deck.blob_pathname)}`, '_blank')}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-red-600"
                          onClick={() => onDelete(deck)}
                        >
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
  files,
  folders,
  selectedFolder, 
  onSelectFolder,
  onUpload,
  onDelete,
  isUploading,
}: { 
  files: Document[]
  folders: typeof defaultDataRoomFolders
  selectedFolder: string | null
  onSelectFolder: (id: string | null) => void
  onUpload: (files: FileList, folder?: string) => void
  onDelete: (doc: Document) => void
  isUploading: boolean
}) {
  const filteredFiles = selectedFolder 
    ? files.filter(f => f.folder === selectedFolder)
    : files

  return (
    <div className="grid grid-cols-12 gap-8">
      {/* Folders Sidebar */}
      <div className="col-span-4">
        <h2 className="font-display font-semibold mb-4">Folders</h2>
        <div className="space-y-2">
          {folders.map((folder) => {
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
              ? folders.find(f => f.id === selectedFolder)?.name 
              : "All Files"
            }
          </h2>
          <label className="cursor-pointer">
            <input
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt,.csv"
              multiple
              onChange={(e) => {
                if (e.target.files) {
                  onUpload(e.target.files, selectedFolder || undefined)
                }
              }}
              disabled={isUploading}
            />
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <span>
                <Upload className="w-4 h-4" />
                Upload File
              </span>
            </Button>
          </label>
        </div>

        {filteredFiles.length === 0 ? (
          <div className="border border-dashed border-foreground/20 rounded-xl p-12 text-center">
            <Folder className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="font-display text-lg font-semibold mb-2">No files yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Upload documents to your data room for investor due diligence.
            </p>
            <label className="cursor-pointer">
              <input
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt,.csv"
                multiple
                onChange={(e) => {
                  if (e.target.files) {
                    onUpload(e.target.files, selectedFolder || undefined)
                  }
                }}
              />
              <Button variant="outline" className="gap-2" asChild>
                <span>
                  <Upload className="w-4 h-4" />
                  Upload Your First File
                </span>
              </Button>
            </label>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredFiles.map((file) => (
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
                    {folders.find(f => f.id === file.folder)?.name || file.folder} · {timeAgo(file.created_at)} · {formatFileSize(file.size)}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8"
                    onClick={() => window.open(`/api/documents/file?pathname=${encodeURIComponent(file.blob_pathname)}`, '_blank')}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8"
                    onClick={() => window.open(`/api/documents/file?pathname=${encodeURIComponent(file.blob_pathname)}`, '_blank')}
                  >
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
                        <Share2 className="w-4 h-4 mr-2" />
                        Share
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-red-600"
                        onClick={() => onDelete(file)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
