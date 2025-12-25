import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import {
  FileSpreadsheet,
  Loader2,
  AlertCircle,
  Building2,
  Users,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InvestorCSVImporter from '@/components/import/InvestorCSVImporter';
import InvestorRecordEditor from '@/components/import/InvestorRecordEditor';
import FolkImporter from '@/components/import/FolkImporter';
import FolkSettings from '@/components/import/FolkSettings';
import FailedImportsManager from '@/components/import/FailedImportsManager';
import FolkMissingRecordsFiller from '@/components/import/FolkMissingRecordsFiller';
import { cn } from "@/lib/utils";

/* ---------- Background + Glass Primitives ---------- */

function LiquidBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30" />
      <div
        className="absolute inset-0 opacity-[0.06]
        [background-image:linear-gradient(to_right,rgba(15,23,42,0.35)_1px,transparent_1px),
        linear-gradient(to_bottom,rgba(15,23,42,0.35)_1px,transparent_1px)]
        [background-size:64px_64px]"
      />
      <div className="absolute -top-40 left-1/4 w-[620px] h-[620px] rounded-full bg-gradient-to-br from-purple-400/30 to-pink-400/25 blur-3xl" />
      <div className="absolute top-1/3 right-1/4 w-[520px] h-[520px] rounded-full bg-gradient-to-br from-orange-400/20 to-yellow-400/20 blur-3xl" />
      <div className="absolute -bottom-40 left-1/3 w-[620px] h-[620px] rounded-full bg-gradient-to-br from-green-400/20 to-blue-400/20 blur-3xl" />
    </div>
  );
}

function GlassCard({ children, className }) {
  return (
    <div
      className={cn(
        "relative rounded-3xl border-2 border-white/60",
        "bg-gradient-to-br from-white/55 to-white/30",
        "backdrop-blur-2xl shadow-lg",
        className
      )}
    >
      {children}
    </div>
  );
}

function RainbowButton({ children, className, ...props }) {
  return (
    <Button
      {...props}
      className={cn(
        "rounded-full text-white font-medium",
        "bg-[linear-gradient(90deg,#7C3AED,#EC4899,#F97316,#FACC15,#22C55E,#3B82F6)]",
        "bg-[length:220%_220%] animate-[gradient_10s_ease_infinite]",
        "shadow-lg hover:shadow-xl",
        className
      )}
    >
      {children}
    </Button>
  );
}

export default function DataImport() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('csv');
  const [showAddForm, setShowAddForm] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);

        // Only admin can access this page
        if (userData.role !== 'admin') {
          window.location.href = '/';
        }
      } catch (e) {
        window.location.href = '/';
      }
    };
    loadUser();
  }, []);

  if (!user || user.role !== 'admin') {
    return (
      <div className="relative">
        <LiquidBackground />
        <div className="flex items-center justify-center min-h-[420px]">
          <GlassCard className="p-10 max-w-md w-full text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center
              bg-gradient-to-br from-white/70 to-white/30 border-2 border-white/60 backdrop-blur-2xl shadow-md">
              <AlertCircle className="w-7 h-7 text-rose-500" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-slate-900">Access denied</h2>
            <p className="mt-1 text-slate-600">Admin-only page.</p>
          </GlassCard>
        </div>
      </div>
    );
  }

  const handleSaveRecord = async (data) => {
    try {
      if (activeTab === 'investors') {
        await base44.entities.InvestorFirm.create(data);
      } else {
        await base44.entities.Contact.create(data);
      }
      queryClient.invalidateQueries(['firms']);
      queryClient.invalidateQueries(['contacts']);
      setShowAddForm(false);
    } catch (error) {
      console.error('Error saving record:', error);
    }
  };

  return (
    <div className="relative space-y-8">
      <LiquidBackground />

      {/* ================= Hero Header ================= */}
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1
            bg-white/55 border-2 border-white/60 backdrop-blur-2xl shadow-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="text-sm text-slate-700">Admin tools</span>
          </div>

          <h1 className="mt-4 text-4xl md:text-5xl font-bold text-slate-900">
            Data{" "}
            <span
              className="bg-[linear-gradient(90deg,#7C3AED,#EC4899,#F97316,#FACC15,#22C55E,#3B82F6)]
              bg-clip-text text-transparent"
            >
              Import
            </span>
          </h1>

          <p className="mt-2 text-slate-600 max-w-2xl">
            Import investors and contacts with clean mapping, optional Folk sync, and AI-friendly workflows.
          </p>
        </div>

        {/* Action cluster */}
        <GlassCard className="p-3 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/40 border border-white/60">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span className="text-sm text-slate-700">Importer hub</span>
          </div>

          <RainbowButton onClick={() => setShowAddForm(true)}>
            <Users className="w-4 h-4 mr-2" />
            Add Single Record
          </RainbowButton>
        </GlassCard>
      </div>

      {/* Add/Edit Dialog */}
      <InvestorRecordEditor
        open={showAddForm}
        onClose={() => setShowAddForm(false)}
        onSave={handleSaveRecord}
        type={activeTab === 'investors' ? 'firm' : 'contact'}
      />

      {/* ================= Tabs ================= */}
      <GlassCard className="p-3">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full rounded-3xl bg-white/45 border border-white/60 backdrop-blur-2xl p-1">
            <TabsTrigger
              value="csv"
              className="rounded-3xl data-[state=active]:bg-white/70 data-[state=active]:shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              CSV Import
            </TabsTrigger>

            <TabsTrigger
              value="folk"
              className="rounded-3xl data-[state=active]:bg-white/70 data-[state=active]:shadow-sm"
            >
              <Building2 className="w-4 h-4 mr-2" />
              Folk CRM
            </TabsTrigger>
          </TabsList>

          <TabsContent value="csv" className="mt-6">
            <GlassCard className="p-5">
              <div className="mb-4">
                <h2 className="text-xl font-bold text-slate-900">CSV Import</h2>
                <p className="mt-1 text-slate-600">
                  Upload CSVs for firms and contacts. We'll map fields and import both safely.
                </p>
              </div>

              <InvestorCSVImporter
                type="both"
                onImportComplete={() => {
                  queryClient.invalidateQueries(['firms']);
                  queryClient.invalidateQueries(['contacts']);
                }}
              />
            </GlassCard>
          </TabsContent>

          <TabsContent value="folk" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <GlassCard className="p-5">
                  <div className="mb-4">
                    <h2 className="text-xl font-bold text-slate-900">Folk Import</h2>
                    <p className="mt-1 text-slate-600">
                      Pull companies and people from Folk CRM, then reconcile and fill missing records.
                    </p>
                  </div>

                  <FolkImporter
                    onImportComplete={() => {
                      queryClient.invalidateQueries(['firms']);
                      queryClient.invalidateQueries(['contacts']);
                    }}
                  />
                </GlassCard>

                <GlassCard className="p-5">
                  <FolkMissingRecordsFiller />
                </GlassCard>

                <GlassCard className="p-5">
                  <FailedImportsManager />
                </GlassCard>
              </div>

              <div>
                <GlassCard className="p-5 sticky top-6">
                  <FolkSettings />
                </GlassCard>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </GlassCard>
    </div>
  );
}