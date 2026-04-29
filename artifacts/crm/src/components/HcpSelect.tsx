import { useState, useEffect } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useListHcps } from "@workspace/api-client-react";

interface HcpSelectProps {
  value?: string | null;
  onChange: (value: string, name: string) => void;
}

export function HcpSelect({ value, onChange }: HcpSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: hcps, isLoading } = useListHcps(
    debouncedSearch ? { q: debouncedSearch } : undefined
  );

  const selectedHcp = hcps?.find((hcp) => hcp.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal bg-background"
        >
          {selectedHcp ? selectedHcp.name : "Select HCP..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Search HCP by name, specialty, institution..." 
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Searching..." : "No HCPs found."}
            </CommandEmpty>
            <CommandGroup>
              {hcps?.map((hcp) => (
                <CommandItem
                  key={hcp.id}
                  value={hcp.id}
                  onSelect={(currentValue) => {
                    onChange(currentValue, hcp.name);
                    setOpen(false);
                  }}
                  className="flex flex-col items-start gap-1 py-2"
                >
                  <div className="flex items-center w-full">
                    <span className="font-medium">{hcp.name}</span>
                    <Check
                      className={cn(
                        "ml-auto h-4 w-4",
                        value === hcp.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </div>
                  {(hcp.specialty || hcp.institution) && (
                    <div className="text-xs text-muted-foreground">
                      {[hcp.specialty, hcp.institution].filter(Boolean).join(" • ")}
                    </div>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
