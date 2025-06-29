import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Layers } from 'lucide-react';

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 max-w-screen-2xl items-center">
        <Link href="/" className="mr-6 flex items-center space-x-2">
          <Layers className="h-6 w-6 text-primary" />
          <span className="font-bold font-headline sm:inline-block text-lg">
            Finance Management
          </span>
        </Link>
        <nav className="flex flex-1 items-center space-x-4">
          {/* Add nav links here if needed, e.g., Features, About, Contact */}
          {/* <Link href="#features" className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary">Features</Link> */}
        </nav>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">Login</Button>
          <Button size="sm">Sign Up</Button>
        </div>
      </div>
    </header>
  );
}
