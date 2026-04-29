import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useDispatch, useSelector } from "react-redux";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  Bot, 
  Send, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2,
  Clock,
  Calendar as CalendarIcon
} from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";

import { HcpSelect } from "@/components/HcpSelect";
import { MultiSelect } from "@/components/MultiSelect";

import { RootState } from "@/app/store";
import { updateDraft, resetDraft } from "@/features/interactionSlice";
import { addMessage, setTyping, setAgentContext, resetAgent } from "@/features/agentSlice";

import { 
  useCreateInteraction, 
  useAgentChat, 
  useAgentDraftFromForm,
  InteractionInput,
  Sentiment,
  SourceMode
} from "@workspace/api-client-react";

// Schema for the form
const formSchema = z.object({
  hcpId: z.string().min(1, "HCP is required").nullable(),
  hcpName: z.string().nullable(),
  interactionType: z.string().min(1, "Type is required").nullable(),
  interactionDate: z.string().min(1, "Date is required").nullable(),
  interactionTime: z.string().nullable(),
  sentiment: z.enum(["positive", "neutral", "negative"]).nullable(),
  topicsDiscussed: z.string().nullable(),
  outcomes: z.string().nullable(),
  followUpActions: z.string().nullable(),
  materialsShared: z.array(z.string()),
  samplesDistributed: z.array(z.string()),
  aiSummary: z.string().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

export default function LogInteraction() {
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const dispatch = useDispatch();
  
  const draft = useSelector((state: RootState) => state.interaction.draft);
  const agentState = useSelector((state: RootState) => state.agent);
  
  const [chatInput, setChatInput] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  
  const createInteraction = useCreateInteraction();
  const agentChat = useAgentChat();
  const agentDraftFromForm = useAgentDraftFromForm();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      hcpId: draft.hcpId || "",
      hcpName: draft.hcpName || "",
      interactionType: draft.interactionType || "",
      interactionDate: draft.interactionDate || format(new Date(), 'yyyy-MM-dd'),
      interactionTime: draft.interactionTime || format(new Date(), 'HH:mm'),
      sentiment: draft.sentiment,
      topicsDiscussed: draft.topicsDiscussed || "",
      outcomes: draft.outcomes || "",
      followUpActions: draft.followUpActions || "",
      materialsShared: draft.materialsShared || [],
      samplesDistributed: draft.samplesDistributed || [],
      aiSummary: draft.aiSummary || "",
    }
  });

  const values = form.watch();

  // Apply AI-driven draft updates from redux into the form. We skip the very
  // first run (which would just re-apply the initial defaults) and only react
  // when the redux draft reference changes (i.e. an AI handler dispatched
  // updateDraft). The form is otherwise the source of truth — we do NOT mirror
  // every keystroke into redux, which would cause an infinite render loop.
  const isFirstDraftSync = useRef(true);
  useEffect(() => {
    if (isFirstDraftSync.current) {
      isFirstDraftSync.current = false;
      return;
    }
    form.reset(
      {
        hcpId: draft.hcpId || "",
        hcpName: draft.hcpName || "",
        interactionType: draft.interactionType || "",
        interactionDate:
          draft.interactionDate || format(new Date(), "yyyy-MM-dd"),
        interactionTime:
          draft.interactionTime || format(new Date(), "HH:mm"),
        sentiment: draft.sentiment,
        topicsDiscussed: draft.topicsDiscussed || "",
        outcomes: draft.outcomes || "",
        followUpActions: draft.followUpActions || "",
        materialsShared: draft.materialsShared || [],
        samplesDistributed: draft.samplesDistributed || [],
        aiSummary: draft.aiSummary || "",
      },
      { keepDirty: false, keepTouched: false },
    );
    // form is stable from useForm; intentionally only depending on draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [agentState.messages, agentState.isTyping]);

  const handleChatSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) return;

    const message = chatInput;
    setChatInput("");
    
    dispatch(addMessage({ role: "user", content: message }));
    dispatch(setTyping(true));

    try {
      const res = await agentChat.mutateAsync({
        data: {
          message,
          formData: form.getValues() as InteractionInput,
          mode: "auto"
        }
      });
      
      dispatch(addMessage({ role: "assistant", content: res.assistantMessage }));
      dispatch(setAgentContext({
        missingFields: res.missingFields,
        followUpSuggestions: res.followUpSuggestions,
        toolTrace: res.toolTrace
      }));

      // If AI produced a new draft, we just show it for them to apply, or if it's safe to auto-apply?
      // The requirement says "Apply AI Draft button fills form fields", so we should let them apply.
      // But if there's a draft in the response, we can update the redux draft so it reflects in the UI.
      if (res.draft) {
        dispatch(updateDraft(res.draft));
        toast({
          title: "Draft updated",
          description: "The AI has updated your interaction draft.",
        });
      }

    } catch (err: any) {
      dispatch(addMessage({ role: "assistant", content: "Sorry, I encountered an error processing that request." }));
      toast({
        title: "Error",
        description: err?.error || "Failed to communicate with agent.",
        variant: "destructive",
      });
    } finally {
      dispatch(setTyping(false));
    }
  };

  const handleGenerateSummary = async () => {
    dispatch(setTyping(true));
    try {
      const res = await agentDraftFromForm.mutateAsync({
        data: form.getValues() as InteractionInput
      });

      if (res.draft) {
        dispatch(updateDraft(res.draft));
        dispatch(setAgentContext({
          missingFields: res.missingFields,
          followUpSuggestions: res.followUpSuggestions,
          toolTrace: res.toolTrace
        }));
        
        if (res.summary) {
           form.setValue("aiSummary", res.summary);
           dispatch(updateDraft({ aiSummary: res.summary }));
        }

        toast({
          title: "Summary generated",
          description: "Form data analyzed successfully.",
        });
      }
    } catch (err: any) {
      toast({
        title: "Generation failed",
        description: err?.error || "Failed to generate summary from form.",
        variant: "destructive",
      });
    } finally {
      dispatch(setTyping(false));
    }
  };

  const onSubmit = async (data: FormValues) => {
    try {
      const mode: SourceMode = agentState.messages.length > 0 ? "hybrid" : "form";
      const result = await createInteraction.mutateAsync({
        data: {
          ...data,
          sourceMode: mode
        } as InteractionInput
      });

      toast({
        title: "Success",
        description: "Interaction logged successfully.",
      });
      
      dispatch(resetDraft());
      dispatch(resetAgent());
      setLocation(`/interactions/${result.id}`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.error || "Failed to save interaction.",
        variant: "destructive",
      });
    }
  };

  const applySuggestion = (action: string) => {
    const currentFollowUp = form.getValues("followUpActions") || "";
    const newFollowUp = currentFollowUp ? `${currentFollowUp}\n- ${action}` : `- ${action}`;
    form.setValue("followUpActions", newFollowUp);
    dispatch(updateDraft({ followUpActions: newFollowUp }));
    toast({ title: "Applied follow-up action" });
  };

  const requiredFieldsPresent = !!(values.hcpId && values.interactionType && values.interactionDate);

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Log Interaction</h1>
          <p className="text-muted-foreground mt-1">Record details via form or AI assistant.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-140px)]">
        
        {/* LEFT COLUMN - FORM */}
        <div className="lg:col-span-7 flex flex-col h-full overflow-hidden">
          <Card className="flex-1 shadow-sm border-muted/60 overflow-y-auto">
            <CardContent className="p-6">
              <form id="interaction-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2 md:col-span-1">
                    <Label>HCP <span className="text-destructive">*</span></Label>
                    <HcpSelect 
                      value={values.hcpId} 
                      onChange={(id, name) => {
                        form.setValue("hcpId", id);
                        form.setValue("hcpName", name);
                      }} 
                    />
                  </div>
                  <div className="space-y-2 col-span-2 md:col-span-1">
                    <Label>Type <span className="text-destructive">*</span></Label>
                    <Select value={values.interactionType || ""} onValueChange={(v) => form.setValue("interactionType", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="In-person Visit">In-person Visit</SelectItem>
                        <SelectItem value="Virtual Meeting">Virtual Meeting</SelectItem>
                        <SelectItem value="Phone Call">Phone Call</SelectItem>
                        <SelectItem value="Email">Email</SelectItem>
                        <SelectItem value="Conference">Conference</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date <span className="text-destructive">*</span></Label>
                    <div className="relative">
                      <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input type="date" className="pl-10" {...form.register("interactionDate")} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Time</Label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input type="time" className="pl-10" {...form.register("interactionTime")} />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Sentiment</Label>
                  <Controller
                    control={form.control}
                    name="sentiment"
                    render={({ field }) => (
                      <ToggleGroup 
                        type="single" 
                        value={field.value || ""} 
                        onValueChange={field.onChange}
                        className="justify-start"
                      >
                        <ToggleGroupItem value="positive" aria-label="Toggle positive" className="data-[state=on]:bg-chart-3/20 data-[state=on]:text-chart-3">
                          Positive
                        </ToggleGroupItem>
                        <ToggleGroupItem value="neutral" aria-label="Toggle neutral" className="data-[state=on]:bg-chart-2/20 data-[state=on]:text-chart-2">
                          Neutral
                        </ToggleGroupItem>
                        <ToggleGroupItem value="negative" aria-label="Toggle negative" className="data-[state=on]:bg-destructive/20 data-[state=on]:text-destructive">
                          Negative
                        </ToggleGroupItem>
                      </ToggleGroup>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Topics Discussed</Label>
                  <Textarea 
                    placeholder="Key points covered..." 
                    className="min-h-[100px]"
                    {...form.register("topicsDiscussed")}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Materials Shared</Label>
                    <Controller
                      control={form.control}
                      name="materialsShared"
                      render={({ field }) => (
                        <MultiSelect 
                          type="materials"
                          selected={field.value}
                          onChange={field.onChange}
                          placeholder="Select materials..."
                        />
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Samples Distributed</Label>
                    <Controller
                      control={form.control}
                      name="samplesDistributed"
                      render={({ field }) => (
                        <MultiSelect 
                          type="samples"
                          selected={field.value}
                          onChange={field.onChange}
                          placeholder="Select samples..."
                        />
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Follow-up Actions</Label>
                  <Textarea 
                    placeholder="Next steps..." 
                    className="min-h-[80px]"
                    {...form.register("followUpActions")}
                  />
                </div>
              </form>
            </CardContent>
          </Card>
          
          <div className="mt-4 flex items-center justify-between bg-card p-4 rounded-xl border border-muted/60 shadow-sm">
            <div className="flex items-center gap-3">
              {requiredFieldsPresent ? (
                <div className="flex items-center text-sm text-chart-3">
                  <CheckCircle2 className="w-4 h-4 mr-1.5" /> Ready to save
                </div>
              ) : (
                <div className="flex items-center text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 mr-1.5" /> Missing required fields
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                onClick={handleGenerateSummary}
                disabled={!requiredFieldsPresent || agentState.isTyping}
              >
                <Sparkles className="w-4 h-4 mr-2 text-primary" />
                Analyze & Summarize
              </Button>
              <Button 
                type="submit" 
                form="interaction-form" 
                disabled={!requiredFieldsPresent || createInteraction.isPending}
              >
                Save Interaction
              </Button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN - CHAT & PREVIEW */}
        <div className="lg:col-span-5 flex flex-col h-full gap-4">
          
          {/* Agent Output Cards (if any) */}
          {(values.aiSummary || agentState.followUpSuggestions.length > 0 || agentState.missingFields.length > 0) && (
            <Card className="border-primary/20 bg-primary/5 shadow-sm shrink-0">
              <CardContent className="p-4 space-y-4">
                {agentState.missingFields.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {agentState.missingFields.map(f => (
                      <Badge key={f} variant="destructive" className="bg-destructive/10 text-destructive border-none">
                        Missing: {f}
                      </Badge>
                    ))}
                  </div>
                )}
                
                {values.aiSummary && (
                  <div className="space-y-1">
                    <Label className="text-xs text-primary/80 font-semibold uppercase tracking-wider flex items-center">
                      <Sparkles className="w-3 h-3 mr-1" /> AI Summary
                    </Label>
                    <p className="text-sm">{values.aiSummary}</p>
                  </div>
                )}

                {agentState.followUpSuggestions.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-primary/10">
                    <Label className="text-xs text-primary/80 font-semibold uppercase tracking-wider">Suggested Follow-ups</Label>
                    <div className="space-y-2">
                      {agentState.followUpSuggestions.map((sug, i) => (
                        <div key={i} className="bg-background border rounded-md p-3 text-sm flex justify-between items-center gap-4">
                          <div className="flex-1">
                            <div className="font-medium">{sug.action}</div>
                            {sug.rationale && <div className="text-xs text-muted-foreground mt-0.5">{sug.rationale}</div>}
                          </div>
                          <Button size="sm" variant="secondary" onClick={() => applySuggestion(sug.action)}>
                            Apply
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {agentState.toolTrace?.length > 0 && (
                  <div className="pt-2">
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer hover:text-foreground">Agent Trace</summary>
                      <ul className="mt-2 space-y-1 pl-4 list-disc opacity-70">
                        {agentState.toolTrace.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </details>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Chat Interface */}
          <Card className="flex-1 flex flex-col overflow-hidden shadow-sm border-muted/60">
            <CardHeader className="py-4 border-b bg-muted/20">
              <CardTitle className="text-lg flex items-center">
                <Bot className="w-5 h-5 mr-2 text-primary" />
                AI Assistant
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
              <ScrollArea className="flex-1 p-4" ref={chatScrollRef}>
                <div className="space-y-4">
                  {agentState.messages.length === 0 && (
                    <div className="text-center text-muted-foreground text-sm mt-8 space-y-2">
                      <Bot className="w-10 h-10 mx-auto opacity-20" />
                      <p>Type your interaction notes here.</p>
                      <p className="text-xs">I'll automatically fill out the form for you.</p>
                    </div>
                  )}
                  {agentState.messages.map((m) => (
                    <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                        m.role === 'user' 
                          ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                          : 'bg-muted rounded-tl-sm'
                      }`}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {agentState.isTyping && (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-muted rounded-tl-sm flex gap-1">
                        <div className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
            <CardFooter className="p-3 border-t bg-background">
              <form onSubmit={handleChatSubmit} className="flex w-full gap-2 relative">
                <Input 
                  placeholder="Dictate or type notes..." 
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  className="pr-10 bg-muted/50 border-transparent focus-visible:bg-background"
                  disabled={agentState.isTyping}
                />
                <Button 
                  type="submit" 
                  size="icon" 
                  className="absolute right-1 top-1 bottom-1 h-8 w-8"
                  disabled={!chatInput.trim() || agentState.isTyping}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </CardFooter>
          </Card>

        </div>
      </div>
    </div>
  );
}
