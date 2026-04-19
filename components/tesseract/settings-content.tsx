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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

interface SettingsContentProps {
  user: User
}

type SettingsTab = "account" | "company" | "notifications" | "security" | "billing"

const tabs = [
  { id: "account" as const, label: "Account", icon: UserIcon },
  { id: "company" as const, label: "Company", icon: Building2 },
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
