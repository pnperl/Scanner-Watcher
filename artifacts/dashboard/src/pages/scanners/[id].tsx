import { useGetScanner, getGetScannerQueryKey, useUpdateScanner, useDeleteScanner, useTriggerScan, getListScannersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Play, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { useEffect } from "react";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  chartinkUrl: z.string().url("Must be a valid URL"),
  intervalMinutes: z.coerce.number().min(1).max(1440),
  description: z.string().optional().nullable(),
  isActive: z.boolean(),
});

export default function ScannerDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: scanner, isLoading } = useGetScanner(id, {
    query: {
      enabled: !!id,
      queryKey: getGetScannerQueryKey(id),
    }
  });

  const updateScanner = useUpdateScanner();
  const deleteScanner = useDeleteScanner();
  const triggerScan = useTriggerScan();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      chartinkUrl: "",
      intervalMinutes: 5,
      description: "",
      isActive: true,
    },
  });

  useEffect(() => {
    if (scanner) {
      form.reset({
        name: scanner.name,
        chartinkUrl: scanner.chartinkUrl,
        intervalMinutes: scanner.intervalMinutes,
        description: scanner.description || "",
        isActive: scanner.isActive,
      });
    }
  }, [scanner, form]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    updateScanner.mutate({ id, data: values }, {
      onSuccess: () => {
        toast({ title: "Scanner updated successfully" });
        queryClient.invalidateQueries({ queryKey: getGetScannerQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListScannersQueryKey() });
      },
      onError: () => {
        toast({ title: "Failed to update scanner", variant: "destructive" });
      }
    });
  }

  function handleDelete() {
    if (confirm("Are you sure you want to delete this scanner?")) {
      deleteScanner.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Scanner deleted" });
          queryClient.invalidateQueries({ queryKey: getListScannersQueryKey() });
          setLocation("/scanners");
        }
      });
    }
  }

  function handleManualScan() {
    triggerScan.mutate({ id }, {
      onSuccess: (data) => {
        toast({ 
          title: "Scan Completed", 
          description: `Found ${data.stocksFound} stocks, ${data.newAlerts} new alerts triggered.` 
        });
        queryClient.invalidateQueries({ queryKey: getGetScannerQueryKey(id) });
      }
    });
  }

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;
  if (!scanner) return <div className="p-8 text-center text-muted-foreground">Scanner not found.</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/scanners">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{scanner.name}</h1>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="gap-2" onClick={handleManualScan} disabled={triggerScan.isPending}>
            {triggerScan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Scan Now
          </Button>
          <Button variant="destructive" size="icon" className="h-8 w-8" onClick={handleDelete} disabled={deleteScanner.isPending}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>Update scanner settings and parameters.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} className="bg-background" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="chartinkUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chartink Webhook URL / Scanner URL</FormLabel>
                    <FormControl>
                      <Input {...field} className="bg-background font-mono text-sm" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="intervalMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Poll Interval (Minutes)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} className="bg-background" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3 shadow-sm bg-background mt-8">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active</FormLabel>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea className="resize-none bg-background" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-4 pt-4 border-t border-border">
                <Button type="submit" disabled={updateScanner.isPending || !form.formState.isDirty}>
                  {updateScanner.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}