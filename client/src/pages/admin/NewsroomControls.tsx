import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Newspaper, Globe, ToggleLeft, ToggleRight, RefreshCw, 
  Play, ChevronDown, ChevronUp, MapPin, Check, X, Sparkles,
  FileText, ExternalLink, Trash2, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup
} from "react-simple-maps";
import AdminLayout from "./AdminLayout";

interface NewsSource {
  id: string;
  name: string;
  type: string;
  url: string;
  category: string;
  tier: string;
  isActive: boolean;
  isEnabled: boolean;
  contentTags: string[] | null;
  regions: string[] | null;
  lastFetchedAt: string | null;
  itemsFetched: number;
  errorCount: number;
}

interface NewsRegion {
  id: string;
  code: string;
  name: string;
  isEnabled: boolean;
  coordinates: { lat: number; lng: number };
  countries: string[];
}

interface NewsArticle {
  id: string;
  slug: string;
  headline: string;
  executiveSummary: string | null;
  blogType: string | null;
  status: string | null;
  publishedAt: string | null;
  wordCount: number | null;
  viewCount: number | null;
  createdAt: string | null;
}

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const categoryLabels: Record<string, string> = {
  tier1_media: "Tier 1 Media",
  vc_pe_media: "VC/PE Media",
  regulatory: "Regulatory",
  consulting: "Consulting",
  institutional: "Institutional",
};

const contentTypeLabels: Record<string, { label: string; color: string }> = {
  insights: { label: "Insights", color: "bg-blue-500/20 text-blue-400" },
  trends: { label: "Trends", color: "bg-green-500/20 text-green-400" },
  guides: { label: "Guides", color: "bg-yellow-500/20 text-yellow-400" },
  analysis: { label: "Analysis", color: "bg-purple-500/20 text-purple-400" },
};

