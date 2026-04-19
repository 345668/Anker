"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { 
  FileText, Upload, Loader2, CheckCircle2, AlertCircle, 
  Download, Eye, Sparkles, BarChart3, Users, Target, 
  TrendingUp, Shield, ChevronDown, ChevronUp
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"

interface PitchDeckAnalyzerProps {
  onAnalysisComplete?: (analysis: AnalysisResult) => void
  userType?: 'founder' | 'vc'
}

interface AnalysisResult {
  success: boolean
  analysis: string
  reportPath?: string
  analysisType: string
  error?: string
}

const ANALYSIS_TYPES = [
  { 
    id: "comprehensive", 
    label: "Comprehensive Analysis", 
    description: "Full VC-style analysis with scoring",
    icon: BarChart3,
    color: "text-blue-600 bg-blue-100"
  },
  { 
    id: "founder", 
    label: "Founder Feedback", 
    description: "Constructive feedback to improve your deck",
    icon: Users,
    color: "text-emerald-600 bg-emerald-100"
  },
  { 
    id: "vc_diligence", 
    label: "VC Due Diligence", 
    description: "Investment decision framework",
    icon: Target,
    color: "text-purple-600 bg-purple-100"
  },
  { 
    id: "quick_score", 
    label: "Quick Score", 
    description: "Fast scoring on key criteria",
    icon: TrendingUp,
    color: "text-amber-600 bg-amber-100"
  },
]

export function PitchDeckAnalyzer({ onAnalysisComplete, userType = 'founder' }: PitchDeckAnalyzerProps) {
  const [file, setFile] = useState<File | null>(null)
  const [analysisType, setAnalysisType] = useState(userType === 'vc' ? 'vc_diligence' : 'comprehensive')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0])
      setResult(null)
      setError(null)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
    },
    maxFiles: 1,
    maxSize: 25 * 1024 * 1024, // 25MB
  })

  const handleAnalyze = async () => {
    if (!file) return

    setIsAnalyzing(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('analysisType', analysisType)

      const response = await fetch('/api/analyze/pitch-deck', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Analysis failed')
      }

      setResult(data)
      onAnalysisComplete?.(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const parseAnalysis = (text: string) => {
    // Parse markdown-style headers into sections
    const sections: { title: string; content: string }[] = []
    const lines = text.split('\n')
    let currentTitle = ''
    let currentContent: string[] = []

    lines.forEach(line => {
      if (line.startsWith('## ') || line.startsWith('**') && line.endsWith('**')) {
        if (currentTitle) {
          sections.push({ title: currentTitle, content: currentContent.join('\n').trim() })
        }
        currentTitle = line.replace(/^## /, '').replace(/^\*\*/, '').replace(/\*\*$/, '').trim()
        currentContent = []
      } else {
        currentContent.push(line)
      }
    })

    if (currentTitle) {
      sections.push({ title: currentTitle, content: currentContent.join('\n').trim() })
    }

    return sections.length > 0 ? sections : [{ title: 'Analysis', content: text }]
  }

  return (
    <div className="space-y-6">
      {/* Analysis Type Selection */}
      <div>
        <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-4">
          Analysis Type
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {ANALYSIS_TYPES.map(type => (
            <button
              key={type.id}
              onClick={() => setAnalysisType(type.id)}
              className={`p-4 border text-left transition-all ${
                analysisType === type.id
                  ? 'border-foreground bg-foreground/5'
                  : 'border-foreground/10 hover:border-foreground/30'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${type.color}`}>
                  <type.icon className="w-4 h-4" />
                </div>
                <span className="font-medium text-sm">{type.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{type.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* File Upload */}
      <div>
        <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-4">
          Upload Pitch Deck
        </h3>
        <div
          {...getRootProps()}
          className={`border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
            isDragActive
              ? 'border-foreground bg-foreground/5'
              : file
              ? 'border-emerald-500 bg-emerald-50'
              : 'border-foreground/20 hover:border-foreground/40'
          }`}
        >
          <input {...getInputProps()} />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileText className="w-8 h-8 text-emerald-600" />
              <div className="text-left">
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
          ) : (
            <>
              <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium mb-1">
                {isDragActive ? 'Drop your pitch deck here' : 'Drag & drop your pitch deck'}
              </p>
              <p className="text-sm text-muted-foreground">
                Supports PDF, PPT, PPTX up to 25MB
              </p>
            </>
          )}
        </div>
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
              <p className="font-medium text-red-800">Analysis Failed</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Analyze Button */}
      <Button
        onClick={handleAnalyze}
        disabled={!file || isAnalyzing}
        className="w-full bg-foreground text-background hover:bg-foreground/90 h-12"
      >
        {isAnalyzing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Analyzing with Claude...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" />
            Analyze Pitch Deck
          </>
        )}
      </Button>

      {/* Results */}
      <AnimatePresence>
        {result?.success && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="border border-foreground/10 rounded-lg overflow-hidden"
          >
            <div className="p-4 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="font-medium text-emerald-800">Analysis Complete</span>
              </div>
              <div className="flex items-center gap-2">
                {result.reportPath && (
                  <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-700">
                    <Download className="w-4 h-4 mr-1" />
                    Download Report
                  </Button>
                )}
              </div>
            </div>

            <div className="p-6 space-y-4 max-h-[600px] overflow-y-auto">
              {parseAnalysis(result.analysis).map((section, idx) => (
                <div key={idx} className="border border-foreground/10 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="w-full p-4 flex items-center justify-between bg-foreground/5 hover:bg-foreground/10 transition-colors"
                  >
                    <span className="font-medium">{section.title}</span>
                    {expandedSections[section.title] ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                  <AnimatePresence>
                    {expandedSections[section.title] && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-4 text-sm leading-relaxed whitespace-pre-wrap">
                          {section.content}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
