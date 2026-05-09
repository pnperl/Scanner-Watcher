import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { getGetTelegramConfigQueryKey, useGetTelegramConfig, useUpdateTelegramConfig, useTestTelegramConfig } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send } from "lucide-react";

const formSchema = z.object({
  botToken: z.string().min(1, "Bot token is required"),
  chatId: z.string().min(1, "Chat ID is required"),
});

export default function ConfigPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
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
      form.reset({
        botToken: "",
        chatId: "",
      });
    }
  }, [config, form]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    updateConfig.mutate({ data: values }, {
      onSuccess: () => {
        toast({ title: "Telegram config saved" });
        queryClient.invalidateQueries({ queryKey: getGetTelegramConfigQueryKey() });
      },
      onError: () => {
        toast({ title: "Failed to save Telegram config", variant: "destructive" });
      },
    });
  }

  function handleTest() {
    testConfig.mutate(undefined, {
      onSuccess: (result) => {
        toast({ title: result.success ? "Test notification sent" : "Test notification failed", description: result.message });
      },
      onError: () => {
        toast({ title: "Failed to send test notification", variant: "destructive" });
      },
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuration</h1>
        <p className="text-muted-foreground text-sm font-mono mt-1">Manage Telegram delivery settings</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Telegram</CardTitle>
          <CardDescription>Configure alert delivery and send a test notification.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 text-sm text-muted-foreground">
            <div>Configured: {config?.enabled ? "Yes" : "No"}</div>
            <div>Bot token: {config?.hasBotToken ? `Present (${config.botTokenLast4 ?? ""})` : "Missing"}</div>
            <div>Chat ID: {config?.hasChatId ? `Present (${config.chatIdMasked ?? ""})` : "Missing"}</div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="botToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telegram Bot Token</FormLabel>
                    <FormControl>
                      <Input placeholder="123456:ABC..." {...field} className="bg-background font-mono" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="chatId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telegram Chat ID</FormLabel>
                    <FormControl>
                      <Input placeholder="-1001234567890" {...field} className="bg-background font-mono" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Configuration
                </Button>
                <Button type="button" variant="secondary" onClick={handleTest} disabled={isLoading}>
                  <Send className="mr-2 h-4 w-4" />
                  Send Test Notification
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}