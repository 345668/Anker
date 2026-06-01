"use client"

import { useState } from "react"
import { 
  Search, Loader2, CheckCircle2, AlertCircle, 
  Building2, User, Globe, Mail, Link2, Copy,
  ChevronDown, ChevronUp, Sparkles
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { motion, AnimatePresence } from "framer-motion"

interface DeepResearchProps {
  isAdmin?: boolean
}

interface ResearchResult {
  success: boolean
  research: string
  researchType: string
  target: string
  error?: string
}

const RESEARCH_TYPES = [
  { 
    id: "investor_profile", 
    label: "Investor Profile", 
    description: "Deep research on an investor or firm",
    icon: User,
    placeholder: "Enter investor name or firm (e.g., Sequoia Capital, Marc Andreessen)",
    adminOnly: false
  },
  { 
    id: "company_research", 
    label: "Company Research", 
    description: "Research a startup or company",
    icon: Building2,
    placeholder: "Enter company name (e.g., Stripe, OpenAI)",
    adminOnly: false
  },
  { 
    id: "market_analysis", 
    label: "Market Analysis", 
    description: "Analyze a market or sector",
    icon: Globe,
    placeholder: "Enter market or sector (e.g., AI Infrastructure, Fintech)",
    adminOnly: false
  },
  { 
    id: "url_verification", 
    label: "URL Verification", 
    description: "Verify and extract data from URLs",
    icon: Link2,
    placeholder: "Enter URL to verify",
    adminOnly: true
  },
  { 
    id: "email_finder", 
    label: "Email Finder", 
    description: "Find contact information",
    icon: Mail,
    placeholder: "Enter name and company (e.g., John Smith at Acme Corp)",
    adminOnly: true
  },
]

export function DeepResearch({ isAdmin = false }: DeepResearchProps) {
  const [researchType, setResearchType] = useState("investor_profile")
  const [target, setTarget] = useState("")
  const [url, setUrl] = useState("")
  const [isResearching, setIsResearching] = useState(false)
  const [result, setResult] = useState<ResearchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  const availableTypes = RESEARCH_TYPES.filter(type => !type.adminOnly || isAdmin)
  const currentType = RESEARCH_TYPES.find(t => t.id === researchType)

  const handleResearch = async () => {
    if (!target.trim()) return

    setIsResearching(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/research/deep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          researchType,
          target: target.trim(),
          options: url ? { url } : undefined
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Research failed')
      }

      setResult(data)
      // Auto-expand first section
      const sections = parseResearch(data.research)
      if (sections.length > 0) {
        setExpandedSections({ [sections[0].title]: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Research failed')
    } finally {
      setIsResearching(false)
    }
  }

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const parseResearch = (text: string) => {
    const sections: { title: string; content: string }[] = []
    const lines = text.split('\n')
    let currentTitle = ''
    let currentContent: string[] = []

    lines.forEach(line => {
      if (line.match(/^#{1,3}\s/) || (line.startsWith('**') && line.endsWith('**'))) {
        if (currentTitle) {
          sections.push({ title: currentTitle, content: currentContent.join('\n').trim() })
        }
        currentTitle = line.replace(/^#{1,3}\s/, '').replace(/^\*\*/, '').replace(/\*\*$/, '').trim()
        currentContent = []
      } else {
        currentContent.push(line)
      }
    })

    if (currentTitle) {
      sections.push({ title: currentTitle, content: currentContent.join('\n').trim() })
    }

    return sections.length > 0 ? sections : [{ title: 'Research Results', content: text }]
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="space-y-6">
      {/* Research Type Selection */}
      <div>
        <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-4">
          Research Type
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {availableTypes.map(type => (
            <button
              key={type.id}
              onClick={() => {
                setResearchType(type.id)
                setTarget("")
                setResult(null)
              }}
              className={`p-4 border text-left transition-all ${
                researchType === type.id
                  ? 'border-foreground bg-foreground/5'
                  : 'border-foreground/10 hover:border-foreground/30'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <type.icon className="w-5 h-5" />
                <span className="font-medium text-sm">{type.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{type.description}</p>
              {type.adminOnly && (
                <span className="mt-2 inline-block px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded">
                  Admin
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Search Input */}
      <div>
        <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-4">
          Search Target
        </h3>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder={currentType?.placeholder}
              className="pl-10 h-12 border-foreground/20 bg-foreground/5"
              onKeyDown={e => e.key === 'Enter' && handleResearch()}
            />
          </div>
          
          {(researchType === 'investor_profile' || researchType === 'company_research') && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Website URL (optional, for more accurate results)
              </label>
              <Input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="border-foreground/20 bg-foreground/5"
              />
            </div>
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
              <p className="font-medium text-red-800">Research Failed</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Research Button */}
      <Button
        onClick={handleResearch}
        disabled={!target.trim() || isResearching}
        className="w-full bg-foreground text-background hover:bg-foreground/90 h-12"
      >
        {isResearching ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Researching with Mistral...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" />
            Start Research
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
                <div>
                  <span className="font-medium text-emerald-800">Research Complete</span>
                  <p className="text-xs text-emerald-700">{result.target}</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => copyToClipboard(result.research)}
                className="border-emerald-300 text-emerald-700"
              >
                <Copy className="w-4 h-4 mr-1" />
                Copy All
              </Button>
            </div>

            <div className="p-6 space-y-4 max-h-[600px] overflow-y-auto">
              {parseResearch(result.research).map((section, idx) => (
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
