"use client"

import { useState } from "react"
import type { User } from "@supabase/supabase-js"
import { 
  Settings,
  User as UserIcon,
  Bell,
  Lock,
  CreditCard,
  Building2,
  Mail,
  Globe,
  Shield,
  Key,
  Smartphone,
  Moon,
  Sun,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

interface SettingsContentProps {
  user: User
}

type SettingsTab = "account" | "notifications" | "security" | "billing"

const tabs = [
  { id: "account" as const, label: "Account", icon: UserIcon },
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
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="px-8 py-4">
          <div className="flex items-center gap-2 mb-1">
            <Settings className="w-4 h-4 text-muted-foreground" />
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Account</span>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Settings
          </h1>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar tabs */}
        <aside className="w-64 border-r border-border/50 p-4 min-h-[calc(100vh-80px)]">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {activeTab === tab.id && <ChevronRight className="w-4 h-4 ml-auto" />}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 p-8">
          {/* Account Tab */}
          {activeTab === "account" && (
            <div className="max-w-2xl space-y-8">
              <div>
                <h2 className="font-display text-lg font-semibold mb-6">Profile Information</h2>
                <div className="space-y-6">
                  <div className="flex items-center gap-6">
                    <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                      <span className="font-display text-2xl font-semibold">
                        {firstName.charAt(0)}{lastName.charAt(0) || user.email?.charAt(0)}
                      </span>
                    </div>
                    <Button variant="outline">Change Avatar</Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                        First Name
                      </label>
                      <Input defaultValue={firstName} />
                    </div>
                    <div className="space-y-2">
                      <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                        Last Name
                      </label>
                      <Input defaultValue={lastName} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      Email Address
                    </label>
                    <Input defaultValue={user.email || ""} disabled />
                    <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-border/50 pt-8">
                <h2 className="font-display text-lg font-semibold mb-6">Preferences</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-card/50 border border-border/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Moon className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Dark Mode</p>
                        <p className="text-xs text-muted-foreground">Toggle dark theme</p>
                      </div>
                    </div>
                    <Switch />
                  </div>
                  <div className="flex items-center justify-between p-4 bg-card/50 border border-border/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Globe className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Language</p>
                        <p className="text-xs text-muted-foreground">English (US)</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">Change</Button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-6">
                <Button variant="outline">Cancel</Button>
                <Button>Save Changes</Button>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === "notifications" && (
            <div className="max-w-2xl space-y-6">
              <h2 className="font-display text-lg font-semibold mb-6">Notification Preferences</h2>
              {[
                { title: "Email notifications", desc: "Receive updates via email", enabled: true },
                { title: "Investor matches", desc: "Get notified when new matches are found", enabled: true },
                { title: "Meeting reminders", desc: "Reminders before scheduled meetings", enabled: true },
                { title: "Deal room activity", desc: "Updates when documents are viewed", enabled: false },
                { title: "Weekly digest", desc: "Summary of your weekly activity", enabled: true },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-card/50 border border-border/50 rounded-lg">
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
                <h2 className="font-display text-lg font-semibold mb-6">Password</h2>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      Current Password
                    </label>
                    <Input type="password" />
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      New Password
                    </label>
                    <Input type="password" />
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      Confirm New Password
                    </label>
                    <Input type="password" />
                  </div>
                  <Button>Update Password</Button>
                </div>
              </div>

              <div className="border-t border-border/50 pt-8">
                <h2 className="font-display text-lg font-semibold mb-6">Two-Factor Authentication</h2>
                <div className="p-4 bg-card/50 border border-border/50 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Authenticator App</p>
                      <p className="text-xs text-muted-foreground">Not configured</p>
                    </div>
                  </div>
                  <Button variant="outline">Enable</Button>
                </div>
              </div>
            </div>
          )}

          {/* Billing Tab */}
          {activeTab === "billing" && (
            <div className="max-w-2xl space-y-8">
              <div>
                <h2 className="font-display text-lg font-semibold mb-6">Current Plan</h2>
                <div className="p-6 bg-foreground text-background rounded-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-background/60">Current Plan</span>
                      <h3 className="font-display text-xl font-semibold">Starter</h3>
                    </div>
                    <span className="px-3 py-1 bg-background/20 rounded-full text-sm font-medium">Free</span>
                  </div>
                  <p className="text-background/70 text-sm mb-6">
                    Upgrade to Pro for unlimited investor matches, priority support, and advanced analytics.
                  </p>
                  <Button className="bg-background text-foreground hover:bg-background/90">
                    Upgrade to Pro
                  </Button>
                </div>
              </div>

              <div className="border-t border-border/50 pt-8">
                <h2 className="font-display text-lg font-semibold mb-6">Payment Method</h2>
                <div className="p-4 bg-card/50 border border-border/50 rounded-lg text-center py-8">
                  <CreditCard className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No payment method added</p>
                  <Button variant="outline" className="mt-4">Add Payment Method</Button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
