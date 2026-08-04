"use client"

import { useState, useEffect, useTransition } from "react"
import type { User } from "@supabase/supabase-js"
import { 
  User as UserIcon,
  Bell,
  Lock,
  CreditCard,
  Building2,
  Globe,
  Smartphone,
  ChevronRight,
  Save,
  LogOut,
  Sparkles,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  FileText,
  Mic,
  Target,
  Mail,
  Send,
  Loader2,
  Briefcase,
  DollarSign,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { 
  getUserSettings, 
  saveUserSettings, 
  saveApiKeys,
  type UserSettings 
} from "@/app/dashboard/settings/actions"

interface SettingsContentProps {
  user: User
}

const STAGES = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C", "Series D+", "Growth", "Late Stage"]
const SECTORS = ["SaaS", "Fintech", "Healthcare", "E-commerce", "AI/ML", "Climate Tech", "Consumer", "Enterprise", "Crypto/Web3", "Biotech"]
const FIRM_TYPES = ["Venture Capital", "Angel Group", "Family Office", "Corporate VC", "PE", "Accelerator"]
const INDUSTRIES = ["Technology", "Healthcare", "Financial Services", "Consumer", "Industrial", "Energy", "Real Estate", "Media", "Education"]

type SettingsTab = "account" | "company" | "ai" | "notifications" | "security" | "billing"

export function SettingsContent({ user }: SettingsContentProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("account")
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const firstName = user.user_metadata?.first_name || ""
  const lastName = user.user_metadata?.last_name || ""

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    const result = await getUserSettings()
    if (result.success && result.settings) {
      setSettings(result.settings)
    }
    setLoading(false)
  }

  const handleSaveSettings = async (data: Partial<UserSettings>) => {
    setSaving(true)
    const result = await saveUserSettings(data)
    if (result.success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      await loadSettings()
    }
    setSaving(false)
  }

  const isVC = settings?.user_type === 'vc'

  const tabs = [
    { id: "account" as const, label: "Account", icon: UserIcon },
    { id: "company" as const, label: isVC ? "Firm" : "Company", icon: isVC ? DollarSign : Building2 },
    { id: "ai" as const, label: "AI & API Keys", icon: Sparkles },
    { id: "notifications" as const, label: "Notifications", icon: Bell },
    { id: "security" as const, label: "Security", icon: Lock },
    { id: "billing" as const, label: "Billing", icon: CreditCard },
  ]

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-foreground/10">
        <div className="px-8 py-4">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-2">
            <span className="w-8 h-px bg-foreground/30" />
            Settings
          </span>
          <h1 className="font-display text-2xl tracking-tight">Account Settings</h1>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 border-r border-foreground/10 min-h-[calc(100vh-80px)]">
          <nav className="p-4 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {activeTab === tab.id && <ChevronRight className="w-4 h-4 ml-auto" />}
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-foreground/10">
            <button className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 p-8">
          {/* Account Tab */}
          {activeTab === "account" && (
            <AccountTab 
              user={user} 
              settings={settings} 
              onSave={handleSaveSettings}
              saving={saving}
              saved={saved}
            />
          )}

          {/* Company/Firm Tab */}
          {activeTab === "company" && (
            isVC ? (
              <FirmTab 
                settings={settings} 
                onSave={handleSaveSettings}
                saving={saving}
                saved={saved}
              />
            ) : (
              <CompanyTab 
                settings={settings} 
                onSave={handleSaveSettings}
                saving={saving}
                saved={saved}
              />
            )
          )}

          {/* AI & API Keys Tab */}
          {activeTab === "ai" && (
            <AISettingsTab 
              settings={settings}
              onSave={handleSaveSettings}
              saving={saving}
              saved={saved}
            />
          )}

          {/* Notifications Tab */}
          {activeTab === "notifications" && (
            <NotificationsTab 
              settings={settings}
              onSave={handleSaveSettings}
              saving={saving}
              saved={saved}
            />
          )}

          {/* Security Tab */}
          {activeTab === "security" && (
            <div className="max-w-2xl space-y-8">
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                    Password
                  </span>
                  <div className="flex-1 h-px bg-foreground/10" />
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      Current Password
                    </label>
                    <Input 
                      type="password"
                      className="border-foreground/20 bg-foreground/5 focus:bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      New Password
                    </label>
                    <Input 
                      type="password"
                      className="border-foreground/20 bg-foreground/5 focus:bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      Confirm New Password
                    </label>
                    <Input 
                      type="password"
                      className="border-foreground/20 bg-foreground/5 focus:bg-background"
                    />
                  </div>
                  <Button className="bg-foreground text-background hover:bg-foreground/90">
                    Update Password
                  </Button>
                </div>
              </div>

              <div className="border-t border-foreground/10 pt-8">
                <div className="flex items-center gap-4 mb-6">
                  <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                    Two-Factor Authentication
                  </span>
                  <div className="flex-1 h-px bg-foreground/10" />
                </div>

                <div className="p-4 border border-foreground/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Authenticator App</p>
                      <p className="text-xs text-muted-foreground">Not configured</p>
                    </div>
                  </div>
                  <Button variant="outline" className="border-foreground/20">Enable</Button>
                </div>
              </div>
            </div>
          )}

          {/* Billing Tab */}
          {activeTab === "billing" && (
            <div className="max-w-2xl space-y-8">
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                    Current Plan
                  </span>
                  <div className="flex-1 h-px bg-foreground/10" />
                </div>

                <div className="p-8 bg-foreground text-background">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-background/60">Current Plan</span>
                      <h3 className="font-display text-2xl">Starter</h3>
                    </div>
                    <span className="px-3 py-1 bg-background/20 text-sm font-mono">Free</span>
                  </div>
                  <p className="text-background/60 text-sm mb-6 leading-relaxed">
                    Upgrade to Pro for unlimited investor matches, priority support, and advanced analytics.
                  </p>
                  <Button className="bg-background text-foreground hover:bg-background/90 rounded-full">
                    Upgrade to Pro
                  </Button>
                </div>
              </div>

              <div className="border-t border-foreground/10 pt-8">
                <div className="flex items-center gap-4 mb-6">
                  <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                    Payment Method
                  </span>
                  <div className="flex-1 h-px bg-foreground/10" />
                </div>

                <div className="p-8 border border-foreground/10 text-center">
                  <CreditCard className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No payment method added</p>
                  <Button variant="outline" className="mt-4 border-foreground/20">
                    Add Payment Method
                  </Button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

// Types for tab components
interface TabProps {
  settings: UserSettings | null
  onSave: (data: Partial<UserSettings>) => void
  saving: boolean
  saved: boolean
}

// Account Tab Component
function AccountTab({ user, settings, onSave, saving, saved }: TabProps & { user: User }) {
  const [userType, setUserType] = useState<'founder' | 'vc'>(settings?.user_type || 'founder')
  const [senderName, setSenderName] = useState(settings?.sender_name || user.user_metadata?.full_name || "")
  const [senderEmail, setSenderEmail] = useState(settings?.sender_email || user.email || "")
  const firstName = user.user_metadata?.first_name || ""
  const lastName = user.user_metadata?.last_name || ""

  return (
    <div className="max-w-2xl space-y-8">
      {/* User Type Selection */}
      <div>
        <div className="flex items-center gap-4 mb-6">
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
            Account Type
          </span>
          <div className="flex-1 h-px bg-foreground/10" />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setUserType('founder')}
            className={`p-6 border-2 transition-all text-left ${
              userType === 'founder' 
                ? 'border-foreground bg-foreground/5' 
                : 'border-foreground/10 hover:border-foreground/30'
            }`}
          >
            <Briefcase className="w-8 h-8 mb-3" />
            <h4 className="font-semibold mb-1">Founder</h4>
            <p className="text-sm text-muted-foreground">
              Raising capital, managing investor relationships
            </p>
          </button>
          <button
            onClick={() => setUserType('vc')}
            className={`p-6 border-2 transition-all text-left ${
              userType === 'vc' 
                ? 'border-foreground bg-foreground/5' 
                : 'border-foreground/10 hover:border-foreground/30'
            }`}
          >
            <DollarSign className="w-8 h-8 mb-3" />
            <h4 className="font-semibold mb-1">Investor / VC</h4>
            <p className="text-sm text-muted-foreground">
              Sourcing deals, reviewing pitch decks
            </p>
          </button>
        </div>
      </div>

      {/* Profile Information */}
      <div>
        <div className="flex items-center gap-4 mb-6">
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
            Profile Information
          </span>
          <div className="flex-1 h-px bg-foreground/10" />
        </div>
        
        <div className="space-y-6">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-foreground/5 flex items-center justify-center">
              <span className="font-display text-2xl">
                {firstName.charAt(0)}{lastName.charAt(0) || user.email?.charAt(0)}
              </span>
            </div>
            <div>
              <p className="font-medium">{firstName} {lastName}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                Display Name
              </label>
              <Input 
                value={senderName}
                onChange={e => setSenderName(e.target.value)}
                className="border-foreground/20 bg-foreground/5 focus:bg-background"
              />
            </div>
            <div className="space-y-2">
              <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                Outreach Email
              </label>
              <Input 
                value={senderEmail}
                onChange={e => setSenderEmail(e.target.value)}
                className="border-foreground/20 bg-foreground/5 focus:bg-background"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" className="border-foreground/20">Cancel</Button>
        <Button 
          className="bg-foreground text-background hover:bg-foreground/90"
          onClick={() => onSave({ user_type: userType, sender_name: senderName, sender_email: senderEmail })}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {saved ? 'Saved!' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}

// Company Tab (for Founders)
function CompanyTab({ settings, onSave, saving, saved }: TabProps) {
  const [formData, setFormData] = useState({
    company_name: settings?.company_name || "",
    company_website: settings?.company_website || "",
    company_industry: settings?.company_industry || "",
    company_stage: settings?.company_stage || "",
    company_description: settings?.company_description || "",
    company_one_liner: settings?.company_one_liner || "",
    target_raise: settings?.target_raise || null,
    current_arr: settings?.current_arr || null,
  })

  const updateField = (field: string, value: string | number | null) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <div className="flex items-center gap-4 mb-6">
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
            Company Profile
          </span>
          <div className="flex-1 h-px bg-foreground/10" />
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                Company Name *
              </label>
              <Input 
                value={formData.company_name}
                onChange={e => updateField('company_name', e.target.value)}
                placeholder="Acme Inc."
                className="border-foreground/20 bg-foreground/5 focus:bg-background"
              />
            </div>
            <div className="space-y-2">
              <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                Website
              </label>
              <Input 
                value={formData.company_website}
                onChange={e => updateField('company_website', e.target.value)}
                placeholder="https://acme.com"
                className="border-foreground/20 bg-foreground/5 focus:bg-background"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                Industry *
              </label>
              <select
                value={formData.company_industry}
                onChange={e => updateField('company_industry', e.target.value)}
                className="w-full h-10 px-3 border border-foreground/20 bg-foreground/5 focus:bg-background text-sm"
              >
                <option value="">Select industry</option>
                {INDUSTRIES.map(ind => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                Stage *
              </label>
              <select
                value={formData.company_stage}
                onChange={e => updateField('company_stage', e.target.value)}
                className="w-full h-10 px-3 border border-foreground/20 bg-foreground/5 focus:bg-background text-sm"
              >
                <option value="">Select stage</option>
                {STAGES.map(stage => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              One-liner
            </label>
            <Input 
              value={formData.company_one_liner}
              onChange={e => updateField('company_one_liner', e.target.value)}
              placeholder="Describe your company in one sentence"
              className="border-foreground/20 bg-foreground/5 focus:bg-background"
            />
          </div>

          <div className="space-y-2">
            <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              Description
            </label>
            <textarea 
              value={formData.company_description}
              onChange={e => updateField('company_description', e.target.value)}
              placeholder="Tell us more about your company..."
              className="w-full h-32 p-3 border border-foreground/20 bg-foreground/5 focus:bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-foreground/20"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-foreground/10 pt-8">
        <div className="flex items-center gap-4 mb-6">
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
            Fundraising Details
          </span>
          <div className="flex-1 h-px bg-foreground/10" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              Target Raise
            </label>
            <Input 
              type="number"
              value={formData.target_raise || ""}
              onChange={e => updateField('target_raise', e.target.value ? parseInt(e.target.value) : null)}
              placeholder="2000000"
              className="border-foreground/20 bg-foreground/5 focus:bg-background"
            />
          </div>
          <div className="space-y-2">
            <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              Current ARR
            </label>
            <Input 
              type="number"
              value={formData.current_arr || ""}
              onChange={e => updateField('current_arr', e.target.value ? parseInt(e.target.value) : null)}
              placeholder="500000"
              className="border-foreground/20 bg-foreground/5 focus:bg-background"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" className="border-foreground/20">Cancel</Button>
        <Button 
          className="bg-foreground text-background hover:bg-foreground/90"
          onClick={() => onSave(formData)}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {saved ? 'Saved!' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}

// Firm Tab (for VCs)
function FirmTab({ settings, onSave, saving, saved }: TabProps) {
  const [formData, setFormData] = useState({
    firm_name: settings?.firm_name || "",
    firm_type: settings?.firm_type || "",
    firm_aum: settings?.firm_aum || null,
    investment_thesis: settings?.investment_thesis || "",
    preferred_stages: settings?.preferred_stages || [],
    preferred_sectors: settings?.preferred_sectors || [],
    check_size_min: settings?.check_size_min || null,
    check_size_max: settings?.check_size_max || null,
  })

  const updateField = (field: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const toggleArrayItem = (field: 'preferred_stages' | 'preferred_sectors', item: string) => {
    const arr = formData[field] || []
    if (arr.includes(item)) {
      updateField(field, arr.filter((i: string) => i !== item))
    } else {
      updateField(field, [...arr, item])
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <div className="flex items-center gap-4 mb-6">
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
            Firm Profile
          </span>
          <div className="flex-1 h-px bg-foreground/10" />
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                Firm Name *
              </label>
              <Input 
                value={formData.firm_name}
                onChange={e => updateField('firm_name', e.target.value)}
                placeholder="Acme Ventures"
                className="border-foreground/20 bg-foreground/5 focus:bg-background"
              />
            </div>
            <div className="space-y-2">
              <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                Firm Type *
              </label>
              <select
                value={formData.firm_type}
                onChange={e => updateField('firm_type', e.target.value)}
                className="w-full h-10 px-3 border border-foreground/20 bg-foreground/5 focus:bg-background text-sm"
              >
                <option value="">Select type</option>
                {FIRM_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              AUM (Assets Under Management)
            </label>
            <Input 
              type="number"
              value={formData.firm_aum || ""}
              onChange={e => updateField('firm_aum', e.target.value ? parseInt(e.target.value) : null)}
              placeholder="100000000"
              className="border-foreground/20 bg-foreground/5 focus:bg-background"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-foreground/10 pt-8">
        <div className="flex items-center gap-4 mb-6">
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
            Investment Focus
          </span>
          <div className="flex-1 h-px bg-foreground/10" />
        </div>

        <div className="space-y-6">
          <div>
            <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-3 block">
              Preferred Stages
            </label>
            <div className="flex flex-wrap gap-2">
              {STAGES.map(stage => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => toggleArrayItem('preferred_stages', stage)}
                  className={`px-3 py-1.5 text-sm transition-all ${
                    formData.preferred_stages?.includes(stage)
                      ? 'bg-foreground text-background'
                      : 'bg-foreground/10 hover:bg-foreground/20'
                  }`}
                >
                  {stage}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-3 block">
              Preferred Sectors
            </label>
            <div className="flex flex-wrap gap-2">
              {SECTORS.map(sector => (
                <button
                  key={sector}
                  type="button"
                  onClick={() => toggleArrayItem('preferred_sectors', sector)}
                  className={`px-3 py-1.5 text-sm transition-all ${
                    formData.preferred_sectors?.includes(sector)
                      ? 'bg-foreground text-background'
                      : 'bg-foreground/10 hover:bg-foreground/20'
                  }`}
                >
                  {sector}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                Min Check Size
              </label>
              <Input 
                type="number"
                value={formData.check_size_min || ""}
                onChange={e => updateField('check_size_min', e.target.value ? parseInt(e.target.value) : null)}
                placeholder="100000"
                className="border-foreground/20 bg-foreground/5 focus:bg-background"
              />
            </div>
            <div className="space-y-2">
              <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                Max Check Size
              </label>
              <Input 
                type="number"
                value={formData.check_size_max || ""}
                onChange={e => updateField('check_size_max', e.target.value ? parseInt(e.target.value) : null)}
                placeholder="5000000"
                className="border-foreground/20 bg-foreground/5 focus:bg-background"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              Investment Thesis
            </label>
            <textarea 
              value={formData.investment_thesis}
              onChange={e => updateField('investment_thesis', e.target.value)}
              placeholder="Describe your investment thesis..."
              className="w-full h-32 p-3 border border-foreground/20 bg-foreground/5 focus:bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-foreground/20"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" className="border-foreground/20">Cancel</Button>
        <Button 
          className="bg-foreground text-background hover:bg-foreground/90"
          onClick={() => onSave(formData)}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {saved ? 'Saved!' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}

// Notifications Tab
function NotificationsTab({ settings, onSave, saving, saved }: TabProps) {
  const [prefs, setPrefs] = useState({
    notification_email: settings?.notification_email ?? true,
    notification_matches: settings?.notification_matches ?? true,
    notification_deals: settings?.notification_deals ?? true,
    notification_documents: settings?.notification_documents ?? false,
    notification_weekly: settings?.notification_weekly ?? true,
  })

  const notifications = [
    { key: "notification_email", title: "Email notifications", desc: "Receive updates via email" },
    { key: "notification_matches", title: "Investor matches", desc: "Get notified when new matches are found" },
    { key: "notification_deals", title: "Deal updates", desc: "Updates on your pipeline activity" },
    { key: "notification_documents", title: "Document activity", desc: "Know when documents are viewed" },
    { key: "notification_weekly", title: "Weekly digest", desc: "Summary of your weekly activity" },
  ]

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
          Notification Preferences
        </span>
        <div className="flex-1 h-px bg-foreground/10" />
      </div>

      {notifications.map((item) => (
        <div key={item.key} className="flex items-center justify-between p-4 border border-foreground/10">
          <div>
            <p className="text-sm font-medium">{item.title}</p>
            <p className="text-xs text-muted-foreground">{item.desc}</p>
          </div>
          <Switch 
            checked={prefs[item.key as keyof typeof prefs]}
            onCheckedChange={(checked) => setPrefs(prev => ({ ...prev, [item.key]: checked }))}
          />
        </div>
      ))}

      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" className="border-foreground/20">Cancel</Button>
        <Button 
          className="bg-foreground text-background hover:bg-foreground/90"
          onClick={() => onSave(prefs)}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {saved ? 'Saved!' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}

// AI Settings Tab Component
function AISettingsTab({ settings, onSave, saving, saved }: TabProps) {
  const [showOpenAIKey, setShowOpenAIKey] = useState(false)
  const [showAnthropicKey, setShowAnthropicKey] = useState(false)
  const [showMistralKey, setShowMistralKey] = useState(false)
  const [showSendGridKey, setShowSendGridKey] = useState(false)
  const [openAIKey, setOpenAIKey] = useState(settings?.openai_api_key || "")
  const [anthropicKey, setAnthropicKey] = useState(settings?.anthropic_api_key || "")
  const [mistralKey, setMistralKey] = useState(settings?.mistral_api_key || "")
  const [sendGridKey, setSendGridKey] = useState(settings?.sendgrid_api_key || "")
  const [senderEmail, setSenderEmail] = useState(settings?.sender_email || "")
  const [senderName, setSenderName] = useState(settings?.sender_name || "")

  const handleSave = () => {
    onSave({
      openai_api_key: openAIKey || null,
      anthropic_api_key: anthropicKey || null,
      mistral_api_key: mistralKey || null,
      sendgrid_api_key: sendGridKey || null,
      sender_email: senderEmail || null,
      sender_name: senderName || null,
    })
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* API Keys Section */}
      <div>
        <div className="flex items-center gap-4 mb-6">
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
            API Keys
          </span>
          <div className="flex-1 h-px bg-foreground/10" />
        </div>

        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Bring Your Own Keys</p>
              <p className="text-xs text-amber-700 mt-1">
                Add your own API keys to use AI features like investor matching, pitch deck analysis, and AI interview prep. 
                Your keys are stored securely and never shared.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* OpenAI API Key */}
          <div className="p-6 border border-foreground/10 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-medium">OpenAI API Key</p>
                  <p className="text-xs text-muted-foreground">For GPT-4 powered matching & analysis</p>
                </div>
              </div>
              {openAIKey && (
                <span className="px-2 py-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs rounded">Configured</span>
              )}
            </div>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type={showOpenAIKey ? "text" : "password"}
                placeholder="sk-..."
                value={openAIKey}
                onChange={(e) => setOpenAIKey(e.target.value)}
                className="pl-10 pr-10 border-foreground/20 bg-foreground/5"
              />
              <button
                type="button"
                onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showOpenAIKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">OpenAI Dashboard</a>
            </p>
          </div>

          {/* Anthropic API Key */}
          <div className="p-6 border border-foreground/10 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="font-medium">Anthropic API Key</p>
                  <p className="text-xs text-muted-foreground">For Claude powered features</p>
                </div>
              </div>
              {anthropicKey && (
                <span className="px-2 py-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs rounded">Configured</span>
              )}
            </div>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type={showAnthropicKey ? "text" : "password"}
                placeholder="sk-ant-..."
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                className="pl-10 pr-10 border-foreground/20 bg-foreground/5"
              />
              <button
                type="button"
                onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showAnthropicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Get your API key from <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="underline">Anthropic Console</a>
            </p>
          </div>

          {/* Mistral API Key */}
          <div className="p-6 border border-foreground/10 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium">Mistral API Key</p>
                  <p className="text-xs text-muted-foreground">For Mistral AI powered features</p>
                </div>
              </div>
              {mistralKey && (
                <span className="px-2 py-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs rounded">Configured</span>
              )}
            </div>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type={showMistralKey ? "text" : "password"}
                placeholder="Enter your Mistral API key..."
                value={mistralKey}
                onChange={(e) => setMistralKey(e.target.value)}
                className="pl-10 pr-10 border-foreground/20 bg-foreground/5"
              />
              <button
                type="button"
                onClick={() => setShowMistralKey(!showMistralKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showMistralKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Get your API key from <a href="https://console.mistral.ai/api-keys" target="_blank" rel="noopener noreferrer" className="underline">Mistral Console</a>
            </p>
          </div>
        </div>
      </div>

      {/* Email Outreach Section */}
      <div className="border-t border-foreground/10 pt-8">
        <div className="flex items-center gap-4 mb-6">
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
            Email Outreach
          </span>
          <div className="flex-1 h-px bg-foreground/10" />
        </div>

        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-6">
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-800">SendGrid Email Integration</p>
              <p className="text-xs text-blue-700 mt-1">
                Connect your SendGrid account to send personalized outreach emails to investors directly from the platform.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* SendGrid API Key */}
          <div className="p-6 border border-foreground/10 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center">
                  <Mail className="w-5 h-5 text-cyan-600" />
                </div>
                <div>
                  <p className="font-medium">SendGrid API Key</p>
                  <p className="text-xs text-muted-foreground">For sending outreach emails</p>
                </div>
              </div>
              {sendGridKey && (
                <span className="px-2 py-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs rounded">Configured</span>
              )}
            </div>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type={showSendGridKey ? "text" : "password"}
                placeholder="SG...."
                value={sendGridKey}
                onChange={(e) => setSendGridKey(e.target.value)}
                className="pl-10 pr-10 border-foreground/20 bg-foreground/5"
              />
              <button
                type="button"
                onClick={() => setShowSendGridKey(!showSendGridKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showSendGridKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Get your API key from <a href="https://app.sendgrid.com/settings/api_keys" target="_blank" rel="noopener noreferrer" className="underline">SendGrid Dashboard</a>
            </p>
          </div>

          {/* Sender Details */}
          <div className="p-6 border border-foreground/10 rounded-lg">
            <h4 className="font-medium mb-4">Sender Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                  Sender Name
                </label>
                <Input
                  placeholder="Your Name"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  className="border-foreground/20 bg-foreground/5"
                />
              </div>
              <div className="space-y-2">
                <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                  Sender Email
                </label>
                <Input
                  placeholder="you@company.com"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  className="border-foreground/20 bg-foreground/5"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              This email must be verified in your SendGrid account as a sender identity.
            </p>
          </div>
        </div>
      </div>

      {/* AI Features Section */}
      <div className="border-t border-foreground/10 pt-8">
        <div className="flex items-center gap-4 mb-6">
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
            AI Features
          </span>
          <div className="flex-1 h-px bg-foreground/10" />
        </div>

        <div className="space-y-4">
          {/* Investor Matching */}
          <div className="p-4 border border-foreground/10 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Target className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium">AI Investor Matching</p>
                  <p className="text-xs text-muted-foreground">
                    Match your startup with investors using AI analysis
                  </p>
                </div>
              </div>
              <span className={`px-2 py-1 text-xs rounded ${openAIKey ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                {openAIKey ? 'Ready' : 'Requires OpenAI Key'}
              </span>
            </div>
          </div>

          {/* Pitch Deck Analysis */}
          <div className="p-4 border border-foreground/10 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="text-sm font-medium">Pitch Deck Analysis</p>
                  <p className="text-xs text-muted-foreground">
                    Get AI feedback on your pitch deck (powered by Claude)
                  </p>
                </div>
              </div>
              <span className={`px-2 py-1 text-xs rounded ${anthropicKey ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                {anthropicKey ? 'Ready' : 'Requires Anthropic Key'}
              </span>
            </div>
          </div>

          {/* Deep Research */}
          <div className="p-4 border border-foreground/10 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Target className="w-5 h-5 text-indigo-600" />
                <div>
                  <p className="text-sm font-medium">Deep Research</p>
                  <p className="text-xs text-muted-foreground">
                    Research investors and companies (powered by Mistral)
                  </p>
                </div>
              </div>
              <span className={`px-2 py-1 text-xs rounded ${mistralKey ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                {mistralKey ? 'Ready' : 'Requires Mistral Key'}
              </span>
            </div>
          </div>

          {/* AI Interview */}
          <div className="p-4 border border-foreground/10 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mic className="w-5 h-5 text-amber-600" />
                <div>
                  <p className="text-sm font-medium">AI Interview Prep</p>
                  <p className="text-xs text-muted-foreground">
                    Practice investor Q&A with AI simulation
                  </p>
                </div>
              </div>
              <span className={`px-2 py-1 text-xs rounded ${openAIKey || anthropicKey || mistralKey ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                {openAIKey || anthropicKey || mistralKey ? 'Ready' : 'Requires API Key'}
              </span>
            </div>
          </div>

          {/* Email Outreach */}
          <div className="p-4 border border-foreground/10 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Send className="w-5 h-5 text-cyan-600" />
                <div>
                  <p className="text-sm font-medium">Email Outreach</p>
                  <p className="text-xs text-muted-foreground">
                    Send personalized emails to investors
                  </p>
                </div>
              </div>
              <span className={`px-2 py-1 text-xs rounded ${sendGridKey && senderEmail ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                {sendGridKey && senderEmail ? 'Ready' : 'Requires SendGrid Setup'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-end gap-3 pt-6">
        {saved && (
          <span className="flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="w-4 h-4" />
            Settings saved!
          </span>
        )}
        <Button variant="outline" className="border-foreground/20">Cancel</Button>
        <Button 
          className="bg-foreground text-background hover:bg-foreground/90"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {saved ? 'Saved!' : 'Save API Keys'}
        </Button>
      </div>
    </div>
  )
}
