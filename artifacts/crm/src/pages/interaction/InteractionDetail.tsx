import { useState, useEffect, useRef } from "react";
import { useRoute, Link } from "wouter";
import { 
  useGetInteraction, 
  useListInteractionAudit,
  useUpdateInteraction,
  useAgentChat,
  getGetInteractionQueryKey,
  getListInteractionAuditQueryKey,
  InteractionInput,
  Sentiment
} from "@workspace/api-client-react";
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  FileText, 
  PackageOpen, 
  Bot, 
  Send,
  History,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

export default function InteractionDetail() {
  const [, params] = useRoute("/interactions/:id");
  const id = params?.id || "";
  const { toast } = useToast();

  const { data: interaction, isLoading, isError, refetch } = useGetInteraction(id, {
    query: { enabled: !!id, queryKey: getGetInteractionQueryKey(id) }
  });

  const { data: auditLogs } = useListInteractionAudit(id, {
    query: { enabled: !!id, queryKey: getListInteractionAuditQueryKey(id) }
  });

  const updateInteraction = useUpdateInteraction();
  const agentChat = useAgentChat();

  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<{id: string, role: string, content: string}[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [proposedDraft, setProposedDraft] = useState<InteractionInput | null>(null);
  const [changeSummary, setChangeSummary] = useState<string | null>(null);

  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const message = chatInput;
    setChatInput("");
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "user", content: message }]);
    setIsTyping(true);

    try {
      const res = await agentChat.mutateAsync({
        data: {
          message,
          existingInteractionId: id,
          mode: "edit"
        }
      });

      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: res.assistantMessage }]);
      
      if (res.draft) {
        setProposedDraft(res.draft);
        if (res.changeSummary) {
          setChangeSummary(res.changeSummary);
        }
      }

    } catch (err: any) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: "Failed to process edit request." }]);
      toast({
        title: "Error",
        description: err?.error || "Agent communication failed.",
        variant: "destructive"
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleApplyChanges = async () => {
    if (!proposedDraft) return;

    try {
      await updateInteraction.mutateAsync({
        id,
        data: proposedDraft
      });
      
      toast({ title: "Updated successfully", description: "The interaction was updated via AI." });
      setProposedDraft(null);
      setChangeSummary(null);
      refetch(); // Reload the data
    } catch (err: any) {
      toast({
        title: "Update failed",
        description: err?.error || "Could not save changes.",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-8 w-24" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <Skeleton className="lg:col-span-8 h-[600px]" />
          <Skeleton className="lg:col-span-4 h-[600px]" />
        </div>
      </div>
    );
  }

  if (isError || !interaction) {
    return (
      <div className="p-6 md:p-8 text-center space-y-4">
        <h2 className="text-xl font-semibold">Interaction not found</h2>
        <Link href="/interactions">
          <Button variant="outline">Back to History</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <Link href="/interactions">
        <Button variant="ghost" size="sm" className="-ml-4 mb-4 text-muted-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to History
        </Button>
      </Link>

      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight">
              {interaction.hcpName || "Unknown HCP"}
            </h1>
            <Badge variant="outline" className="text-sm">
              {interaction.interactionType}
            </Badge>
          </div>
          <div className="text-muted-foreground flex items-center gap-4 text-sm">
            <span className="flex items-center"><Calendar className="w-4 h-4 mr-1.5" /> {interaction.interactionDate}</span>
            {interaction.interactionTime && <span className="flex items-center"><Clock className="w-4 h-4 mr-1.5" /> {interaction.interactionTime}</span>}
          </div>
        </div>
        
        {interaction.sentiment && (
          <Badge variant="secondary" className={`text-sm px-3 py-1 ${
            interaction.sentiment === 'positive' ? 'text-chart-3 bg-chart-3/10' :
            interaction.sentiment === 'negative' ? 'text-destructive bg-destructive/10' :
            'text-muted-foreground'
          }`}>
            {interaction.sentiment.charAt(0).toUpperCase() + interaction.sentiment.slice(1)} Sentiment
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN - DETAILS */}
        <div className="lg:col-span-8 space-y-6">
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0">
              <TabsTrigger value="details" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none pb-3 pt-2">
                Details
              </TabsTrigger>
              <TabsTrigger value="audit" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none pb-3 pt-2">
                <History className="w-4 h-4 mr-2" /> Audit Log
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="details" className="pt-6 space-y-6">
              <Card className="shadow-sm border-muted/60">
                <CardContent className="p-6 space-y-6">
                  {interaction.aiSummary && (
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-5">
                      <h3 className="font-semibold text-primary mb-2 flex items-center">
                        <Bot className="w-4 h-4 mr-2" /> AI Summary
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{interaction.aiSummary}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium text-sm text-muted-foreground mb-2">Topics Discussed</h4>
                        <p className="text-sm">{interaction.topicsDiscussed || "None recorded."}</p>
                      </div>
                      
                      <div>
                        <h4 className="font-medium text-sm text-muted-foreground mb-2">Outcomes</h4>
                        <p className="text-sm">{interaction.outcomes || "None recorded."}</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      {(interaction.materialsShared.length > 0 || interaction.samplesDistributed.length > 0) && (
                        <div>
                          <h4 className="font-medium text-sm text-muted-foreground mb-3">Resources Shared</h4>
                          <div className="space-y-3">
                            {interaction.materialsShared.length > 0 && (
                              <div className="flex gap-2 items-start">
                                <FileText className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                <div className="flex flex-wrap gap-1.5">
                                  {interaction.materialsShared.map(m => (
                                    <Badge key={m} variant="secondary" className="font-normal">{m}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {interaction.samplesDistributed.length > 0 && (
                              <div className="flex gap-2 items-start">
                                <PackageOpen className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                                <div className="flex flex-wrap gap-1.5">
                                  {interaction.samplesDistributed.map(s => (
                                    <Badge key={s} variant="outline" className="font-normal border-primary/20">{s}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div>
                        <h4 className="font-medium text-sm text-muted-foreground mb-2">Follow-up Actions</h4>
                        {interaction.followUpActions ? (
                          <div className="text-sm whitespace-pre-line bg-muted/30 p-3 rounded-md border">
                            {interaction.followUpActions}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">None required.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="audit" className="pt-6">
              <Card className="shadow-sm border-muted/60">
                <CardContent className="p-6">
                  {auditLogs?.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">No history recorded.</div>
                  ) : (
                    <div className="space-y-6">
                      {auditLogs?.map(log => (
                        <div key={log.id} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                            <div className="w-px h-full bg-border my-1" />
                          </div>
                          <div className="pb-4 flex-1">
                            <div className="flex justify-between items-start mb-1">
                              <div className="font-medium text-sm capitalize">{log.actionType}</div>
                              <div className="text-xs text-muted-foreground">
                                {format(new Date(log.createdAt), 'MMM d, yyyy h:mm a')}
                              </div>
                            </div>
                            {log.changeSummary && (
                              <div className="text-sm text-muted-foreground bg-muted/30 p-2 rounded mt-2 border">
                                {log.changeSummary}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* RIGHT COLUMN - EDIT WITH AI */}
        <div className="lg:col-span-4 flex flex-col h-[600px]">
          <Card className="flex-1 flex flex-col overflow-hidden shadow-sm border-muted/60">
            <CardHeader className="py-4 border-b bg-muted/20">
              <CardTitle className="text-lg flex items-center">
                <Bot className="w-5 h-5 mr-2 text-primary" />
                Edit with AI
              </CardTitle>
              <CardDescription>Ask me to update details, add materials, or fix errors.</CardDescription>
            </CardHeader>
            
            <CardContent className="flex-1 p-0 overflow-hidden flex flex-col relative">
              <ScrollArea className="flex-1 p-4" ref={chatScrollRef}>
                <div className="space-y-4">
                  {messages.length === 0 && (
                    <div className="text-center text-muted-foreground text-sm mt-8 space-y-2">
                      <p>"Change sentiment to neutral and add Product X brochure."</p>
                    </div>
                  )}
                  {messages.map((m) => (
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
                  {isTyping && (
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

              {/* Proposed Changes Panel overlaying bottom of chat */}
              {proposedDraft && (
                <div className="absolute bottom-0 left-0 right-0 bg-background border-t shadow-[0_-10px_20px_rgba(0,0,0,0.05)] p-4 animate-in slide-in-from-bottom-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center text-sm font-semibold text-primary">
                      <CheckCircle2 className="w-4 h-4 mr-1.5" /> Proposed Updates
                    </div>
                  </div>
                  {changeSummary && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{changeSummary}</p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => setProposedDraft(null)}>Cancel</Button>
                    <Button className="flex-1" onClick={handleApplyChanges}>Apply Updates</Button>
                  </div>
                </div>
              )}
            </CardContent>

            <CardFooter className="p-3 border-t bg-background">
              <form onSubmit={handleChatSubmit} className="flex w-full gap-2 relative">
                <Input 
                  placeholder="Ask for an edit..." 
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  className="pr-10 bg-muted/50 border-transparent focus-visible:bg-background"
                  disabled={isTyping || proposedDraft !== null}
                />
                <Button 
                  type="submit" 
                  size="icon" 
                  className="absolute right-1 top-1 bottom-1 h-8 w-8"
                  disabled={!chatInput.trim() || isTyping || proposedDraft !== null}
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
