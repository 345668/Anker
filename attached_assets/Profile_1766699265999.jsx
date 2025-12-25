import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Loader2,
  Camera,
  Save,
  Mail,
  User,
  Building2,
  Linkedin,
  Phone,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* -------------------------------------------
   SynergyAI: Light "Liquid Glass" primitives
-------------------------------------------- */

function LiquidBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30" />
      <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,rgba(15,23,42,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.35)_1px,transparent_1px)] [background-size:64px_64px]" />

      <div className="absolute -top-28 left-1/4 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-purple-400/30 to-pink-400/25 blur-3xl" />
      <div className="absolute top-1/4 right-1/4 h-[480px] w-[480px] rounded-full bg-gradient-to-br from-orange-400/20 to-yellow-400/18 blur-3xl" />
      <div className="absolute -bottom-28 left-1/3 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-green-400/18 to-blue-400/18 blur-3xl" />
    </div>
  );
}

function GlassSurface({ className, children }) {
  return (
    <div
      className={cn(
        "relative rounded-3xl border-2 border-white/60",
        "bg-gradient-to-br from-white/55 to-white/30",
        "backdrop-blur-2xl shadow-lg hover:shadow-xl transition-shadow",
        className
      )}
    >
      {children}
    </div>
  );
}

function UnderGlow({ className }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 rounded-[28px]",
        "bg-gradient-to-br from-purple-400/30 via-pink-400/20 to-blue-400/25",
        "blur-3xl opacity-35",
        className
      )}
    />
  );
}

