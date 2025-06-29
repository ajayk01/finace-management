
"use client"
import Link from "next/link";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  BarChart3,
  LayoutGrid,
  CreditCard,
  BarChartHorizontalBig,
  Briefcase,
  MessageSquare,
  HelpCircle,
  Settings,
  ChevronDown,
} from "lucide-react";
import { usePathname } from "next/navigation";

const menuItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/payments", label: "Payments", icon: CreditCard, suffix: <ChevronDown className="h-4 w-4 ml-auto" /> },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChartHorizontalBig },
  { href: "/dashboard/services", label: "Services", icon: Briefcase },
  { href: "/dashboard/messages", label: "Messages", icon: MessageSquare, badge: "6" },
];

const supportItems = [
  { href: "/dashboard/help", label: "Helps", icon: HelpCircle },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function DashboardSidebarContent() {
  const pathname = usePathname();

  return (
    <>
      <SidebarHeader className="p-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <BarChart3 className="h-7 w-7 text-primary" />
          <span className="text-xl font-semibold text-sidebar-foreground">FOGO</span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="p-4 flex-grow">
        <div className="mb-4">
          <SidebarGroupLabel className="text-xs text-sidebar-foreground/70 px-0 mb-2">Menu</SidebarGroupLabel>
          <SidebarMenu>
            {menuItems.map((item) => (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))}
                  className={`w-full justify-start ${pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href)) ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
                >
                  <Link href={item.href} className="flex items-center">
                    <item.icon className="h-5 w-5 mr-3" />
                    {item.label}
                    {item.badge && <Badge variant="destructive" className="ml-auto">{item.badge}</Badge>}
                    {item.suffix}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </div>
        <Separator className="my-4 bg-sidebar-border" />
        <div>
          <SidebarGroupLabel className="text-xs text-sidebar-foreground/70 px-0 mb-2">Support</SidebarGroupLabel>
          <SidebarMenu>
            {supportItems.map((item) => (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  className={`w-full justify-start ${pathname === item.href ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
                >
                  <Link href={item.href} className="flex items-center">
                    <item.icon className="h-5 w-5 mr-3" />
                    {item.label}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </div>
      </SidebarContent>
      <SidebarFooter className="p-4 mt-auto">
        <Card className="bg-gradient-to-br from-primary to-blue-700 text-primary-foreground p-6 rounded-lg shadow-lg">
          <div className="text-center">
            <BarChart3 className="h-10 w-10 mx-auto mb-3" />
            <p className="font-semibold mb-1">FOGO</p>
            <p className="text-sm mb-4">Fast Payments for Sales</p>
            <Button variant="secondary" className="w-full bg-white text-primary hover:bg-white/90">Join Now</Button>
          </div>
        </Card>
      </SidebarFooter>
    </>
  );
}

// Placeholder Card component for the CTA, can be replaced if a more generic one is needed
const Card = ({ className, children }: { className?: string, children: React.ReactNode }) => (
  <div className={className}>{children}</div>
);
