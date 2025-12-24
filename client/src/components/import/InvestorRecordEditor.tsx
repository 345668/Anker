import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  UserPlus,
  Loader2,
  Save,
  Sparkles,
  Building2,
  User,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";

const firmTypes = [
  "Venture Capital",
  "Corporate Venture Capital",
  "Family Office",
  "Angel Investor",
  "Angel Group/Network",
  "Private Equity",
  "Fund of Funds",
  "Accelerator/Incubator",
  "Micro VC",
  "Growth Equity",
  "Syndicate",
  "Other",
];

const investmentStages = [
  "Pre-seed",
  "Seed",
  "Series A",
  "Series B",
  "Series C+",
  "Growth",
  "Late Stage",
];

const firmSchema = z.object({
  company_name: z.string().min(1, "Company name is required"),
  firm_type: z.string().optional(),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
  linkedin_url: z.string().url("Invalid URL").optional().or(z.literal("")),
  city: z.string().optional(),
  firm_description: z.string().optional(),
  investment_focus: z.string().optional(),
  investment_stages: z.string().optional(),
  check_size_min: z.coerce.number().optional(),
  check_size_max: z.coerce.number().optional(),
});

const contactSchema = z.object({
  full_name: z.string().min(1, "Full name is required"),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  title: z.string().optional(),
  firm_name: z.string().optional(),
  work_email: z.string().email("Invalid email").optional().or(z.literal("")),
  primary_phone: z.string().optional(),
  linkedin_url: z.string().url("Invalid URL").optional().or(z.literal("")),
  bio: z.string().optional(),
});

type FirmFormData = z.infer<typeof firmSchema>;
type ContactFormData = z.infer<typeof contactSchema>;

interface Props {
  existingRecord?: any;
  type?: "firm" | "contact";
  onSuccess?: () => void;
  trigger?: React.ReactNode;
}

