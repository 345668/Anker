import { Link, useLocation } from "wouter";
import NavBarFramer from "@/framer/nav-bar";

export function Navigation() {
  const [location] = useLocation();

  // The Framer navbar is great, but we might want to overlay our own Link logic 
  // if the Framer component doesn't accept 'as' props for routing.
  // For now, we'll wrap a container and place invisible links or rely on the Framer
  // component's internal links if they are configurable. 
  // However, `unframer` components usually are just visual.
  // Let's create a custom responsive nav that matches the design instead to ensure routing works perfectly,
  // OR try to use the component. 
  
  // Given the complexity of "hacking" a compiled Framer component for client-side routing,
  // we will build a wrapper that positions standard accessible links over the visual slots 
  // OR simply build a custom nav that looks identical.
  
  // Strategy: Use a clean custom header that complements the Framer design language.
  
  const links = [
    { href: "/", label: "Home" },
    { href: "/newsroom", label: "Newsroom" },
    { href: "/team", label: "Team" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="font-display text-2xl font-bold tracking-tighter text-foreground hover:opacity-80 transition-opacity">
          ANKER
        </Link>
        
        <nav className="hidden md:flex items-center gap-8">
          {links.map((link) => (
            <Link 
              key={link.href} 
              href={link.href}
              className={`text-sm font-medium transition-colors hover:text-primary ${
                location === link.href ? "text-primary font-semibold" : "text-muted-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link href="/contact">
            <button className="px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 hover:shadow-primary/30">
              Get in Touch
            </button>
          </Link>
        </nav>

        {/* Mobile menu button placeholder - can implement full drawer if needed */}
        <button className="md:hidden p-2 text-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
        </button>
      </div>
    </header>
  );
}
