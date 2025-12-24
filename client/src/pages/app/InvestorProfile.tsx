import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { ArrowLeft, MapPin, Linkedin, Twitter, Building2, Mail, Phone, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Investor, InvestmentFirm } from "@shared/schema";
import { buildUrl } from "@shared/routes";

export default function InvestorProfile() {
  const params = useParams<{ id: string }>();

  const { data: investor, isLoading } = useQuery<Investor>({
    queryKey: ["/api/investors", params.id],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/investors/:id", { id: params.id }));
      if (!res.ok) throw new Error("Investor not found");
      return res.json();
    },
    enabled: !!params.id,
  });

  const { data: firm } = useQuery<InvestmentFirm>({
    queryKey: ["/api/firms", investor?.firmId],
    queryFn: async () => {
      if (!investor?.firmId) return null;
      const res = await fetch(buildUrl("/api/firms/:id", { id: investor.firmId }));
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!investor?.firmId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!investor) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <Card className="p-8 text-center max-w-md bg-white/5 border-white/10">
          <h2 className="text-xl font-light text-white mb-2">
            Investor Not Found
          </h2>
          <p className="text-white/50 mb-4">
            This investor profile doesn't exist or has been removed.
          </p>
          <Link href="/app/investors">
            <Button data-testid="button-back-investors">Back to Investors</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[rgb(18,18,18)]">
      <header className="h-16 bg-black/50 border-b border-white/10 flex items-center px-6 sticky top-0 z-30 backdrop-blur-md">
        <Link href="/app/investors" data-testid="link-back-investors">
          <Button variant="ghost" size="icon" className="text-white/60">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="ml-4">
          <h1 className="text-xl font-light text-white">Investor Profile</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-6">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <Avatar className="h-24 w-24 border border-white/10">
                <AvatarImage src={investor.avatar || undefined} />
                <AvatarFallback className="bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] text-2xl">
                  {investor.firstName?.charAt(0)}
                  {investor.lastName?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <CardTitle className="text-2xl mb-1 text-white" data-testid="text-investor-name">
                  {investor.firstName} {investor.lastName}
                </CardTitle>
                {investor.title && (
                  <p className="text-lg text-white/50" data-testid="text-investor-title">
                    {investor.title}
                  </p>
                )}
                {firm && (
                  <Link href={`/app/firms/${firm.id}`}>
                    <span className="text-lg font-medium text-[rgb(142,132,247)] hover:underline cursor-pointer" data-testid="text-investor-firm">
                      {firm.name}
                    </span>
                  </Link>
                )}
                <div className="flex flex-wrap gap-3 mt-4">
                  {investor.linkedinUrl && (
                    <a href={investor.linkedinUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" data-testid="button-investor-linkedin">
                        <Linkedin className="w-4 h-4 mr-2" />
                        LinkedIn
                      </Button>
                    </a>
                  )}
                  {investor.twitterUrl && (
                    <a href={investor.twitterUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" data-testid="button-investor-twitter">
                        <Twitter className="w-4 h-4 mr-2" />
                        Twitter
                      </Button>
                    </a>
                  )}
                  {investor.email && (
                    <a href={`mailto:${investor.email}`}>
                      <Button variant="outline" size="sm" data-testid="button-investor-email">
                        <Mail className="w-4 h-4 mr-2" />
                        Email
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {investor.bio && (
              <div>
                <h3 className="text-sm font-medium text-white/40 mb-2">About</h3>
                <p className="text-white/70" data-testid="text-investor-bio">
                  {investor.bio}
                </p>
              </div>
            )}

            {investor.location && (
              <div className="flex items-center gap-2 text-white/50">
                <MapPin className="w-5 h-5" />
                <span data-testid="text-investor-location">{investor.location}</span>
              </div>
            )}

            {(Array.isArray(investor.stages) && investor.stages.length > 0) && (
              <div>
                <h3 className="text-sm font-medium text-white/40 mb-2">Investment Stages</h3>
                <div className="flex flex-wrap gap-2">
                  {investor.stages.map((stage: string) => (
                    <Badge key={stage} variant="secondary" data-testid={`badge-stage-${stage}`}>
                      {stage}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {(Array.isArray(investor.sectors) && investor.sectors.length > 0) && (
              <div>
                <h3 className="text-sm font-medium text-white/40 mb-2">Focus Sectors</h3>
                <div className="flex flex-wrap gap-2">
                  {investor.sectors.map((sector: string) => (
                    <Badge key={sector} variant="outline" className="border-white/20 text-white/70" data-testid={`badge-sector-${sector}`}>
                      {sector}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {firm && (
              <div>
                <h3 className="text-sm font-medium text-white/40 mb-2">Firm Details</h3>
                <Card className="bg-white/5 border-white/10">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-[rgb(142,132,247)]/20 flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-[rgb(142,132,247)]" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-white">{firm.name}</h4>
                        {firm.type && <p className="text-sm text-white/50">{firm.type}</p>}
                        {firm.description && (
                          <p className="text-sm text-white/50 mt-2 line-clamp-2">
                            {firm.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-4 mt-3 text-sm text-white/40">
                          {firm.location && <span>{firm.location}</span>}
                          {firm.aum && <span>AUM: {firm.aum}</span>}
                          {firm.portfolioCount && <span>{firm.portfolioCount} investments</span>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="pt-4 flex gap-3">
              <Button className="flex-1" data-testid="button-connect-investor">
                Request Introduction
              </Button>
              <Button variant="outline" data-testid="button-save-investor">
                Save to Contacts
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
