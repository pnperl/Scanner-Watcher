import { useCreateScanner, getListScannersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  chartinkUrl: z.string().url("Must be a valid URL"),
  intervalMinutes: z.coerce.number().min(1).max(1440),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

export default function NewScanner() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createScanner = useCreateScanner();

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

  function onSubmit(values: z.infer<typeof formSchema>) {
    createScanner.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({ title: "Scanner created successfully" });
          queryClient.invalidateQueries({ queryKey: getListScannersQueryKey() });
          setLocation("/scanners");
        },
        onError: () => {
          toast({ title: "Failed to create scanner", variant: "destructive" });
        },
      },
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-[color:var(--terminal-border-soft)]">
        <Link href="/scanners">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight uppercase font-mono">New Scanner</h1>
          <p className="text-muted-foreground text-xs font-mono uppercase tracking-wider mt-0.5">
            Add a Chartink screener to monitor
          </p>
        </div>
      </div>

      <div className="bg-[hsl(var(--terminal-panel))] border border-[color:var(--terminal-border-soft)] p-5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-5">
          Scanner Configuration
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
                      placeholder="e.g. Volume Breakout"
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
                      placeholder="https://chartink.com/screener/..."
                      {...field}
                      className="bg-background/60 rounded-none border-[color:var(--terminal-border-soft)] font-mono text-xs"
                    />
                  </FormControl>
                  <FormDescription className="text-[10px] font-mono text-muted-foreground">
                    The URL of your Chartink screener page.
                  </FormDescription>
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
                  <FormLabel className="text-xs font-mono uppercase tracking-wider">
                    Description (Optional)
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What does this scanner look for?"
                      className="resize-none bg-background/60 rounded-none border-[color:var(--terminal-border-soft)] font-mono text-sm"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-3 border-t border-[color:var(--terminal-border-soft)]">
              <Link href="/scanners">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-none font-mono text-xs uppercase"
                >
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                size="sm"
                disabled={createScanner.isPending}
                className="rounded-none font-mono text-xs uppercase"
              >
                {createScanner.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Save Scanner
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
