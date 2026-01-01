import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { motion } from "framer-motion";
import { 
  Building2, MapPin, Globe, Linkedin, Mail, Phone, 
  ArrowLeft, ExternalLink, Calendar, Users, DollarSign 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import type { InvestmentFirm, Investor } from "@shared/schema";

export default function InvestmentFirmProfile() {
  const { id } = useParams<{ id: string }>();

  const { data: firm, isLoading: loadingFirm } = useQuery<InvestmentFirm>({
    queryKey: ["/api/firms", id],
    enabled: !!id,
  });

  const { data: investorsResponse } = useQuery<{ data: Investor[], total: number }>({
    queryKey: ["/api/investors"],
  });
  const investors = investorsResponse?.data ?? [];

  const firmInvestors = investors.filter((inv) => inv.firmId === id);

  if (loadingFirm) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!firm) {
    return (
      <AppLayout title="Firm Not Found" subtitle="" heroHeight="25vh">
        <div className="py-16 text-center">
          <Building2 className="w-16 h-16 text-white/20 mx-auto mb-4" />
          <h3 className="text-xl text-white mb-4">Investment firm not found</h3>
          <Link href="/app/firms">
            <Button variant="outline">Back to Firms</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout 
      title={firm.name || "Investment Firm"}
      subtitle={firm.industry || "Investment Firm"}
      heroHeight="35vh"
      videoUrl={videoBackgrounds.firms}
    >
      <div className="py-12 bg-[rgb(18,18,18)]">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Link href="/app/firms">
              <Button variant="ghost" className="mb-6 text-white/60 hover:text-white" data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Firms
              </Button>
            </Link>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="w-20 h-20 rounded-xl bg-[rgb(142,132,247)]/20 flex items-center justify-center border border-white/10">
                      <Building2 className="w-10 h-10 text-[rgb(142,132,247)]" />
                    </div>
                    <div className="flex-1">
                      <h1 className="text-2xl font-medium text-white mb-1">{firm.name}</h1>
                      {firm.industry && (
                        <p className="text-white/50">{firm.industry}</p>
                      )}
                      {firm.hqLocation && (
                        <p className="text-[rgb(142,132,247)] flex items-center gap-1 mt-1">
                          <MapPin className="w-4 h-4" />
                          {firm.hqLocation}
                        </p>
                      )}
                    </div>
                  </div>

                  {firm.description && (
                    <div className="mb-6">
                      <h3 className="text-sm font-medium text-white/70 mb-2">About</h3>
                      <p className="text-white/60 leading-relaxed">{firm.description}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {firm.employeeRange && (
                      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                        <Users className="w-4 h-4 text-white/40 mb-1" />
                        <p className="text-xs text-white/40">Employees</p>
                        <p className="text-sm text-white">{firm.employeeRange}</p>
                      </div>
                    )}
                    {firm.foundationYear && (
                      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                        <Calendar className="w-4 h-4 text-white/40 mb-1" />
                        <p className="text-xs text-white/40">Founded</p>
                        <p className="text-sm text-white">{firm.foundationYear}</p>
                      </div>
                    )}
                    {firm.fundingRaised && (
                      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                        <DollarSign className="w-4 h-4 text-white/40 mb-1" />
                        <p className="text-xs text-white/40">AUM</p>
                        <p className="text-sm text-white">{firm.fundingRaised}</p>
                      </div>
                    )}
                    {firm.status && (
                      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                        <Building2 className="w-4 h-4 text-white/40 mb-1" />
                        <p className="text-xs text-white/40">Status</p>
                        <p className="text-sm text-white">{firm.status}</p>
                      </div>
                    )}
                  </div>
                </div>

                {firmInvestors.length > 0 && (
                  <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
                    <h3 className="text-lg font-medium text-white mb-4">Team Members</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {firmInvestors.map((investor) => (
                        <Link key={investor.id} href={`/app/investors/${investor.id}`}>
                          <div className="p-4 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer">
                            <h4 className="text-white font-medium">
                              {investor.firstName} {investor.lastName}
                            </h4>
                            {investor.title && (
                              <p className="text-sm text-white/50">{investor.title}</p>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
                  <h3 className="text-lg font-medium text-white mb-4">Contact</h3>
                  <div className="space-y-3">
                    {firm.website && (
                      <a 
                        href={firm.website.startsWith('http') ? firm.website : `https://${firm.website}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 text-white/60 hover:text-white transition-colors"
                        data-testid="link-website"
                      >
                        <Globe className="w-4 h-4" />
                        <span className="truncate">{firm.website.replace(/^https?:\/\//, '')}</span>
                        <ExternalLink className="w-3 h-3 ml-auto" />
                      </a>
                    )}
                    {firm.linkedinUrl && (
                      <a 
                        href={firm.linkedinUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 text-white/60 hover:text-white transition-colors"
                        data-testid="link-linkedin"
                      >
                        <Linkedin className="w-4 h-4" />
                        <span>LinkedIn</span>
                        <ExternalLink className="w-3 h-3 ml-auto" />
                      </a>
                    )}
                    {firm.emails && firm.emails.length > 0 && (
                      <a 
                        href={`mailto:${firm.emails[0].value}`}
                        className="flex items-center gap-3 text-white/60 hover:text-white transition-colors"
                        data-testid="link-email"
                      >
                        <Mail className="w-4 h-4" />
                        <span className="truncate">{firm.emails[0].value}</span>
                      </a>
                    )}
                    {firm.phones && firm.phones.length > 0 && (
                      <a 
                        href={`tel:${firm.phones[0].value}`}
                        className="flex items-center gap-3 text-white/60 hover:text-white transition-colors"
                        data-testid="link-phone"
                      >
                        <Phone className="w-4 h-4" />
                        <span>{firm.phones[0].value}</span>
                      </a>
                    )}
                  </div>
                </div>

                {firm.folkCustomFields && Object.keys(firm.folkCustomFields).length > 0 && (
                  <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
                    <h3 className="text-lg font-medium text-white mb-4">Additional Info</h3>
                    <div className="space-y-2">
                      {Object.entries(firm.folkCustomFields).slice(0, 10).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-sm">
                          <span className="text-white/40 capitalize">{key.replace(/_/g, ' ')}</span>
                          <span className="text-white/70 text-right max-w-[60%] truncate">
                            {String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
}
