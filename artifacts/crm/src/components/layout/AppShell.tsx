import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  MessageSquarePlus, 
  List, 
  Menu,
  Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface AppShellProps {
  children: React.ReactNode;
}

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/log", label: "Log Interaction", icon: MessageSquarePlus },
  { href: "/hcps", label: "Directory", icon: Users },
  { href: "/interactions", label: "History", icon: List },
];

export function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu when location changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  return (
    <div className="min-h-[100dvh] flex w-full bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-sidebar">
        <div className="h-16 flex items-center px-6 border-b bg-sidebar">
          <Activity className="w-6 h-6 text-primary mr-2" />
          <span className="font-bold text-lg tracking-tight text-sidebar-foreground">AeroCRM</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <Button
                variant={location === item.href ? "secondary" : "ghost"}
                className={`w-full justify-start ${location === item.href ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground hover:bg-sidebar-accent/50'}`}
              >
                <item.icon className="mr-3 h-5 w-5 opacity-80" />
                {item.label}
              </Button>
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
              DR
            </div>
            <div>
              <div className="font-medium text-sm">Dr. Representative</div>
              <div className="text-xs text-muted-foreground">Field Agent</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Header & Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden h-16 flex items-center px-4 border-b bg-background sticky top-0 z-10">
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="mr-2">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <div className="h-16 flex items-center px-6 border-b">
                <Activity className="w-6 h-6 text-primary mr-2" />
                <span className="font-bold text-lg tracking-tight">AeroCRM</span>
              </div>
              <nav className="p-4 space-y-1">
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={location === item.href ? "secondary" : "ghost"}
                      className={`w-full justify-start ${location === item.href ? 'font-medium' : ''}`}
                    >
                      <item.icon className="mr-3 h-5 w-5 opacity-80" />
                      {item.label}
                    </Button>
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
          <Activity className="w-6 h-6 text-primary mr-2" />
          <span className="font-bold text-lg tracking-tight">AeroCRM</span>
        </header>

        <main className="flex-1 overflow-auto bg-slate-50/50 dark:bg-transparent">
          {children}
        </main>
      </div>
    </div>
  );
}
