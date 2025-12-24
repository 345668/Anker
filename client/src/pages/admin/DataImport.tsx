import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileSpreadsheet,
  Building2,
  Users,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import AdminLayout from "./AdminLayout";
import InvestorCSVImporter from "@/components/import/InvestorCSVImporter";
import UnifiedSmartImporter from "@/components/import/UnifiedSmartImporter";
import InvestorRecordEditor from "@/components/import/InvestorRecordEditor";
import FolkImporter from "@/components/import/FolkImporter";
import FolkSettingsPanel from "@/components/import/FolkSettingsPanel";
import MissingRecordsScanner from "@/components/import/MissingRecordsScanner";
import FailedImportsManager from "@/components/import/FailedImportsManager";
import { cn } from "@/lib/utils";

function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border border-white/10",
        "bg-white/5 backdrop-blur-xl",
        className
      )}
    >
      {children}
    </div>
  );
}

function RainbowButton({ children, className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      className={cn(
        "rounded-full text-white font-medium",
        "bg-[linear-gradient(90deg,#7C3AED,#EC4899,#F97316,#FACC15,#22C55E,#3B82F6)]",
        "bg-[length:220%_220%] animate-[gradient_10s_ease_infinite]",
        "shadow-lg hover:shadow-xl border-0",
        className
      )}
    >
      {children}
    </Button>
  );
}

export default function DataImport() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("csv");
  const [showAddForm, setShowAddForm] = useState(false);

  const handleImportComplete = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
    queryClient.invalidateQueries({ queryKey: ["/api/investment-firms"] });
  };

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Hero Header */}
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 bg-white/5 border border-white/10 backdrop-blur-xl">
              <ShieldCheck className="w-4 h-4 text-[rgb(196,227,230)]" />
              <span className="text-sm text-white/70">Admin tools</span>
            </div>

            <h1 className="mt-4 text-4xl md:text-5xl font-bold text-white">
              Data{" "}
              <span className="bg-[linear-gradient(90deg,#7C3AED,#EC4899,#F97316,#FACC15,#22C55E,#3B82F6)] bg-clip-text text-transparent">
                Import
              </span>
            </h1>

            <p className="mt-2 text-white/60 max-w-2xl">
              Import investors and contacts with clean mapping, optional Folk sync, and AI-friendly workflows.
            </p>
          </div>

          {/* Action cluster */}
          <GlassCard className="p-3 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
              <Sparkles className="w-4 h-4 text-[rgb(142,132,247)]" />
              <span className="text-sm text-white/70">Importer hub</span>
            </div>

            <RainbowButton onClick={() => setShowAddForm(true)} data-testid="button-add-record">
              <Users className="w-4 h-4 mr-2" />
              Add Single Record
            </RainbowButton>
          </GlassCard>
        </div>

        {/* Add/Edit Dialog */}
        <InvestorRecordEditor />

        {/* Tabs */}
        <GlassCard className="p-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full rounded-2xl bg-white/5 border border-white/10 p-1 flex-wrap">
              <TabsTrigger
                value="csv"
                className="rounded-xl data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/60"
                data-testid="tab-csv"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                CSV Import
              </TabsTrigger>

              <TabsTrigger
                value="folk"
                className="rounded-xl data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/60"
                data-testid="tab-folk"
              >
                <Building2 className="w-4 h-4 mr-2" />
                Folk CRM
              </TabsTrigger>

              <TabsTrigger
                value="smart"
                className="rounded-xl data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/60"
                data-testid="tab-smart"
              >
                <Upload className="w-4 h-4 mr-2" />
                Smart Import
              </TabsTrigger>
            </TabsList>

            <TabsContent value="csv" className="mt-6">
              <GlassCard className="p-5">
                <div className="mb-4">
                  <h2 className="text-xl font-bold text-white">CSV Import</h2>
                  <p className="mt-1 text-white/60">
                    Upload CSVs for firms and contacts. We'll map fields and import both safely.
                  </p>
                </div>

                <InvestorCSVImporter
                  type="both"
                  onImportComplete={handleImportComplete}
                />
              </GlassCard>
            </TabsContent>

            <TabsContent value="folk" className="mt-6 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <GlassCard className="p-5">
                    <div className="mb-4">
                      <h2 className="text-xl font-bold text-white">Folk Import</h2>
                      <p className="mt-1 text-white/60">
                        Pull companies and people from Folk CRM, then reconcile and fill missing records.
                      </p>
                    </div>

                    <FolkImporter onImportComplete={handleImportComplete} />
                  </GlassCard>

                  <GlassCard className="p-5">
                    <MissingRecordsScanner />
                  </GlassCard>

                  <GlassCard className="p-5">
                    <FailedImportsManager />
                  </GlassCard>
                </div>

                <div>
                  <GlassCard className="p-5 sticky top-6">
                    <FolkSettingsPanel />
                  </GlassCard>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="smart" className="mt-6">
              <div className="space-y-6">
                <UnifiedSmartImporter />
                <InvestorRecordEditor />
              </div>
            </TabsContent>
          </Tabs>
        </GlassCard>
      </div>
    </AdminLayout>
  );
}
