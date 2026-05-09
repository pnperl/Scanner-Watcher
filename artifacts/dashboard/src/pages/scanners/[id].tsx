import { useEffect } from "react";
import {
  useGetScanner, getGetScannerQueryKey,
  useUpdateScanner, useDeleteScanner, useTriggerScan,
  getListScannersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Play, Trash2 } from "lucide-react";
import { format } from "date-fns";

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
    query: { enabled: !!id, queryKey: getGetScannerQueryKey(id) },
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
    updateScanner.mutate(
      { id, data: values },
      {
        onSuccess: () => {
          toast({ title: "Scanner updated successfully" });
          queryClient.invalidateQueries({ queryKey: getGetScannerQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListScannersQueryKey() });
        },
        onError: () => toast({ title: "Failed to update scanner", variant: "destructive" }),
      },
    );
  }

  function handleDelete() {
    if (!confirm("Delete this scanner? This cannot be undone.")) return;
    deleteScanner.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Scanner deleted" });
          queryClient.invalidateQueries({ queryKey: getListScannersQueryKey() });
          setLocation("/scanners");
        },
      },
    );
  }

  function handleManualScan() {
    triggerScan.mutate(
      { id },
      {
        onSuccess: (data) => {
          toast({
            title: "Scan completed",
            description: `Found ${data.stocksFound} stocks, ${data.newAlerts} new alerts triggered.`,
          });
          queryClient.invalidateQueries({ queryKey: getGetScannerQueryKey(id) });
        },
      },
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-3 animate-pulse">
        <div className="h-8 bg-muted/30 w-48 rounded-none" />
        <div className="h-64 bg-muted/20 rounded-none" />
      </div>
    );
  }
  if (!scanner) {
    return (
      <div className="p-8 text-center text-muted-foreground font-mono text-sm uppercase tracking-wider">
        Scanner not found.
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between pb-4 border-b border-[color:var(--terminal-border-soft)]">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/scanners">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-2xl font-bold tracking-tight uppercase font-mono truncate">
                {scanner.name}
              </h1>
              <Badge
                variant="outline"
                className={`rounded-none text-[9px] font-mono shrink-0 ${
                  scanner.isActive
                    ? "border-green-500/40 text-green-500"
                    : "border-muted-foreground/30 text-muted-foreground"
                }`}
              >
                {scanner.isActive ? "ACTIVE" : "PAUSED"}
              </Badge>
            </div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Last scan:{" "}
              {scanner.lastScannedAt
                ? format(new Date(scanner.lastScannedAt), "MMM d, HH:mm:ss")
                : "Never"}
            </p>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            className="gap-2 rounded-none text-xs font-mono uppercase"
            onClick={handleManualScan}
            disabled={triggerScan.isPending}
          >
            {triggerScan.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Scan Now
          </Button>
          <Button
            variant="destructive"
            size="icon"
            className="h-8 w-8 rounded-none"
            onClick={handleDelete}
            disabled={deleteScanner.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Edit form */}
      <div className="bg-[hsl(var(--terminal-panel))] border border-[color:var(--terminal-border-soft)] p-5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-5">
          Configuration
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-mono uppercase tracking-wider">Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      className="bg-background/60 rounded-none border-[color:var(--terminal-border-soft)] font-mono text-sm"
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="chartinkUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-mono uppercase tracking-wider">
                    Chartink Scanner URL
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      className="bg-background/60 rounded-none border-[color:var(--terminal-border-soft)] font-mono text-xs"
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-5">
              <FormField
                control={form.control}
                name="intervalMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-mono uppercase tracking-wider">
                      Poll Interval (min)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        className="bg-background/60 rounded-none border-[color:var(--terminal-border-soft)] font-mono"
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between border border-[color:var(--terminal-border-soft)] px-3 py-2 bg-background/30 mt-5">
                    <FormLabel className="text-xs font-mono uppercase tracking-wider">Active</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
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
                  <FormLabel className="text-xs font-mono uppercase tracking-wider">Description</FormLabel>
                  <FormControl>
                    <Textarea
                      className="resize-none bg-background/60 rounded-none border-[color:var(--terminal-border-soft)] font-mono text-sm"
                      rows={3}
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-3 border-t border-[color:var(--terminal-border-soft)]">
              <Button
                type="submit"
                size="sm"
                disabled={updateScanner.isPending || !form.formState.isDirty}
                className="rounded-none font-mono text-xs uppercase"
              >
                {updateScanner.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
