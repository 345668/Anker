"use client"

import { useState } from "react"
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

interface SettingsContentProps {
  user: User
}

type SettingsTab = "account" | "company" | "ai" | "notifications" | "security" | "billing"

const tabs = [
  { id: "account" as const, label: "Account", icon: UserIcon },
  { id: "company" as const, label: "Company", icon: Building2 },
  { id: "ai" as const, label: "AI & API Keys", icon: Sparkles },
  { id: "notifications" as const, label: "Notifications", icon: Bell },
  { id: "security" as const, label: "Security", icon: Lock },
  { id: "billing" as const, label: "Billing", icon: CreditCard },
]

export function SettingsContent({ user }: SettingsContentProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("account")
  const firstName = user.user_metadata?.first_name || ""
  const lastName = user.user_metadata?.last_name || ""

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
            <div className="max-w-2xl space-y-8">
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
                      <Button variant="outline" size="sm" className="mt-2 border-foreground/20">
                        Change Avatar
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                        First Name
                      </label>
                      <Input 
                        defaultValue={firstName} 
                        className="border-foreground/20 bg-foreground/5 focus:bg-background"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                        Last Name
                      </label>
                      <Input 
                        defaultValue={lastName}
                        className="border-foreground/20 bg-foreground/5 focus:bg-background"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      Email Address
                    </label>
                    <Input 
                      defaultValue={user.email || ""} 
                      disabled 
                      className="border-foreground/10 bg-foreground/5 text-muted-foreground"
                    />
                    <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-foreground/10 pt-8">
                <div className="flex items-center gap-4 mb-6">
                  <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                    Preferences
                  </span>
                  <div className="flex-1 h-px bg-foreground/10" />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 border border-foreground/10">
                    <div className="flex items-center gap-3">
                      <Globe className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Language</p>
                        <p className="text-xs text-muted-foreground">English (US)</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">Change</Button>
                  </div>
                  <div className="flex items-center justify-between p-4 border border-foreground/10">
                    <div className="flex items-center gap-3">
                      <Globe className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Timezone</p>
                        <p className="text-xs text-muted-foreground">Pacific Time (PT)</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">Change</Button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6">
                <Button variant="outline" className="border-foreground/20">Cancel</Button>
                <Button className="bg-foreground text-background hover:bg-foreground/90">
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </div>
          )}

          {/* Company Tab */}
          {activeTab === "company" && (
            <div className="max-w-2xl space-y-8">
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                    Company Profile
                  </span>
                  <div className="flex-1 h-px bg-foreground/10" />
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      Company Name
                    </label>
                    <Input 
                      placeholder="Your company name"
                      className="border-foreground/20 bg-foreground/5 focus:bg-background"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      Website
                    </label>
                    <Input 
                      placeholder="https://yourcompany.com"
                      className="border-foreground/20 bg-foreground/5 focus:bg-background"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                        Industry
                      </label>
                      <Input 
                        placeholder="e.g., SaaS, Fintech"
                        className="border-foreground/20 bg-foreground/5 focus:bg-background"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                        Stage
                      </label>
                      <Input 
                        placeholder="e.g., Seed, Series A"
                        className="border-foreground/20 bg-foreground/5 focus:bg-background"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      One-liner
                    </label>
                    <Input 
                      placeholder="Describe your company in one sentence"
                      className="border-foreground/20 bg-foreground/5 focus:bg-background"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      Description
                    </label>
                    <textarea 
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
                      placeholder="e.g., $2,000,000"
                      className="border-foreground/20 bg-foreground/5 focus:bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      Current ARR
                    </label>
                    <Input 
                      placeholder="e.g., $500,000"
                      className="border-foreground/20 bg-foreground/5 focus:bg-background"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6">
                <Button variant="outline" className="border-foreground/20">Cancel</Button>
                <Button className="bg-foreground text-background hover:bg-foreground/90">
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </div>
          )}

          {/* AI & API Keys Tab */}
          {activeTab === "ai" && (
            <AISettingsTab />
          )}

          {/* Notifications Tab */}
          {activeTab === "notifications" && (
            <div className="max-w-2xl space-y-6">
              <div className="flex items-center gap-4 mb-6">
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                  Notification Preferences
                </span>
                <div className="flex-1 h-px bg-foreground/10" />
              </div>

              {[
                { title: "Email notifications", desc: "Receive updates via email", enabled: true },
                { title: "Investor matches", desc: "Get notified when new matches are found", enabled: true },
                { title: "Deal updates", desc: "Updates on your pipeline activity", enabled: true },
                { title: "Document activity", desc: "Know when documents are viewed", enabled: false },
                { title: "Weekly digest", desc: "Summary of your weekly activity", enabled: true },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-4 border border-foreground/10">
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch defaultChecked={item.enabled} />
                </div>
              ))}
            </div>
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

// AI Settings Tab Component
function AISettingsTab() {
  const [showOpenAIKey, setShowOpenAIKey] = useState(false)
  const [showAnthropicKey, setShowAnthropicKey] = useState(false)
  const [showMistralKey, setShowMistralKey] = useState(false)
  const [showSendGridKey, setShowSendGridKey] = useState(false)
  const [openAIKey, setOpenAIKey] = useState("")
  const [anthropicKey, setAnthropicKey] = useState("")
  const [mistralKey, setMistralKey] = useState("")
  const [sendGridKey, setSendGridKey] = useState("")
  const [senderEmail, setSenderEmail] = useState("")
  const [senderName, setSenderName] = useState("")
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    // In a real app, this would save to user settings in the database
    if (openAIKey) localStorage.setItem('anker_openai_key', openAIKey)
    if (anthropicKey) localStorage.setItem('anker_anthropic_key', anthropicKey)
    if (mistralKey) localStorage.setItem('anker_mistral_key', mistralKey)
    if (sendGridKey) localStorage.setItem('anker_sendgrid_key', sendGridKey)
    if (senderEmail) localStorage.setItem('anker_sender_email', senderEmail)
    if (senderName) localStorage.setItem('anker_sender_name', senderName)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
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
                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded">Configured</span>
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
                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded">Configured</span>
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
                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded">Configured</span>
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
                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded">Configured</span>
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
              <span className={`px-2 py-1 text-xs rounded ${openAIKey ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
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
                    Get AI feedback on your pitch deck
                  </p>
                </div>
              </div>
              <span className={`px-2 py-1 text-xs rounded ${openAIKey ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                {openAIKey ? 'Ready' : 'Requires OpenAI Key'}
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
              <span className={`px-2 py-1 text-xs rounded ${openAIKey || anthropicKey || mistralKey ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
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
              <span className={`px-2 py-1 text-xs rounded ${sendGridKey && senderEmail ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
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
        >
          <Save className="w-4 h-4 mr-2" />
          Save API Keys
        </Button>
      </div>
    </div>
  )
}
