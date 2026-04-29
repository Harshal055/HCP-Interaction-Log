import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useListMaterials } from "@workspace/api-client-react";

interface MultiSelectProps {
  type: "materials" | "samples";
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}

export function MultiSelect({ type, selected = [], onChange, placeholder }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const { data } = useListMaterials();

  const options = data ? data[type] : [];

  const handleUnselect = (item: string) => {
    onChange(selected.filter((i) => i !== item));
  };

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div
            role="combobox"
            aria-expanded={open}
            className="flex min-h-10 w-full flex-wrap gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background cursor-pointer"
            onClick={() => setOpen(true)}
          >
            {selected.length > 0 ? (
              selected.map((item) => (
                <Badge
                  key={item}
                  variant="secondary"
                  className="rounded-sm px-1 font-normal"
                >
                  {item}
                  <div
                    className="ml-1 rounded-full outline-none ring-offset-background hover:bg-muted focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnselect(item);
                    }}
                  >
                    <Plus className="h-3 w-3 rotate-45" />
                  </div>
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">{placeholder || "Select items..."}</span>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const isSelected = selected.includes(option);
                  return (
                    <CommandItem
                      key={option}
                      onSelect={() => {
                        if (isSelected) {
                          onChange(selected.filter((i) => i !== option));
                        } else {
                          onChange([...selected, option]);
                        }
                      }}
                    >
                      <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50'}`}>
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                      {option}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
