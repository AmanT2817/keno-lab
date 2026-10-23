"use client";

import { useKenoStore, type KenoTheme } from "@/lib/keno/store";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Palette, Moon, Leaf, Gauge, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const THEMES: {
  id: KenoTheme;
  name: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  swatch: string;
}[] = [
  {
    id: "midnight",
    name: "Midnight",
    description: "Deep navy + emerald",
    Icon: Moon,
    swatch: "linear-gradient(135deg, #0B1220 50%, #10B981 50%)",
  },
  {
    id: "emerald",
    name: "Emerald",
    description: "Casino felt green",
    Icon: Leaf,
    swatch: "linear-gradient(135deg, #0c1f1a 50%, #047857 50%)",
  },
  {
    id: "slate",
    name: "Slate",
    description: "Charcoal + teal data",
    Icon: Gauge,
    swatch: "linear-gradient(135deg, #1c1f24 50%, #14b8a6 50%)",
  },
];

export function ThemeSwitcher() {
  const theme = useKenoStore((s) => s.theme);
  const setTheme = useKenoStore((s) => s.setTheme);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          title="Theme"
          aria-label="Choose theme"
        >
          <Palette className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEMES.map(({ id, name, description, Icon, swatch }) => (
          <DropdownMenuItem
            key={id}
            onClick={() => setTheme(id)}
            className="cursor-pointer"
          >
            <div className="flex items-center gap-2 w-full">
              <div
                className="size-5 rounded-md border border-border/60 shrink-0"
                style={{ background: swatch }}
                aria-hidden
              />
              <div className="flex-1 flex items-center gap-1.5">
                <Icon className="size-3.5 text-muted-foreground" />
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-medium">{name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {description}
                  </span>
                </div>
              </div>
              {theme === id && <Check className="size-4 text-primary" />}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
