import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { 
  useListInteractions, 
  ListInteractionsParams 
} from "@workspace/api-client-react";
import { Search, Calendar, FileText, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

export default function InteractionsList() {
  const [search, setSearch] = useState("");
  // In a real app we might want debounced search for an endpoint that supports it,
  // but listInteractions only takes hcpId. We will filter client-side for simplicity.
  const { data: interactions, isLoading } = useListInteractions();

  const filtered = interactions?.filter(int => 
    !search || 
    int.hcpName?.toLowerCase().includes(search.toLowerCase()) || 
    int.interactionType?.toLowerCase().includes(search.toLowerCase()) ||
    int.topicsDiscussed?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Interaction History</h1>
          <p className="text-muted-foreground mt-1">Review all past interactions.</p>
        </div>
        <Link href="/log">
          <Button>Log Interaction</Button>
        </Link>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Filter by HCP, type, or topic..." 
          className="pl-10 bg-background"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filtered?.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card border-dashed">
          <p className="text-muted-foreground">No interactions found.</p>
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in duration-500">
          {filtered?.map((interaction) => (
            <Link key={interaction.id} href={`/interactions/${interaction.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer border-muted/60 shadow-sm">
                <CardContent className="p-4 md:p-6 flex flex-col md:flex-row md:items-center gap-4">
                  
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{interaction.hcpName || "Unknown HCP"}</h3>
                      <Badge variant="outline" className="bg-background">
                        {interaction.interactionType || "Meeting"}
                      </Badge>
                      {interaction.sentiment && (
                        <Badge variant="secondary" className={
                          interaction.sentiment === 'positive' ? 'text-chart-3 bg-chart-3/10 hover:bg-chart-3/20' :
                          interaction.sentiment === 'negative' ? 'text-destructive bg-destructive/10 hover:bg-destructive/20' :
                          'text-muted-foreground'
                        }>
                          {interaction.sentiment}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" />
                        {interaction.interactionDate ? format(new Date(interaction.interactionDate), 'MMM d, yyyy') : "No date"}
                      </div>
                      {interaction.topicsDiscussed && (
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-4 w-4" />
                          <span className="line-clamp-1 max-w-[300px]">
                            {interaction.topicsDiscussed}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center justify-between md:flex-col md:items-end gap-2 text-xs">
                    {interaction.sourceMode === 'chat' && <Badge variant="outline">AI Chat</Badge>}
                    {interaction.sourceMode === 'hybrid' && <Badge variant="outline">Hybrid</Badge>}
                    <span className="text-muted-foreground">
                      Logged {format(new Date(interaction.createdAt), 'MMM d')}
                    </span>
                  </div>

                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