export default function NewsroomControls() {
  const { toast } = useToast();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["tier1_media", "vc_pe_media"]));

  const { data: sources = [], isLoading: sourcesLoading } = useQuery<NewsSource[]>({
    queryKey: ["/api/newsroom/sources"],
  });

  const { data: regions = [], isLoading: regionsLoading } = useQuery<NewsRegion[]>({
    queryKey: ["/api/newsroom/regions"],
  });

  const { data: articles = [], isLoading: articlesLoading } = useQuery<NewsArticle[]>({
    queryKey: ["/api/newsroom/articles"],
  });

  const deleteArticleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/newsroom/articles/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/newsroom/articles"] });
      toast({ title: "Article deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete article", variant: "destructive" });
    },
  });

  const initSourcesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/newsroom/sources/init");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/newsroom/sources"] });
      toast({ title: "Sources initialized" });
    },
  });

  const initRegionsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/newsroom/regions/init");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/newsroom/regions"] });
      toast({ title: "Regions initialized" });
    },
  });

  const fetchSourcesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/newsroom/sources/fetch");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/newsroom/sources"] });
      toast({ title: `Fetched ${data.itemsCreated} items from ${data.successful} sources` });
    },
  });

  const runScheduleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/newsroom/schedule/run");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/newsroom/articles"] });
      toast({ title: `Published ${data.articlesPublished} articles to newsroom` });
    },
  });

  const toggleSourceMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/newsroom/sources/${id}/toggle`, { isEnabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/newsroom/sources"] });
    },
  });

  const toggleRegionMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/newsroom/regions/${id}/toggle`, { isEnabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/newsroom/regions"] });
    },
  });

  const seedContentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/newsroom/seed");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: `Seeded ${data.seeded} articles successfully` });
    },
    onError: () => {
      toast({ title: "Failed to seed content", variant: "destructive" });
    },
  });

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const sourcesByCategory = sources.reduce((acc, source) => {
    const cat = source.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(source);
    return acc;
  }, {} as Record<string, NewsSource[]>);

  const enabledSourcesCount = sources.filter(s => s.isEnabled).length;
  const enabledRegionsCount = regions.filter(r => r.isEnabled).length;
  const publishedArticlesCount = articles.filter(a => a.status === 'published').length;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Newspaper className="w-6 h-6 text-[rgb(142,132,247)]" />
              Newsroom Controls
            </h1>
            <p className="text-white/60 mt-1">
              Manage AI newsroom sources, regions, and publishing schedule
            </p>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => initSourcesMutation.mutate()}
              disabled={initSourcesMutation.isPending}
              className="border-white/20 text-white"
              data-testid="button-init-sources"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${initSourcesMutation.isPending ? "animate-spin" : ""}`} />
              Init Sources
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => initRegionsMutation.mutate()}
              disabled={initRegionsMutation.isPending}
              className="border-white/20 text-white"
              data-testid="button-init-regions"
            >
              <Globe className={`w-4 h-4 mr-2 ${initRegionsMutation.isPending ? "animate-spin" : ""}`} />
              Init Regions
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchSourcesMutation.mutate()}
              disabled={fetchSourcesMutation.isPending}
              className="border-white/20 text-white"
              data-testid="button-fetch-sources"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${fetchSourcesMutation.isPending ? "animate-spin" : ""}`} />
              Fetch All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => seedContentMutation.mutate()}
              disabled={seedContentMutation.isPending}
              className="border-[rgb(142,132,247)] text-[rgb(142,132,247)]"
              data-testid="button-seed-content"
            >
              <Sparkles className={`w-4 h-4 mr-2 ${seedContentMutation.isPending ? "animate-spin" : ""}`} />
              Seed Content
            </Button>
            <Button
              onClick={() => runScheduleMutation.mutate()}
              disabled={runScheduleMutation.isPending}
              className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white"
              data-testid="button-publish-articles"
            >
              <Play className={`w-4 h-4 mr-2 ${runScheduleMutation.isPending ? "animate-spin" : ""}`} />
              Publish Articles
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-white">{sources.length}</div>
              <div className="text-white/60 text-sm">Total Sources</div>
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-400">{enabledSourcesCount}</div>
              <div className="text-white/60 text-sm">Enabled Sources</div>
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-white">{regions.length}</div>
              <div className="text-white/60 text-sm">Total Regions</div>
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-[rgb(142,132,247)]">{enabledRegionsCount}</div>
              <div className="text-white/60 text-sm">Active Regions</div>
            </CardContent>
          </Card>
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-[rgb(251,194,213)]">{publishedArticlesCount}</div>
              <div className="text-white/60 text-sm">Published Articles</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="articles" className="space-y-4">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger 
              value="articles" 
              className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white"
              data-testid="tab-articles"
            >
              <FileText className="w-4 h-4 mr-2" />
              Published Articles
            </TabsTrigger>
            <TabsTrigger 
              value="sources" 
              className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white"
              data-testid="tab-sources"
            >
              <ToggleLeft className="w-4 h-4 mr-2" />
              Source Controls
            </TabsTrigger>
            <TabsTrigger 
              value="regions" 
              className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white"
              data-testid="tab-regions"
            >
              <Globe className="w-4 h-4 mr-2" />
              Regional Map
            </TabsTrigger>
          </TabsList>

          <TabsContent value="articles" className="space-y-4">
            {articlesLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-8 h-8 text-[rgb(142,132,247)] animate-spin" />
              </div>
            ) : articles.length === 0 ? (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-8 text-center">
                  <FileText className="w-12 h-12 text-white/40 mx-auto mb-4" />
                  <p className="text-white/60 mb-4">No articles published yet</p>
                  <p className="text-white/40 text-sm mb-4">
                    Click "Seed Content" to generate sample articles, or "Publish Articles" to process scheduled content
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button
                      onClick={() => seedContentMutation.mutate()}
                      variant="outline"
                      className="border-white/20 text-white"
                    >
                      <Sparkles className="w-4 h-4 mr-2" />
                      Seed Content
                    </Button>
                    <Button
                      onClick={() => runScheduleMutation.mutate()}
                      className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)]"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Publish Articles
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Published Articles ({articles.length})
                  </CardTitle>
                  <CardDescription className="text-white/60">
                    Articles visible on the public newsroom page
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-white/10">
                    {articles.map((article) => (
                      <div
                        key={article.id}
                        className="p-4 flex items-center justify-between gap-4"
                        data-testid={`article-row-${article.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-white truncate">
                              {article.headline}
                            </span>
                            <Badge 
                              variant="secondary" 
                              className={
                                article.status === 'published' 
                                  ? "bg-green-500/20 text-green-400" 
                                  : "bg-white/10 text-white/60"
                              }
                            >
                              {article.status || 'draft'}
                            </Badge>
                            {article.blogType && (
                              <Badge variant="outline" className="border-[rgb(142,132,247)]/50 text-[rgb(142,132,247)]">
                                {article.blogType}
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-white/40 mt-1 line-clamp-1">
                            {article.executiveSummary?.split('\n')[0] || 'No summary'}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-white/30 mt-2">
                            {article.publishedAt && (
                              <span>Published: {new Date(article.publishedAt).toLocaleDateString()}</span>
                            )}
                            {article.wordCount && <span>{article.wordCount} words</span>}
                            {article.viewCount !== null && <span>{article.viewCount} views</span>}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <a
                            href={`/newsroom/${article.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-md hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                            data-testid={`link-view-article-${article.id}`}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this article?')) {
                                deleteArticleMutation.mutate(article.id);
                              }
                            }}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            data-testid={`button-delete-article-${article.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="sources" className="space-y-4">
            {sourcesLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-8 h-8 text-[rgb(142,132,247)] animate-spin" />
              </div>
            ) : sources.length === 0 ? (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-8 text-center">
                  <Newspaper className="w-12 h-12 text-white/40 mx-auto mb-4" />
                  <p className="text-white/60 mb-4">No sources configured yet</p>
                  <Button
                    onClick={() => initSourcesMutation.mutate()}
                    className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)]"
                  >
                    Initialize Default Sources
                  </Button>
                </CardContent>
              </Card>
            ) : (
              Object.entries(sourcesByCategory).map(([category, categorySources]) => (
                <Card key={category} className="bg-white/5 border-white/10 overflow-hidden">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
                    data-testid={`button-toggle-category-${category}`}
                  >
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-white">
                        {categoryLabels[category] || category}
                      </h3>
                      <Badge variant="secondary" className="bg-white/10 text-white/80">
                        {categorySources.filter(s => s.isEnabled).length}/{categorySources.length} enabled
                      </Badge>
                    </div>
                    {expandedCategories.has(category) ? (
                      <ChevronUp className="w-5 h-5 text-white/60" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-white/60" />
                    )}
                  </button>
                  
                  {expandedCategories.has(category) && (
                    <div className="border-t border-white/10 divide-y divide-white/5">
                      {categorySources.map((source) => (
                        <div
                          key={source.id}
                          className="p-4 flex items-center justify-between gap-4"
                          data-testid={`source-row-${source.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-white truncate">
                                {source.name}
                              </span>
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${source.tier === "tier1" ? "border-green-500/50 text-green-400" : "border-white/20 text-white/60"}`}
                              >
                                {source.tier}
                              </Badge>
                              {source.errorCount > 0 && (
                                <Badge variant="destructive" className="text-xs">
                                  {source.errorCount} errors
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-white/40 truncate mt-1">
                              {source.url}
                            </div>
                            {source.lastFetchedAt && (
                              <div className="text-xs text-white/30 mt-1">
                                Last fetched: {new Date(source.lastFetchedAt).toLocaleString()} ({source.itemsFetched} items)
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <Switch
                              checked={source.isEnabled}
                              onCheckedChange={(checked) => 
                                toggleSourceMutation.mutate({ id: source.id, isEnabled: checked })
                              }
                              className="data-[state=checked]:bg-[rgb(142,132,247)]"
                              data-testid={`switch-source-${source.id}`}
                            />
                            {source.isEnabled ? (
                              <Check className="w-5 h-5 text-green-400" />
                            ) : (
                              <X className="w-5 h-5 text-white/30" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="regions" className="space-y-4">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Geographic Coverage</CardTitle>
                <CardDescription className="text-white/60">
                  Toggle regions to control which geographic areas are included in news coverage
                </CardDescription>
              </CardHeader>
              <CardContent>
                {regionsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-8 h-8 text-[rgb(142,132,247)] animate-spin" />
                  </div>
                ) : regions.length === 0 ? (
                  <div className="text-center py-8">
                    <Globe className="w-12 h-12 text-white/40 mx-auto mb-4" />
                    <p className="text-white/60 mb-4">No regions configured yet</p>
                    <Button
                      onClick={() => initRegionsMutation.mutate()}
                      className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)]"
                    >
                      Initialize Default Regions
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="aspect-[2/1] w-full bg-[rgb(12,12,12)] rounded-lg overflow-hidden border border-white/10">
                      <ComposableMap
                        projection="geoMercator"
                        projectionConfig={{
                          scale: 120,
                          center: [20, 30],
                        }}
                        style={{ width: "100%", height: "100%" }}
                      >
                        <ZoomableGroup>
                          <Geographies geography={geoUrl}>
                            {({ geographies }) =>
                              geographies.map((geo) => (
                                <Geography
                                  key={geo.rsmKey}
                                  geography={geo}
                                  fill="rgba(255,255,255,0.1)"
                                  stroke="rgba(255,255,255,0.2)"
                                  strokeWidth={0.5}
                                  style={{
                                    default: { outline: "none" },
                                    hover: { fill: "rgba(142,132,247,0.3)", outline: "none" },
                                    pressed: { outline: "none" },
                                  }}
                                />
                              ))
                            }
                          </Geographies>
                          
                          {regions.map((region) => (
                            <Marker
                              key={region.id}
                              coordinates={[region.coordinates.lng, region.coordinates.lat]}
                            >
                              <g
                                onClick={() => 
                                  toggleRegionMutation.mutate({ 
                                    id: region.id, 
                                    isEnabled: !region.isEnabled 
                                  })
                                }
                                style={{ cursor: "pointer" }}
                                data-testid={`marker-region-${region.code}`}
                              >
                                <circle
                                  r={12}
                                  fill={region.isEnabled ? "rgb(142,132,247)" : "rgba(255,255,255,0.2)"}
                                  stroke={region.isEnabled ? "rgb(251,194,213)" : "rgba(255,255,255,0.3)"}
                                  strokeWidth={2}
                                />
                                <text
                                  textAnchor="middle"
                                  y={4}
                                  style={{
                                    fontFamily: "system-ui",
                                    fill: region.isEnabled ? "#fff" : "rgba(255,255,255,0.5)",
                                    fontSize: "8px",
                                    fontWeight: "bold",
                                  }}
                                >
                                  {region.code}
                                </text>
                              </g>
                            </Marker>
                          ))}
                        </ZoomableGroup>
                      </ComposableMap>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      {regions.map((region) => (
                        <Card
                          key={region.id}
                          className={`bg-white/5 border cursor-pointer transition-all ${
                            region.isEnabled 
                              ? "border-[rgb(142,132,247)] bg-[rgb(142,132,247)]/10" 
                              : "border-white/10 opacity-60"
                          }`}
                          onClick={() => 
                            toggleRegionMutation.mutate({ 
                              id: region.id, 
                              isEnabled: !region.isEnabled 
                            })
                          }
                          data-testid={`card-region-${region.code}`}
                        >
                          <CardContent className="p-4 text-center">
                            <MapPin className={`w-6 h-6 mx-auto mb-2 ${
                              region.isEnabled ? "text-[rgb(142,132,247)]" : "text-white/40"
                            }`} />
                            <div className="font-semibold text-white text-sm">{region.code}</div>
                            <div className="text-xs text-white/60 mt-1">{region.name}</div>
                            <div className="mt-2">
                              {region.isEnabled ? (
                                <Badge className="bg-green-500/20 text-green-400 text-xs">Active</Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-white/10 text-white/40 text-xs">Inactive</Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white">Publishing Schedule (CET Berlin)</CardTitle>
            <CardDescription className="text-white/60">
              4x daily automated publishing at 8am, 12pm, 3pm, and 9pm CET
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { time: "08:00", label: "Morning", type: "insights" },
                { time: "12:00", label: "Noon", type: "trends" },
                { time: "15:00", label: "Afternoon", type: "guides" },
                { time: "21:00", label: "Evening", type: "analysis" },
              ].map((slot) => (
                <div
                  key={slot.time}
                  className="p-4 rounded-lg bg-white/5 border border-white/10"
                >
                  <div className="text-lg font-bold text-white">{slot.time} CET</div>
                  <div className="text-sm text-white/60 mb-2">{slot.label}</div>
                  <Badge className={contentTypeLabels[slot.type]?.color || "bg-white/10"}>
                    {contentTypeLabels[slot.type]?.label || slot.type}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
