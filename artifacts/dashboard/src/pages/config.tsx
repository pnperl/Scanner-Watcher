import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetTelegramConfigQueryKey,
  useGetTelegramConfig,
  useUpdateTelegramConfig,
  useTestTelegramConfig,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, CheckCircle2, XCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const formSchema = z.object({
  botToken: z.string().min(1, "Bot token is required"),
  chatId: z.string().min(1, "Chat ID is required"),
});

const themeOptions = [
  { value: "theme-bloomberg", label: "Bloomberg" },
  { value: "theme-emerald", label: "Emerald" },
  { value: "theme-amber", label: "Amber" },
  { value: "theme-cobalt", label: "Cobalt" },
] as const;

type Theme = typeof themeOptions[number]["value"];

export default function ConfigPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("chartink-theme") as Theme | null;
    return saved && themeOptions.some((o) => o.value === saved) ? saved : "theme-bloomberg";
  });

  const { data: config, isLoading } = useGetTelegramConfig({
    query: {
      queryKey: getGetTelegramConfigQueryKey(),
      refetchInterval: 30000,
    },
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { botToken: "", chatId: "" },
  });

  const updateConfig = useUpdateTelegramConfig();
  const testConfig = useTestTelegramConfig();

  useEffect(() => {
    if (config) {
      form.reset({ botToken: "", chatId: "" });
    }
  }, [config, form]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(...themeOptions.map((o) => o.value));
    root.classList.add(theme);
    localStorage.setItem("chartink-theme", theme);
  }, [theme]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    updateConfig.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({ title: "Telegram config saved" });
          queryClient.invalidateQueries({ queryKey: getGetTelegramConfigQueryKey() });
        },
        onError: () => {
          toast({ title: "Failed to save Telegram config", variant: "destructive" });
        },
      },
    );
  }

  function handleTest() {
    testConfig.mutate(undefined, {
      onSuccess: (result) => {
        toast({
          title: result.success ? "Test notification sent" : "Test notification failed",
          description: result.message,
        });
      },
      onError: () => {
        toast({ title: "Failed to send test notification", variant: "destructive" });
      },
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="pb-4 border-b border-[color:var(--terminal-border-soft)]">
        <h1 className="text-2xl font-bold tracking-tight uppercase font-mono">Configuration</h1>
        <p className="text-muted-foreground text-xs font-mono uppercase tracking-wider mt-0.5">
          Manage Telegram delivery settings
        </p>
      </div>

      <div className="bg-[hsl(var(--terminal-panel))] border border-[color:var(--terminal-border-soft)] p-5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
          UI Mode
        </div>
        <Select value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          <SelectTrigger className="rounded-none bg-background/60 border-[color:var(--terminal-border-soft)] font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {themeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value} className="font-mono text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Current status panel */}
      <div className="bg-[hsl(var(--terminal-panel))] border border-[color:var(--terminal-border-soft)] p-5 space-y-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
          Current Status
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-4 bg-muted/30 animate-pulse rounded-none" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <StatusRow
              label="Configured"
              ok={!!config?.enabled}
              text={config?.enabled ? "Yes" : "No"}
            />
            <StatusRow
              label="Bot Token"
              ok={!!config?.hasBotToken}
              text={
                config?.hasBotToken
                  ? `Present (…${config.botTokenLast4 ?? ""})`
                  : "Missing"
              }
            />
            <StatusRow
              label="Chat ID"
              ok={!!config?.hasChatId}
              text={
                config?.hasChatId
                  ? `Present (${config.chatIdMasked ?? ""})`
                  : "Missing"
              }
            />
          </div>
        )}
      </div>

      {/* Form */}
      <div className="bg-[hsl(var(--terminal-panel))] border border-[color:var(--terminal-border-soft)] p-5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-4">
          Update Credentials
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="botToken"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-mono uppercase tracking-wider">
                    Telegram Bot Token
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                      {...field}
                      className="bg-background/60 font-mono text-sm rounded-none border-[color:var(--terminal-border-soft)] focus-visible:ring-primary"
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="chatId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-mono uppercase tracking-wider">
                    Telegram Chat ID
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="-1001234567890"
                      {...field}
                      className="bg-background/60 font-mono text-sm rounded-none border-[color:var(--terminal-border-soft)] focus-visible:ring-primary"
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            <div className="flex gap-3 pt-1">
              <Button
                type="submit"
                size="sm"
                disabled={updateConfig.isPending}
                className="rounded-none font-mono text-xs uppercase"
              >
                {updateConfig.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Save Configuration
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleTest}
                disabled={testConfig.isPending || isLoading}
                className="rounded-none font-mono text-xs uppercase gap-2"
              >
                {testConfig.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Send Test Notification
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  ok,
  text,
}: {
  label: string;
  ok: boolean;
  text: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm font-mono">
      <span className="text-muted-foreground text-xs uppercase tracking-wider">{label}</span>
      <span className="flex items-center gap-1.5">
        {ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
        )}
        <span className={`text-xs ${ok ? "text-foreground" : "text-muted-foreground"}`}>{text}</span>
      </span>
    </div>
  );
}
