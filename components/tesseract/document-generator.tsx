"use client"

import { useState } from "react"
import { 
  FileText, Loader2, CheckCircle2, AlertCircle, 
  Download, Eye, Sparkles, ScrollText, ClipboardList,
  FileCheck, Building2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"

interface DocumentGeneratorProps {
  userType?: 'founder' | 'vc'
  onDocumentGenerated?: (doc: GeneratedDocument) => void
}

interface GeneratedDocument {
  success: boolean
  document?: {
    id: string
    name: string
    file_path: string
  }
  url?: string
  filename?: string
  error?: string
}

const DOCUMENT_TYPES = {
  founder: [
    { 
      id: "executive_summary", 
      label: "Executive Summary", 
      description: "1-2 page overview for investors",
      icon: FileText,
      color: "text-blue-600 bg-blue-100"
    },
    { 
      id: "company_overview", 
      label: "Company Overview", 
      description: "Detailed company profile",
      icon: Building2,
      color: "text-emerald-600 bg-emerald-100"
    },
    { 
      id: "investment_memo", 
      label: "Investment Memo", 
      description: "VC-style investment analysis",
      icon: ScrollText,
      color: "text-purple-600 bg-purple-100"
    },
  ],
  vc: [
    { 
      id: "investment_memo", 
      label: "Investment Memo", 
      description: "Internal deal analysis",
      icon: ScrollText,
      color: "text-purple-600 bg-purple-100"
    },
    { 
      id: "due_diligence_checklist", 
      label: "DD Checklist", 
      description: "Comprehensive due diligence",
      icon: ClipboardList,
      color: "text-amber-600 bg-amber-100"
    },
    { 
      id: "term_sheet_template", 
      label: "Term Sheet", 
      description: "Standard term sheet template",
      icon: FileCheck,
      color: "text-cyan-600 bg-cyan-100"
    },
  ]
}

export function DocumentGenerator({ userType = 'founder', onDocumentGenerated }: DocumentGeneratorProps) {
  const [selectedType, setSelectedType] = useState(
    userType === 'vc' ? 'investment_memo' : 'executive_summary'
  )
  const [additionalContext, setAdditionalContext] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<GeneratedDocument | null>(null)
  const [error, setError] = useState<string | null>(null)

  const documentTypes = DOCUMENT_TYPES[userType]

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/documents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentType: selectedType,
          context: { additionalContext }
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      setResult(data)
      onDocumentGenerated?.(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Document Type Selection */}
      <div>
        <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-4">
          Document Type
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {documentTypes.map(type => (
            <button
              key={type.id}
              onClick={() => setSelectedType(type.id)}
              className={`p-4 border text-left transition-all ${
                selectedType === type.id
                  ? 'border-foreground bg-foreground/5'
                  : 'border-foreground/10 hover:border-foreground/30'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${type.color}`}>
                  <type.icon className="w-4 h-4" />
                </div>
              </div>
              <span className="font-medium text-sm block">{type.label}</span>
              <p className="text-xs text-muted-foreground mt-1">{type.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Additional Context */}
      <div>
        <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-4">
          Additional Context (Optional)
        </h3>
        <textarea
          value={additionalContext}
          onChange={e => setAdditionalContext(e.target.value)}
          placeholder="Add any additional information you'd like included in the document..."
          className="w-full h-24 p-3 border border-foreground/20 bg-foreground/5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-foreground/20"
        />
        <p className="text-xs text-muted-foreground mt-2">
          The document will be generated using your profile information from Settings.
        </p>
      </div>

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">Generation Failed</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="w-full bg-foreground text-background hover:bg-foreground/90 h-12"
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Generating with Claude...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" />
            Generate Document
          </>
        )}
      </Button>

      {/* Success Result */}
      <AnimatePresence>
        {result?.success && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="border border-emerald-200 bg-emerald-50 rounded-lg p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              <div>
                <p className="font-medium text-emerald-800">Document Generated!</p>
                <p className="text-sm text-emerald-700">{result.filename}</p>
              </div>
            </div>
            
            <div className="flex gap-3">
              {result.url && (
                <>
                  <Button
                    variant="outline"
                    className="flex-1 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                    onClick={() => window.open(result.url, '_blank')}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View Document
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                    asChild
                  >
                    <a href={result.url} download={result.filename}>
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </a>
                  </Button>
                </>
              )}
            </div>
            
            <p className="text-xs text-emerald-700 mt-4">
              Document has been saved to your Data Room.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
