import { useState, useEffect } from "react";
import { Link } from "wouter";
import { 
  useListHcps, 
  ListHcpsParams 
} from "@workspace/api-client-react";
import { Search, MapPin, Building, Briefcase } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function HcpList() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  const params: ListHcpsParams = debouncedSearch ? { q: debouncedSearch } : {};
  const { data: hcps, isLoading } = useListHcps(params);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">HCP Directory</h1>
          <p className="text-muted-foreground mt-1">Search and manage healthcare professionals.</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Search by name, specialty, institution..." 
          className="pl-10 bg-background"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="shadow-sm">
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-6 w-3/4" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : hcps?.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card border-dashed">
          <p className="text-muted-foreground">No healthcare professionals found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-500">
          {hcps?.map((hcp) => (
            <Link key={hcp.id} href={`/hcps/${hcp.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full border-muted/60">
                <CardContent className="p-6 flex flex-col h-full">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-semibold text-lg line-clamp-1">{hcp.name}</h3>
                    {hcp.interactionCount > 0 && (
                      <Badge variant="secondary" className="ml-2 shrink-0">
                        {hcp.interactionCount} calls
                      </Badge>
                    )}
                  </div>
                  
                  <div className="space-y-2 mt-auto text-sm text-muted-foreground">
                    {hcp.specialty && (
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 shrink-0" />
                        <span className="line-clamp-1">{hcp.specialty}</span>
                      </div>
                    )}
                    {hcp.institution && (
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4 shrink-0" />
                        <span className="line-clamp-1">{hcp.institution}</span>
                      </div>
                    )}
                    {hcp.territory && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 shrink-0" />
                        <span className="line-clamp-1">{hcp.territory}</span>
                      </div>
                    )}
                  </div>

                  {hcp.lastInteractionAt && (
                    <div className="mt-4 pt-4 border-t text-xs text-muted-foreground flex justify-between">
                      <span>Last seen</span>
                      <span>{format(new Date(hcp.lastInteractionAt), 'MMM d, yyyy')}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
