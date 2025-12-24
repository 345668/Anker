import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  UserPlus,
  Loader2,
  Save,
  X,
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
import { apiRequest } from "@/lib/queryClient";

const investorSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  title: z.string().optional(),
  linkedinUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
  investorType: z.string().optional(),
  investorState: z.string().optional(),
  fundingStage: z.string().optional(),
  typicalInvestment: z.string().optional(),
  bio: z.string().optional(),
  location: z.string().optional(),
});

type InvestorFormData = z.infer<typeof investorSchema>;

const investorTypes = [
  "Venture Capital",
  "Corporate Venture Capital",
  "Angel Investor",
  "Family Office",
  "Accelerator/Incubator",
  "Private Equity",
  "Syndicate",
  "Fund of Funds",
];

const investorStates = [
  "Active",
  "Inactive",
  "Lead",
  "Contact",
  "Prospect",
  "Portfolio",
];

const fundingStages = [
  "Pre-seed",
  "Seed",
  "Series A",
  "Series B",
  "Series C+",
  "Growth",
  "Late Stage",
];

interface Props {
  existingInvestor?: any;
  onSuccess?: () => void;
}

export default function InvestorRecordEditor({ existingInvestor, onSuccess }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const isEdit = !!existingInvestor;

  const form = useForm<InvestorFormData>({
    resolver: zodResolver(investorSchema),
    defaultValues: existingInvestor || {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      title: "",
      linkedinUrl: "",
      investorType: "",
      investorState: "",
      fundingStage: "",
      typicalInvestment: "",
      bio: "",
      location: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InvestorFormData) => {
      const endpoint = isEdit
        ? `/api/admin/investors/${existingInvestor.id}`
        : "/api/admin/investors";
      const method = isEdit ? "PATCH" : "POST";
      const res = await apiRequest(method, endpoint, {
        ...data,
        source: "manual",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: isEdit ? "Investor updated" : "Investor created",
        description: isEdit
          ? "The investor record has been updated"
          : "A new investor record has been created",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/investors"] });
      setOpen(false);
      form.reset();
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

  const onSubmit = (data: InvestorFormData) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[rgb(142,132,247)]" data-testid="button-add-investor">
          <UserPlus className="w-4 h-4 mr-2" />
          {isEdit ? "Edit Investor" : "Add Investor"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#1a1a2e] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEdit ? "Edit Investor" : "Add New Investor"}
          </DialogTitle>
          <DialogDescription className="text-white/60">
            {isEdit
              ? "Update the investor's information"
              : "Manually create a new investor record"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">First Name *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="border-white/20 text-white bg-white/5"
                        placeholder="John"
                        data-testid="input-firstName"
                      />
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
                    <FormLabel className="text-white">Last Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="border-white/20 text-white bg-white/5"
                        placeholder="Doe"
                        data-testid="input-lastName"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        className="border-white/20 text-white bg-white/5"
                        placeholder="john@example.com"
                        data-testid="input-email"
                      />
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
                    <FormLabel className="text-white">Phone</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="border-white/20 text-white bg-white/5"
                        placeholder="+1 234 567 8900"
                        data-testid="input-phone"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Job Title</FormLabel>
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
                control={form.control}
                name="linkedinUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">LinkedIn URL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="border-white/20 text-white bg-white/5"
                        placeholder="https://linkedin.com/in/johndoe"
                        data-testid="input-linkedinUrl"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="investorType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Investor Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="border-white/20 text-white bg-white/5" data-testid="select-investorType">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {investorTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="investorState"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="border-white/20 text-white bg-white/5" data-testid="select-investorState">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {investorStates.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fundingStage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Funding Stage</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="border-white/20 text-white bg-white/5" data-testid="select-fundingStage">
                          <SelectValue placeholder="Select stage" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {fundingStages.map((stage) => (
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="typicalInvestment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Typical Check Size</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="border-white/20 text-white bg-white/5"
                        placeholder="$100K - $500K"
                        data-testid="input-typicalInvestment"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Location</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        className="border-white/20 text-white bg-white/5"
                        placeholder="San Francisco, CA"
                        data-testid="input-location"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="bio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">Bio / Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      className="border-white/20 text-white bg-white/5 min-h-[100px]"
                      placeholder="Additional notes about this investor..."
                      data-testid="input-bio"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                disabled={createMutation.isPending}
                className="bg-[rgb(142,132,247)]"
                data-testid="button-save"
              >
                {createMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {isEdit ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