function PrimaryRainbowButton({ className, children, ...props }) {
  return (
    <Button
      className={cn(
        "relative overflow-hidden rounded-full px-6 h-11 text-white shadow-lg",
        "bg-[linear-gradient(90deg,#7C3AED,#EC4899,#F97316,#FACC15,#22C55E,#3B82F6)]",
        "bg-[length:220%_220%] animate-[synergyGradient_10s_ease_infinite]",
        "hover:shadow-xl",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute inset-0 opacity-0 hover:opacity-100 transition-opacity">
        <span className="absolute -left-1/3 top-0 h-full w-1/2 rotate-12 bg-white/25 blur-xl animate-[synergySweep_1.2s_ease_forwards]" />
      </span>
      <span className="relative z-10 inline-flex items-center">{children}</span>
    </Button>
  );
}

function SecondaryGlassButton({ className, ...props }) {
  return (
    <Button
      variant="outline"
      className={cn(
        "h-11 rounded-full border-2 border-white/60 bg-white/55 text-slate-800",
        "hover:bg-white/70 backdrop-blur-2xl",
        className
      )}
      {...props}
    />
  );
}

const GlobalStyles = () => (
  <style>{`
    @keyframes synergyGradient {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    @keyframes synergySweep {
      0% { transform: translateX(0) rotate(12deg); opacity: 0; }
      20% { opacity: 1; }
      100% { transform: translateX(220%) rotate(12deg); opacity: 0; }
    }
  `}</style>
);

/* -------------------------------------------
   Page
-------------------------------------------- */

export default function Profile() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    full_name: "",
    company_name: "",
    title: "",
    phone: "",
    linkedin_url: "",
    bio: "",
    user_role: "founder",
  });

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
        setFormData({
          full_name: userData.full_name || "",
          company_name: userData.company_name || "",
          title: userData.title || "",
          phone: userData.phone || "",
          linkedin_url: userData.linkedin_url || "",
          bio: userData.bio || "",
          user_role: userData.user_role || "founder",
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Error loading user:", e);
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe(formData);
      toast.success("Profile updated successfully");
      const updated = await base44.auth.me();
      setUser(updated);
    } catch (error) {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.auth.updateMe({ profile_image: file_url });
      const updated = await base44.auth.me();
      setUser(updated);
      toast.success("Profile image updated");
    } catch (error) {
      toast.error("Failed to upload image");
    }
  };

  if (loading) {
    return (
      <div className="relative min-h-[55vh]">
        <GlobalStyles />
        <LiquidBackground />
        <div className="flex h-[55vh] items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading profile…</span>
          </div>
        </div>
      </div>
    );
  }

  const initials =
    (user?.full_name || "User")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "U";

  return (
    <div className="relative">
      <GlobalStyles />
      <LiquidBackground />

      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-white/60 bg-gradient-to-br from-white/55 to-white/30 px-3 py-1 backdrop-blur-2xl text-xs font-semibold text-slate-700 shadow-lg">
              <span className="h-2 w-2 rounded-full bg-gradient-to-r from-purple-500 to-blue-500" />
              Account
            </div>
            <h1 className="mt-3 text-4xl font-bold text-slate-900">
              Your{" "}
              <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                Profile
              </span>
            </h1>
            <p className="mt-1 text-slate-600">Manage your identity, role, and contact details.</p>
          </div>

          <PrimaryRainbowButton onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </PrimaryRainbowButton>
        </div>

        {/* Profile picture + identity */}
        <div className="relative">
          <UnderGlow />
          <GlassSurface className="p-6">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-5">
                <div className="relative">
                  {/* Under-glow for avatar */}
                  <div className="pointer-events-none absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-purple-400/30 via-pink-400/20 to-blue-400/25 blur-2xl opacity-40" />
                  <Avatar className="h-24 w-24 rounded-3xl border-2 border-white/60 bg-white/40 backdrop-blur-2xl shadow-lg">
                    <AvatarImage src={user?.profile_image} alt={user?.full_name || "Profile"} />
                    <AvatarFallback className="rounded-3xl text-white">
                      <span className="absolute inset-0 bg-[linear-gradient(90deg,#7C3AED,#EC4899,#F97316,#FACC15,#22C55E,#3B82F6)]" />
                      <span className="absolute inset-0 bg-white/10 [mask-image:radial-gradient(circle_at_30%_20%,black,transparent_60%)]" />
                      <span className="relative z-10 text-2xl font-bold">{initials}</span>
                    </AvatarFallback>
                  </Avatar>

                  <label
                    htmlFor="avatar-upload"
                    className={cn(
                      "absolute -bottom-2 -right-2 cursor-pointer",
                      "h-10 w-10 rounded-full border-2 border-white/60 bg-white/55 backdrop-blur-2xl",
                      "shadow-lg hover:bg-white/70 transition flex items-center justify-center"
                    )}
                    title="Upload profile picture"
                  >
                    <Camera className="h-4 w-4 text-slate-800" />
                    <input
                      id="avatar-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div>
                  <p className="text-xl font-bold text-slate-900">{user?.full_name || "—"}</p>
                  <p className="text-sm text-slate-500">{user?.email}</p>
                  <Badge className="mt-2 rounded-full border-2 border-white/60 bg-white/55 text-slate-800 backdrop-blur-2xl capitalize">
                    {user?.user_role || "founder"}
                  </Badge>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 sm:justify-end">
                <SecondaryGlassButton
                  onClick={() => {
                    const url = formData.linkedin_url?.trim();
                    if (url) window.open(url, "_blank", "noopener,noreferrer");
                    else toast.error("Add a LinkedIn URL first");
                  }}
                >
                  <Linkedin className="mr-2 h-4 w-4" />
                  LinkedIn
                </SecondaryGlassButton>

                <SecondaryGlassButton
                  onClick={() => {
                    const email = user?.email?.trim();
                    if (email) window.location.href = `mailto:${email}`;
                  }}
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Email
                </SecondaryGlassButton>
              </div>
            </div>
          </GlassSurface>
        </div>

        {/* Profile details */}
        <div className="relative">
          <UnderGlow className="opacity-30" />
          <GlassSurface className="p-0 overflow-hidden">
            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader className="px-6 pt-6">
                <CardTitle className="text-slate-900">Profile Details</CardTitle>
                <CardDescription className="text-slate-600">
                  Keep this accurate—used across investor messaging and exports.
                </CardDescription>
              </CardHeader>

              <CardContent className="px-6 pb-6 space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-slate-700">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={formData.full_name}
                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                        placeholder="Your name"
                        className="h-11 rounded-2xl border-2 border-white/60 bg-white/55 pl-10 text-slate-800 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700">Role</Label>
                    <Select
                      value={formData.user_role}
                      onValueChange={(value) => setFormData({ ...formData, user_role: value })}
                    >
                      <SelectTrigger className="h-11 rounded-2xl border-2 border-white/60 bg-white/55 text-slate-800 focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl">
                        <SelectItem value="founder">Founder</SelectItem>
                        <SelectItem value="investor">Investor</SelectItem>
                        <SelectItem value="lead">Lead Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-slate-700">Company</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={formData.company_name}
                        onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                        placeholder="Your company name"
                        className="h-11 rounded-2xl border-2 border-white/60 bg-white/55 pl-10 text-slate-800 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700">Title</Label>
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g., CEO, Partner"
                      className="h-11 rounded-2xl border-2 border-white/60 bg-white/55 text-slate-800 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-slate-700">Phone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="+1 (555) 000-0000"
                        className="h-11 rounded-2xl border-2 border-white/60 bg-white/55 pl-10 text-slate-800 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700">LinkedIn URL</Label>
                    <div className="relative">
                      <Linkedin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={formData.linkedin_url}
                        onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                        placeholder="https://linkedin.com/in/…"
                        className="h-11 rounded-2xl border-2 border-white/60 bg-white/55 pl-10 text-slate-800 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-700">Bio</Label>
                  <Textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    placeholder="Tell us about yourself…"
                    rows={5}
                    className="rounded-2xl border-2 border-white/60 bg-white/55 text-slate-800 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-white/60 pt-4 sm:flex-row sm:justify-end">
                  <SecondaryGlassButton
                    onClick={() => {
                      if (!user) return;
                      setFormData({
                        full_name: user.full_name || "",
                        company_name: user.company_name || "",
                        title: user.title || "",
                        phone: user.phone || "",
                        linkedin_url: user.linkedin_url || "",
                        bio: user.bio || "",
                        user_role: user.user_role || "founder",
                      });
                      toast.message("Changes reverted");
                    }}
                  >
                    Reset
                  </SecondaryGlassButton>

                  <PrimaryRainbowButton onClick={handleSave} disabled={saving}>
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save Changes
                  </PrimaryRainbowButton>
                </div>
              </CardContent>
            </Card>
          </GlassSurface>
        </div>

        {/* Email */}
        <div className="relative">
          <UnderGlow className="opacity-25 blur-2xl" />
          <GlassSurface className="p-6">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-2xl border-2 border-white/60 bg-white/55 backdrop-blur-2xl flex items-center justify-center">
                <Mail className="h-5 w-5 text-slate-700" />
              </div>

              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">Email Address</p>
                <p className="text-sm text-slate-500">
                  Your email is managed by your authentication provider.
                </p>

                <div className="mt-3 flex flex-col gap-2 rounded-2xl border-2 border-white/60 bg-white/55 px-4 py-3 backdrop-blur-2xl sm:flex-row sm:items-center">
                  <span className="text-slate-800">{user?.email}</span>
                  <Badge
                    variant="secondary"
                    className="sm:ml-auto rounded-full border-2 border-white/60 bg-white/70 text-slate-800"
                  >
                    Verified
                  </Badge>
                </div>
              </div>
            </div>
          </GlassSurface>
        </div>
      </div>
    </div>
  );
}