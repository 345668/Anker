import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { ArrowLeft, MapPin, Linkedin, Twitter, Building2, Mail, Phone, Globe, Crown, Briefcase, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Businessman } from "@shared/schema";
import { buildUrl } from "@shared/routes";

export default function BusinessmanProfile() {
  const params = useParams<{ id: string }>();

  const { data: businessman, isLoading } = useQuery<Businessman>({
    queryKey: ["/api/businessmen", params.id],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/businessmen/:id", { id: params.id }));
      if (!res.ok) throw new Error("Family business not found");
      return res.json();
    },
    enabled: !!params.id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!businessman) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <Card className="p-8 text-center max-w-md bg-white/5 border-white/10">
          <h2 className="text-xl font-light text-white mb-2">
            Family Business Not Found
          </h2>
          <p className="text-white/50 mb-4">
            This profile doesn't exist or has been removed.
          </p>
          <Link href="/app/businessmen">
            <Button data-testid="button-back-businessmen">Back to Family Businesses</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const displayName = businessman.familyName || `${businessman.firstName} ${businessman.lastName || ''}`;
  const sectors = businessman.businessSectors?.split(',').map(s => s.trim()).filter(Boolean) || [];
  const assets = businessman.coreAssets?.split(',').map(s => s.trim()).filter(Boolean) || [];

  return (
    <div className="min-h-screen bg-[rgb(18,18,18)]">
      <header className="h-16 bg-black/50 border-b border-white/10 flex items-center px-6 sticky top-0 z-30 backdrop-blur-md">
        <Link href="/app/businessmen" data-testid="link-back-businessmen">
          <Button variant="ghost" size="icon" className="text-white/60">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="ml-4">
          <h1 className="text-xl font-light text-white">Family Business Profile</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-6">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <Avatar className="h-24 w-24 border border-white/10 rounded-xl">
                <AvatarImage src={businessman.avatar || undefined} />
                <AvatarFallback className="bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] text-2xl rounded-xl">
                  {businessman.firstName?.charAt(0)}
                  {businessman.lastName?.charAt(0) || businessman.familyName?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <CardTitle className="text-2xl mb-1 text-white flex items-center gap-2" data-testid="text-businessman-name">
                  <Crown className="w-6 h-6 text-[rgb(142,132,247)]" />
                  {displayName}
                </CardTitle>
                {businessman.title && (
                  <p className="text-lg text-white/50" data-testid="text-businessman-title">
                    {businessman.title}
                  </p>
                )}
                {businessman.flagshipCompany && (
                  <p className="text-lg font-medium text-[rgb(142,132,247)]" data-testid="text-businessman-company">
                    <Building2 className="w-4 h-4 inline mr-2" />
                    {businessman.flagshipCompany}
                  </p>
                )}
                {!businessman.flagshipCompany && businessman.company && (
                  <p className="text-lg font-medium text-[rgb(142,132,247)]" data-testid="text-businessman-company">
                    <Building2 className="w-4 h-4 inline mr-2" />
                    {businessman.company}
                  </p>
                )}
                <div className="flex flex-wrap gap-3 mt-4">
                  {businessman.linkedinUrl && (
                    <a href={businessman.linkedinUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" data-testid="button-businessman-linkedin">
                        <Linkedin className="w-4 h-4 mr-2" />
                        LinkedIn
                      </Button>
                    </a>
                  )}
                  {businessman.twitterUrl && (
                    <a href={businessman.twitterUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" data-testid="button-businessman-twitter">
                        <Twitter className="w-4 h-4 mr-2" />
                        Twitter
                      </Button>
                    </a>
                  )}
                  {businessman.email && (
                    <a href={`mailto:${businessman.email}`}>
                      <Button variant="outline" size="sm" data-testid="button-businessman-email">
                        <Mail className="w-4 h-4 mr-2" />
                        Email
                      </Button>
                    </a>
                  )}
                  {businessman.website && (
                    <a href={businessman.website} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" data-testid="button-businessman-website">
                        <Globe className="w-4 h-4 mr-2" />
                        Website
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {businessman.bio && (
              <div>
                <h3 className="text-sm font-medium text-white/40 mb-2">About</h3>
                <p className="text-white/70" data-testid="text-businessman-bio">
                  {businessman.bio}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {businessman.city && (
                <div className="flex items-center gap-2 text-white/50">
                  <MapPin className="w-5 h-5" />
                  <span data-testid="text-businessman-location">
                    {businessman.city}{businessman.country ? `, ${businessman.country}` : ''}
                  </span>
                </div>
              )}
              {businessman.netWorth && (
                <div className="flex items-center gap-2 text-white/50">
                  <DollarSign className="w-5 h-5" />
                  <span data-testid="text-businessman-networth">{businessman.netWorth}</span>
                </div>
              )}
            </div>

            {sectors.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-white/40 mb-2">Business Sectors</h3>
                <div className="flex flex-wrap gap-2">
                  {sectors.map((sector: string, index: number) => (
                    <Badge key={index} variant="secondary" data-testid={`badge-sector-${index}`}>
                      <Briefcase className="w-3 h-3 mr-1" />
                      {sector}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {assets.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-white/40 mb-2">Core Assets</h3>
                <div className="flex flex-wrap gap-2">
                  {assets.map((asset: string, index: number) => (
                    <Badge key={index} variant="outline" className="border-white/20 text-white/70" data-testid={`badge-asset-${index}`}>
                      {asset}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {businessman.influence && (
              <div>
                <h3 className="text-sm font-medium text-white/40 mb-2">Influence & Impact</h3>
                <p className="text-white/70" data-testid="text-businessman-influence">
                  {businessman.influence}
                </p>
              </div>
            )}

            {businessman.notes && (
              <div>
                <h3 className="text-sm font-medium text-white/40 mb-2">Notes</h3>
                <p className="text-white/70" data-testid="text-businessman-notes">
                  {businessman.notes}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
