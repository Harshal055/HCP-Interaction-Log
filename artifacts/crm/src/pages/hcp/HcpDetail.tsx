import { useRoute } from "wouter";
import { useGetHcp, getGetHcpQueryKey } from "@workspace/api-client-react";
import { Building, MapPin, Briefcase, Mail, Phone, Calendar, ArrowLeft, MessageSquarePlus } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function HcpDetail() {
  const [, params] = useRoute("/hcps/:id");
  const id = params?.id || "";

  const { data: hcp, isLoading, isError } = useGetHcp(id, {
    query: {
      enabled: !!id,
      queryKey: getGetHcpQueryKey(id),
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-8 w-24" />
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-6">
              <Skeleton className="h-24 w-24 rounded-full" />
              <div className="space-y-4 flex-1">
                <Skeleton className="h-8 w-1/3" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !hcp) {
    return (
      <div className="p-6 md:p-8 text-center space-y-4">
        <h2 className="text-xl font-semibold">HCP not found</h2>
        <Link href="/hcps">
          <Button variant="outline">Back to Directory</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
      <Link href="/hcps">
        <Button variant="ghost" size="sm" className="-ml-4 text-muted-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Directory
        </Button>
      </Link>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold">
            {hcp.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{hcp.name}</h1>
            <div className="text-muted-foreground mt-1 flex items-center gap-2">
              {hcp.specialty && <span>{hcp.specialty}</span>}
              {hcp.specialty && hcp.institution && <span>•</span>}
              {hcp.institution && <span>{hcp.institution}</span>}
            </div>
          </div>
        </div>
        <Link href={`/log?hcpId=${hcp.id}`}>
          <Button>
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            Log Interaction
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          <Card className="shadow-sm border-muted/60">
            <CardHeader>
              <CardTitle className="text-lg">Contact Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {hcp.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${hcp.email}`} className="hover:underline">{hcp.email}</a>
                </div>
              )}
              {hcp.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${hcp.phone}`} className="hover:underline">{hcp.phone}</a>
                </div>
              )}
              {hcp.territory && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{hcp.territory}</span>
                </div>
              )}
              {hcp.institution && (
                <div className="flex items-center gap-3">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <span>{hcp.institution}</span>
                </div>
              )}
              {hcp.specialty && (
                <div className="flex items-center gap-3">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  <span>{hcp.specialty}</span>
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card className="shadow-sm border-muted/60">
            <CardContent className="p-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">{hcp.interactionCount}</div>
                <div className="text-sm text-muted-foreground mt-1">Total Interactions</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-6">
          <h2 className="text-xl font-bold tracking-tight">Recent Interactions</h2>
          
          {hcp.recentInteractions?.length === 0 ? (
            <Card className="border-dashed bg-transparent shadow-none">
              <CardContent className="p-12 text-center text-muted-foreground">
                No interactions logged yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {hcp.recentInteractions?.map(interaction => (
                <Card key={interaction.id} className="shadow-sm border-muted/60">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-background">
                          {interaction.interactionType || "Interaction"}
                        </Badge>
                        <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                          <Calendar className="h-4 w-4" />
                          {interaction.interactionDate ? format(new Date(interaction.interactionDate), 'MMMM d, yyyy') : "No date"}
                          {interaction.interactionTime && ` at ${interaction.interactionTime}`}
                        </div>
                      </div>
                      <Link href={`/interactions/${interaction.id}`}>
                        <Button variant="ghost" size="sm">View</Button>
                      </Link>
                    </div>

                    <div className="space-y-4">
                      {interaction.topicsDiscussed && (
                        <div>
                          <div className="text-sm font-medium mb-1">Topics Discussed</div>
                          <p className="text-sm text-muted-foreground">{interaction.topicsDiscussed}</p>
                        </div>
                      )}
                      
                      {interaction.aiSummary && (
                        <div className="bg-muted/50 p-4 rounded-md border text-sm">
                          <div className="font-medium mb-2 flex items-center gap-2">
                            Summary
                          </div>
                          <p className="text-muted-foreground">{interaction.aiSummary}</p>
                        </div>
                      )}

                      {(interaction.materialsShared?.length > 0 || interaction.samplesDistributed?.length > 0) && (
                        <div className="flex flex-wrap gap-4 pt-2">
                          {interaction.materialsShared?.length > 0 && (
                            <div>
                              <div className="text-xs font-medium mb-1.5 text-muted-foreground">Materials Shared</div>
                              <div className="flex flex-wrap gap-1.5">
                                {interaction.materialsShared.map(m => (
                                  <Badge key={m} variant="secondary" className="text-xs font-normal bg-secondary/50">{m}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {interaction.samplesDistributed?.length > 0 && (
                            <div>
                              <div className="text-xs font-medium mb-1.5 text-muted-foreground">Samples Distributed</div>
                              <div className="flex flex-wrap gap-1.5">
                                {interaction.samplesDistributed.map(s => (
                                  <Badge key={s} variant="secondary" className="text-xs font-normal bg-secondary/50">{s}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
