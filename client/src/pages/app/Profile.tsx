import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  User, 
  Mail, 
  Building2, 
  Briefcase, 
  Linkedin, 
  Phone, 
  MapPin,
  Save,
  RefreshCw,
  Shield,
  Calendar
} from "lucide-react";
import type { User as UserType } from "@shared/models/auth";

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  companyName: z.string().optional(),
  jobTitle: z.string().optional(),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
  phone: z.string().optional(),
  bio: z.string().optional(),
  location: z.string().optional(),
  stage: z.string().optional(),
  firmRole: z.string().optional(),
  checkSizeMin: z.string().optional(),
  checkSizeMax: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

const stages = ["Pre-seed", "Seed", "Series A", "Series B", "Series C+", "Growth"];
const industries = ["FinTech", "HealthTech", "EdTech", "AI/ML", "SaaS", "E-commerce", "CleanTech", "Cybersecurity", "Blockchain", "Consumer"];

export default function Profile() {
  const { user, refetch } = useAuth();
  const { toast } = useToast();
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>(
    (user?.industries as string[]) || []
  );
  const [selectedFocus, setSelectedFocus] = useState<string[]>(
    (user?.investmentFocus as string[]) || []
  );
  const [selectedStages, setSelectedStages] = useState<string[]>(
    (user?.preferredStages as string[]) || []
  );

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      companyName: user?.companyName || "",
      jobTitle: user?.jobTitle || "",
      linkedinUrl: user?.linkedinUrl || "",
      phone: user?.phone || "",
      bio: user?.bio || "",
      location: user?.location || "",
      stage: user?.stage || "",
      firmRole: user?.firmRole || "",
      checkSizeMin: user?.checkSizeMin || "",
      checkSizeMax: user?.checkSizeMax || "",
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const payload = {
        ...data,
        industries: selectedIndustries,
        investmentFocus: selectedFocus,
        preferredStages: selectedStages,
      };
      return apiRequest("PATCH", "/api/auth/user", payload);
    },
    onSuccess: () => {
      toast({ title: "Profile updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      refetch();
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to update profile", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const onSubmit = (data: ProfileFormData) => {
    updateProfileMutation.mutate(data);
  };

  const toggleIndustry = (industry: string) => {
    setSelectedIndustries(prev =>
      prev.includes(industry)
        ? prev.filter(i => i !== industry)
        : [...prev, industry]
    );
  };

  const toggleFocus = (focus: string) => {
    setSelectedFocus(prev =>
      prev.includes(focus)
        ? prev.filter(f => f !== focus)
        : [...prev, focus]
    );
  };

  const toggleStage = (stage: string) => {
    setSelectedStages(prev =>
      prev.includes(stage)
        ? prev.filter(s => s !== stage)
        : [...prev, stage]
    );
  };

  const getInitials = () => {
    const first = user?.firstName?.[0] || "";
    const last = user?.lastName?.[0] || "";
    return (first + last).toUpperCase() || "U";
  };

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <AppLayout title="Your Profile" subtitle="Manage your account settings and preferences" videoUrl={videoBackgrounds.profile}>
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <Card className="bg-white/5 border-white/10">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <Avatar className="w-24 h-24 mb-4">
                    <AvatarImage src={user?.profileImageUrl || ""} />
                    <AvatarFallback className="bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] text-2xl">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <h2 className="text-xl font-semibold text-white" data-testid="text-profile-name">
                    {user?.firstName} {user?.lastName}
                  </h2>
                  <p className="text-white/60 text-sm" data-testid="text-profile-email">
                    {user?.email}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <Badge 
                      variant="outline" 
                      className="bg-[rgb(142,132,247)]/10 text-[rgb(142,132,247)] border-[rgb(142,132,247)]/20"
                    >
                      {user?.userType === "founder" ? "Founder" : "Investor"}
                    </Badge>
                    {user?.isAdmin && (
                      <Badge 
                        variant="outline" 
                        className="bg-[rgb(251,194,213)]/10 text-[rgb(251,194,213)] border-[rgb(251,194,213)]/20"
                      >
                        <Shield className="w-3 h-3 mr-1" />
                        Admin
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white text-lg">Account Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-white/40" />
                  <div>
                    <p className="text-white/40">Member since</p>
                    <p className="text-white" data-testid="text-created-date">
                      {formatDate(user?.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <RefreshCw className="w-4 h-4 text-white/40" />
                  <div>
                    <p className="text-white/40">Last updated</p>
                    <p className="text-white" data-testid="text-updated-date">
                      {formatDate(user?.updatedAt)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Edit Profile</CardTitle>
                <CardDescription className="text-white/50">
                  Update your profile information
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white/70">First Name</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                <Input 
                                  {...field} 
                                  className="pl-10 bg-white/5 border-white/10 text-white" 
                                  data-testid="input-first-name"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white/70">Last Name</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                <Input 
                                  {...field} 
                                  className="pl-10 bg-white/5 border-white/10 text-white"
                                  data-testid="input-last-name"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="companyName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white/70">Company</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                <Input 
                                  {...field} 
                                  className="pl-10 bg-white/5 border-white/10 text-white"
                                  data-testid="input-company"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="jobTitle"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white/70">Job Title</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                <Input 
                                  {...field} 
                                  className="pl-10 bg-white/5 border-white/10 text-white"
                                  data-testid="input-job-title"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="linkedinUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white/70">LinkedIn URL</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                <Input 
                                  {...field} 
                                  placeholder="https://linkedin.com/in/..."
                                  className="pl-10 bg-white/5 border-white/10 text-white"
                                  data-testid="input-linkedin"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-white/70">Phone</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                <Input 
                                  {...field} 
                                  className="pl-10 bg-white/5 border-white/10 text-white"
                                  data-testid="input-phone"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/70">Location</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                              <Input 
                                {...field} 
                                placeholder="City, Country"
                                className="pl-10 bg-white/5 border-white/10 text-white"
                                data-testid="input-location"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="bio"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-white/70">Bio</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              placeholder="Tell us about yourself..."
                              className="bg-white/5 border-white/10 text-white min-h-[100px]"
                              data-testid="input-bio"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {user?.userType === "founder" && (
                      <>
                        <FormField
                          control={form.control}
                          name="stage"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-white/70">Company Stage</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                                    <SelectValue placeholder="Select stage" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {stages.map((stage) => (
                                    <SelectItem key={stage} value={stage}>
                                      {stage}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div>
                          <label className="text-sm text-white/70 mb-2 block">Industries</label>
                          <div className="flex flex-wrap gap-2">
                            {industries.map((industry) => (
                              <Badge
                                key={industry}
                                variant="outline"
                                className={`cursor-pointer transition-colors ${
                                  selectedIndustries.includes(industry)
                                    ? "bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] border-[rgb(142,132,247)]/40"
                                    : "bg-white/5 text-white/60 border-white/10"
                                }`}
                                onClick={() => toggleIndustry(industry)}
                                data-testid={`badge-industry-${industry.toLowerCase()}`}
                              >
                                {industry}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {user?.userType === "investor" && (
                      <>
                        <FormField
                          control={form.control}
                          name="firmRole"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-white/70">Role at Firm</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  placeholder="Partner, Principal, etc."
                                  className="bg-white/5 border-white/10 text-white"
                                  data-testid="input-firm-role"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="checkSizeMin"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-white/70">Min Check Size</FormLabel>
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    placeholder="$25K"
                                    className="bg-white/5 border-white/10 text-white"
                                    data-testid="input-check-min"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="checkSizeMax"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-white/70">Max Check Size</FormLabel>
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    placeholder="$500K"
                                    className="bg-white/5 border-white/10 text-white"
                                    data-testid="input-check-max"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div>
                          <label className="text-sm text-white/70 mb-2 block">Preferred Stages</label>
                          <div className="flex flex-wrap gap-2">
                            {stages.map((stage) => (
                              <Badge
                                key={stage}
                                variant="outline"
                                className={`cursor-pointer transition-colors ${
                                  selectedStages.includes(stage)
                                    ? "bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)] border-[rgb(196,227,230)]/40"
                                    : "bg-white/5 text-white/60 border-white/10"
                                }`}
                                onClick={() => toggleStage(stage)}
                                data-testid={`badge-stage-${stage.toLowerCase()}`}
                              >
                                {stage}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="text-sm text-white/70 mb-2 block">Investment Focus</label>
                          <div className="flex flex-wrap gap-2">
                            {industries.map((focus) => (
                              <Badge
                                key={focus}
                                variant="outline"
                                className={`cursor-pointer transition-colors ${
                                  selectedFocus.includes(focus)
                                    ? "bg-[rgb(254,231,175)]/20 text-[rgb(254,231,175)] border-[rgb(254,231,175)]/40"
                                    : "bg-white/5 text-white/60 border-white/10"
                                }`}
                                onClick={() => toggleFocus(focus)}
                                data-testid={`badge-focus-${focus.toLowerCase()}`}
                              >
                                {focus}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    <div className="flex justify-end pt-4">
                      <Button 
                        type="submit"
                        disabled={updateProfileMutation.isPending}
                        className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80 text-white"
                        data-testid="button-save-profile"
                      >
                        {updateProfileMutation.isPending ? (
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4 mr-2" />
                        )}
                        Save Changes
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
