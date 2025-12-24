import { Link } from "wouter";
import FooterLinkFramer from "@/framer/footer-underline-link";

export function Footer() {
  return (
    <footer className="bg-secondary/30 border-t py-12 md:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="md:col-span-1">
             <Link href="/" className="font-display text-2xl font-bold tracking-tighter text-foreground block mb-6">
              ANKER
            </Link>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Investing in the future of decentralized finance and digital assets. Building tomorrow, today.
            </p>
          </div>
          
          <div>
            <h4 className="font-bold mb-6">Company</h4>
            <div className="flex flex-col gap-4">
              <Link href="/team" className="text-muted-foreground hover:text-primary transition-colors text-sm">Team</Link>
              <Link href="/newsroom" className="text-muted-foreground hover:text-primary transition-colors text-sm">Newsroom</Link>
              <Link href="/contact" className="text-muted-foreground hover:text-primary transition-colors text-sm">Contact</Link>
            </div>
          </div>
          
          <div>
            <h4 className="font-bold mb-6">Legal</h4>
            <div className="flex flex-col gap-4">
              <Link href="#" className="text-muted-foreground hover:text-primary transition-colors text-sm">Privacy Policy</Link>
              <Link href="#" className="text-muted-foreground hover:text-primary transition-colors text-sm">Terms of Service</Link>
            </div>
          </div>
          
          <div>
            <h4 className="font-bold mb-6">Social</h4>
            <div className="flex gap-4">
              {/* Using CSS-only social icons for cleaner DOM */}
              <a href="#" className="w-10 h-10 rounded-full bg-background border flex items-center justify-center text-foreground hover:bg-primary hover:text-white hover:border-primary transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg>
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-background border flex items-center justify-center text-foreground hover:bg-primary hover:text-white hover:border-primary transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
              </a>
            </div>
          </div>
        </div>
        
        <div className="mt-16 pt-8 border-t border-border/50 flex flex-col md:flex-row justify-between items-center text-sm text-muted-foreground">
          <p>© 2024 Anker Inc. All rights reserved.</p>
          <div className="mt-4 md:mt-0">
            {/* Example usage of footer framer component if suitable */}
            {/* <FooterLinkFramer.Responsive ... /> */}
          </div>
        </div>
      </div>
    </footer>
  );
}
