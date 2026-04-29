import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Link } from "wouter";
import { 
  Users, 
  MessageSquarePlus, 
  List, 
  AlertCircle,
  TrendingUp,
  Activity
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: summary, isLoading, isError } = useGetDashboardSummary();

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <h2 className="text-xl font-semibold">Failed to load dashboard</h2>
          <p className="text-muted-foreground">Please try refreshing the page.</p>
        </div>
      </div>
    );
  }

  const sentimentData = [
    { name: 'Positive', value: summary.sentimentBreakdown.positive, color: 'hsl(var(--chart-3))' },
    { name: 'Neutral', value: summary.sentimentBreakdown.neutral, color: 'hsl(var(--chart-2))' },
    { name: 'Negative', value: summary.sentimentBreakdown.negative, color: 'hsl(var(--destructive))' },
  ].filter(d => d.value > 0);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground mt-1">Here's what's happening with your territory today.</p>
        </div>
        <Link href="/log">
          <Button size="lg" className="shadow-sm">
            <MessageSquarePlus className="mr-2 h-5 w-5" />
            Log New Interaction
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm border-muted/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Interactions</CardTitle>
            <List className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.totalInteractions}</div>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-muted/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">This Week</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{summary.weekInteractions}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-muted/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total HCPs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.totalHcps}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-muted/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Follow-ups</CardTitle>
            <AlertCircle className="h-4 w-4 text-chart-4" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.pendingFollowUps}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm border-muted/60 flex flex-col">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Your latest interactions and notes</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {summary.recentActivity.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground pb-8">
                No recent activity.
              </div>
            ) : (
              <div className="space-y-6">
                {summary.recentActivity.map((activity, i) => (
                  <div key={activity.id} className="flex gap-4 relative">
                    {i !== summary.recentActivity.length - 1 && (
                      <div className="absolute left-[19px] top-10 bottom-[-24px] w-[2px] bg-border/50" />
                    )}
                    <div className="mt-1">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Activity className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium leading-none">
                          Met with {activity.hcpName || 'Unknown HCP'}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(activity.createdAt), 'MMM d, h:mm a')}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {activity.summary || 'No summary available.'}
                      </p>
                      {activity.sentiment && (
                        <div className="mt-2">
                          <Badge variant="outline" className={
                            activity.sentiment === 'positive' ? 'text-chart-3 border-chart-3/30 bg-chart-3/10' :
                            activity.sentiment === 'negative' ? 'text-destructive border-destructive/30 bg-destructive/10' :
                            'text-muted-foreground'
                          }>
                            {activity.sentiment}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="shadow-sm border-muted/60">
            <CardHeader>
              <CardTitle>Sentiment Breakdown</CardTitle>
              <CardDescription>Overall interaction mood</CardDescription>
            </CardHeader>
            <CardContent>
              {sentimentData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground">
                  No data available
                </div>
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sentimentData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {sentimentData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="flex justify-center gap-4 mt-2">
                {sentimentData.map(d => (
                  <div key={d.name} className="flex items-center text-xs">
                    <div className="w-3 h-3 rounded-full mr-1.5" style={{ backgroundColor: d.color }} />
                    <span className="text-muted-foreground">{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-muted/60">
            <CardHeader>
              <CardTitle>Top HCPs</CardTitle>
              <CardDescription>Most frequent interactions</CardDescription>
            </CardHeader>
            <CardContent>
              {summary.topHcps.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  No HCPs available
                </div>
              ) : (
                <div className="space-y-4">
                  {summary.topHcps.map(hcp => (
                    <Link key={hcp.id} href={`/hcps/${hcp.id}`}>
                      <div className="flex items-center justify-between p-2 -mx-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors">
                        <div>
                          <div className="font-medium text-sm">{hcp.name}</div>
                          <div className="text-xs text-muted-foreground">{hcp.specialty}</div>
                        </div>
                        <Badge variant="secondary">{hcp.interactionCount}</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