export default function InvestorRecordEditor({
  existingRecord,
  type = "firm",
  onSuccess,
  trigger,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"firm" | "contact">(type);
  const [enriching, setEnriching] = useState(false);
  const isEdit = !!existingRecord;

  const firmForm = useForm<FirmFormData>({
    resolver: zodResolver(firmSchema),
    defaultValues: {
      company_name: "",
      firm_type: "",
      website: "",
      linkedin_url: "",
      city: "",
      firm_description: "",
      investment_focus: "",
      investment_stages: "",
      check_size_min: undefined,
      check_size_max: undefined,
    },
  });

  const contactForm = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      full_name: "",
      first_name: "",
      last_name: "",
      title: "",
      firm_name: "",
      work_email: "",
      primary_phone: "",
      linkedin_url: "",
      bio: "",
    },
  });

  useEffect(() => {
    if (existingRecord) {
      if (type === "firm") {
        firmForm.reset(existingRecord);
      } else {
        contactForm.reset(existingRecord);
      }
    }
  }, [existingRecord, type]);

  const firmMutation = useMutation({
    mutationFn: async (data: FirmFormData) => {
      const investmentFocus = data.investment_focus
        ? data.investment_focus.split(",").map((s) => s.trim())
        : [];
      const stages = data.investment_stages
        ? data.investment_stages.split(",").map((s) => s.trim())
        : [];

      const endpoint = isEdit
        ? `/api/admin/investment-firms/${existingRecord.id}`
        : "/api/admin/investment-firms";
      const method = isEdit ? "PATCH" : "POST";
      const res = await apiRequest(method, endpoint, {
        ...data,
        investment_focus: investmentFocus,
        investment_stages: stages,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: isEdit ? "Firm updated" : "Firm created",
        description: isEdit
          ? "The firm record has been updated"
          : "A new firm record has been created",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/investment-firms"] });
      setOpen(false);
      firmForm.reset();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const contactMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      const endpoint = isEdit
        ? `/api/admin/contacts/${existingRecord.id}`
        : "/api/admin/contacts";
      const method = isEdit ? "PATCH" : "POST";
      const res = await apiRequest(method, endpoint, data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: isEdit ? "Contact updated" : "Contact created",
        description: isEdit
          ? "The contact record has been updated"
          : "A new contact record has been created",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setOpen(false);
      contactForm.reset();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const enrichWithAI = async () => {
    setEnriching(true);
    try {
      let name: string = "";
      let website: string = "";
      let linkedin: string = "";

      if (activeTab === "firm") {
        const firmData = firmForm.getValues();
        name = firmData.company_name;
        website = firmData.website || "";
        linkedin = firmData.linkedin_url || "";
      } else {
        const contactData = contactForm.getValues();
        name = contactData.full_name;
        linkedin = contactData.linkedin_url || "";
      }

      const res = await apiRequest("POST", "/api/admin/enrichment/enrich", {
        entityType: activeTab === "firm" ? "investment_firm" : "contact",
        name,
        website,
        linkedinUrl: linkedin,
      });

      const result = await res.json();

      if (result.success && result.data) {
        if (activeTab === "firm") {
          const enriched = result.data;
          firmForm.setValue(
            "investment_focus",
            enriched.investment_focus?.join(", ") || ""
          );
          firmForm.setValue(
            "investment_stages",
            enriched.investment_stages?.join(", ") || ""
          );
          if (enriched.check_size_min)
            firmForm.setValue("check_size_min", enriched.check_size_min);
          if (enriched.check_size_max)
            firmForm.setValue("check_size_max", enriched.check_size_max);
          if (enriched.firm_description)
            firmForm.setValue("firm_description", enriched.firm_description);
        } else {
          const enriched = result.data;
          if (enriched.bio) contactForm.setValue("bio", enriched.bio);
          if (enriched.title) contactForm.setValue("title", enriched.title);
        }
        toast({
          title: "Enrichment complete",
          description: "Profile data has been auto-filled from web research",
        });
      } else {
        toast({
          title: "Enrichment failed",
          description: result.message || "Could not enrich profile",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Enrichment failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setEnriching(false);
    }
  };

  const onFirmSubmit = (data: FirmFormData) => {
    firmMutation.mutate(data);
  };

  const onContactSubmit = (data: ContactFormData) => {
    contactMutation.mutate(data);
  };

  const canEnrich =
    activeTab === "firm"
      ? !!firmForm.watch("company_name")
      : !!contactForm.watch("full_name");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            className="bg-[rgb(142,132,247)]"
            data-testid="button-add-record"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            {isEdit ? "Edit Record" : "Add Record"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-[#1a1a2e] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEdit ? "Edit" : "Add"} {activeTab === "firm" ? "Firm" : "Contact"}
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Fill in the details below. Use AI enrichment to auto-fill missing
            information.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "firm" | "contact")}
        >
          <TabsList className="grid w-full grid-cols-2 bg-white/5">
            <TabsTrigger
              value="firm"
              className="data-[state=active]:bg-white/10 text-white/60 data-[state=active]:text-white"
            >
              <Building2 className="w-4 h-4 mr-2" />
              Firm
            </TabsTrigger>
            <TabsTrigger
              value="contact"
              className="data-[state=active]:bg-white/10 text-white/60 data-[state=active]:text-white"
            >
              <User className="w-4 h-4 mr-2" />
              Contact
            </TabsTrigger>
          </TabsList>

          <TabsContent value="firm" className="mt-4">
            <Form {...firmForm}>
              <form
                onSubmit={firmForm.handleSubmit(onFirmSubmit)}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={firmForm.control}
                    name="company_name"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="text-white">
                          Company Name *
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="border-white/20 text-white bg-white/5"
                            placeholder="Acme Ventures"
                            data-testid="input-company-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={firmForm.control}
                    name="firm_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white">Firm Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger
                              className="border-white/20 text-white bg-white/5"
                              data-testid="select-firm-type"
                            >
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {firmTypes.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={firmForm.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white">Website</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="border-white/20 text-white bg-white/5"
                            placeholder="https://..."
                            data-testid="input-website"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={firmForm.control}
                    name="linkedin_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white">LinkedIn</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="border-white/20 text-white bg-white/5"
                            placeholder="https://linkedin.com/company/..."
                            data-testid="input-linkedin"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={firmForm.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white">City</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="border-white/20 text-white bg-white/5"
                            placeholder="San Francisco"
                            data-testid="input-city"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={firmForm.control}
                    name="firm_description"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="text-white">Description</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            className="border-white/20 text-white bg-white/5 min-h-[80px]"
                            placeholder="Brief description of the firm..."
                            data-testid="input-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={firmForm.control}
                    name="investment_focus"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="text-white">
                          Investment Focus (comma-separated)
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="border-white/20 text-white bg-white/5"
                            placeholder="SaaS, Fintech, AI"
                            data-testid="input-focus"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={firmForm.control}
                    name="investment_stages"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="text-white">
                          Investment Stages (comma-separated)
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="border-white/20 text-white bg-white/5"
                            placeholder="Seed, Series A, Series B"
                            data-testid="input-stages"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={firmForm.control}
                    name="check_size_min"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white">
                          Min Check Size ($)
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            className="border-white/20 text-white bg-white/5"
                            placeholder="100000"
                            data-testid="input-check-min"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={firmForm.control}
                    name="check_size_max"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white">
                          Max Check Size ($)
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            className="border-white/20 text-white bg-white/5"
                            placeholder="5000000"
                            data-testid="input-check-max"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-center pt-4 border-t border-white/10">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={enrichWithAI}
                    disabled={enriching || !canEnrich}
                    className="w-full border-white/20 text-white"
                    data-testid="button-enrich"
                  >
                    {enriching ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Researching...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Auto-Fill with AI Research
                      </>
                    )}
                  </Button>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                    className="border-white/20 text-white"
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={firmMutation.isPending}
                    className="bg-[rgb(142,132,247)]"
                    data-testid="button-save-firm"
                  >
                    {firmMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="contact" className="mt-4">
            <Form {...contactForm}>
              <form
                onSubmit={contactForm.handleSubmit(onContactSubmit)}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={contactForm.control}
                    name="full_name"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="text-white">Full Name *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="border-white/20 text-white bg-white/5"
                            placeholder="John Doe"
                            data-testid="input-full-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={contactForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white">Title</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="border-white/20 text-white bg-white/5"
                            placeholder="Partner"
                            data-testid="input-title"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={contactForm.control}
                    name="firm_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white">Firm Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="border-white/20 text-white bg-white/5"
                            placeholder="Acme Ventures"
                            data-testid="input-firm-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={contactForm.control}
                    name="work_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white">Work Email</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="email"
                            className="border-white/20 text-white bg-white/5"
                            placeholder="john@acme.vc"
                            data-testid="input-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={contactForm.control}
                    name="primary_phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-white">Phone</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="border-white/20 text-white bg-white/5"
                            placeholder="+1 555 1234"
                            data-testid="input-phone"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={contactForm.control}
                    name="linkedin_url"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="text-white">LinkedIn</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="border-white/20 text-white bg-white/5"
                            placeholder="https://linkedin.com/in/..."
                            data-testid="input-contact-linkedin"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={contactForm.control}
                    name="bio"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="text-white">Bio / Notes</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            className="border-white/20 text-white bg-white/5 min-h-[80px]"
                            placeholder="Additional notes..."
                            data-testid="input-bio"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-center pt-4 border-t border-white/10">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={enrichWithAI}
                    disabled={enriching || !canEnrich}
                    className="w-full border-white/20 text-white"
                    data-testid="button-enrich-contact"
                  >
                    {enriching ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Researching...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Auto-Fill with AI Research
                      </>
                    )}
                  </Button>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                    className="border-white/20 text-white"
                    data-testid="button-cancel-contact"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={contactMutation.isPending}
                    className="bg-[rgb(142,132,247)]"
                    data-testid="button-save-contact"
                  >
                    {contactMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
