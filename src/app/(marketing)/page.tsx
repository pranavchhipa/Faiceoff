import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Building2 } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen pt-20 sm:pt-24 pb-12 px-4 sm:px-6 lg:px-12 flex flex-col items-center justify-center bg-surface w-full">
      {/* Hero Header Area */}
      <header className="text-center max-w-3xl mb-10 sm:mb-16 space-y-4 sm:space-y-6">
        <h1 className="text-[2.25rem] sm:text-[3rem] md:text-6xl leading-tight font-headline font-bold tracking-tight text-on-surface">
          The Digital <span className="text-primary">Atelier</span> for Creators & Brands.
        </h1>
        <p className="text-base sm:text-lg text-on-surface-variant font-body max-w-2xl mx-auto leading-relaxed">
          Faiceoff is the exclusive marketplace connecting influencers and brands. Influencers register to create and store their AI versions. Brands browse popular influencers to generate content mixing their products with licensed AI personas.
        </p>
      </header>

      {/* Main Interaction: Split Bento Concept */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-8 w-full max-w-5xl mx-auto">

        {/* Creator Card */}
        <div className="group relative overflow-hidden bg-surface-container-lowest rounded-[1.5rem] sm:rounded-[2rem] p-6 sm:p-10 flex flex-col justify-between min-h-[380px] sm:min-h-[500px] border border-outline-variant/15 hover:shadow-[0px_24px_48px_rgba(44,47,48,0.06)] transition-all duration-500">
          <div className="relative z-10 w-full">
            <span className="inline-block px-4 py-1.5 rounded-full bg-primary-container/10 text-primary font-label text-[0.7rem] tracking-widest uppercase mb-6">
              Discovery Tier
            </span>
            <h2 className="text-3xl sm:text-4xl font-headline font-bold mb-4 text-on-surface">I'm a Creator</h2>
            <p className="text-on-surface-variant leading-relaxed max-w-sm font-body pr-4">
              Register yourself, let us create and securely store your high-fidelity AI version, and get discovered by top brands.
            </p>
          </div>
          <div className="relative z-10 flex flex-col gap-4 mt-12 w-full">
            <Link
              href="/for-creators"
              className="w-full bg-gradient-to-br from-primary to-primary-container text-on-primary py-4 rounded-xl font-headline font-bold text-lg hover:-translate-y-0.5 transition-all duration-300 active:scale-95 flex items-center justify-center gap-2 group/btn no-underline"
            >
              Start Creating
              <ArrowRight className="w-5 h-5 transition-transform group-hover/btn:translate-x-1" />
            </Link>
            <p className="text-center text-xs font-label text-outline uppercase tracking-tighter m-0">
              Join 12,000+ top-tier artists
            </p>
          </div>
          {/* Abstract Decorative Image for Creator */}
          <div className="absolute bottom-0 right-0 w-2/3 h-2/3 opacity-20 group-hover:opacity-40 transition-opacity duration-500 pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-tl from-primary/30 to-transparent z-10 rounded-tl-[4rem]"></div>
            <Image 
              src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=600&auto=format&fit=crop" 
              alt="Creative visual" 
              fill
              className="object-cover rounded-tl-[4rem]"
            />
          </div>
        </div>

        {/* Brand Card */}
        <div className="group relative overflow-hidden bg-surface-container rounded-[1.5rem] sm:rounded-[2rem] p-6 sm:p-10 flex flex-col justify-between min-h-[380px] sm:min-h-[500px] border border-outline-variant/15 hover:shadow-[0px_24px_48px_rgba(44,47,48,0.06)] transition-all duration-500">
          <div className="relative z-10 w-full">
            <span className="inline-block px-4 py-1.5 rounded-full bg-on-surface/5 text-on-surface font-label text-[0.7rem] tracking-widest uppercase mb-6">
              Enterprise Hub
            </span>
            <h2 className="text-3xl sm:text-4xl font-headline font-bold mb-4 text-on-surface">I'm a Brand</h2>
            <p className="text-on-surface-variant leading-relaxed max-w-sm font-body pr-4">
               Discover popular influencers, access their licensed AI personas, and seamlessly generate compelling content featuring your products.
            </p>
          </div>
          <div className="relative z-10 flex flex-col gap-4 mt-12 w-full">
            <Link
              href="/for-brands"
              className="w-full bg-on-surface text-surface-container-lowest py-4 rounded-xl font-headline font-bold text-lg hover:-translate-y-0.5 transition-all duration-300 active:scale-95 flex items-center justify-center gap-2 group/btn no-underline"
            >
              Partner with Us
              <Building2 className="w-5 h-5 transition-transform group-hover/btn:translate-x-1" />
            </Link>
            <p className="text-center text-xs font-label text-outline uppercase tracking-tighter m-0">
              Trusted by Fortune 500 Agencies
            </p>
          </div>
          {/* Abstract Decorative Image for Brand */}
          <div className="absolute bottom-0 right-0 w-2/3 h-2/3 opacity-10 group-hover:opacity-25 transition-opacity duration-500 pointer-events-none">
             <div className="absolute inset-0 bg-gradient-to-tl from-on-surface/30 to-transparent z-10 rounded-tl-[4rem]"></div>
             <Image 
              src="https://images.unsplash.com/photo-1497215728101-856f4ea42174?q=80&w=600&auto=format&fit=crop" 
              alt="Professional visual" 
              fill
              className="object-cover rounded-tl-[4rem] grayscale"
            />
          </div>
        </div>
      </div>

      {/* Secondary Content Section: Trust & Stats */}
      <section className="mt-16 sm:mt-32 w-full max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12 text-center pb-12 sm:pb-20">
        <div className="space-y-2">
          <p className="text-3xl sm:text-4xl font-headline font-bold text-primary m-0">500M+</p>
          <p className="text-sm font-label text-on-surface-variant uppercase tracking-widest m-0">Total Reach</p>
        </div>
        <div className="space-y-2">
          <p className="text-3xl sm:text-4xl font-headline font-bold text-primary m-0">15k</p>
          <p className="text-sm font-label text-on-surface-variant uppercase tracking-widest m-0">Active Creators</p>
        </div>
        <div className="space-y-2">
          <p className="text-3xl sm:text-4xl font-headline font-bold text-primary m-0">2.4s</p>
          <p className="text-sm font-label text-on-surface-variant uppercase tracking-widest m-0">Model Sync</p>
        </div>
        <div className="space-y-2">
          <p className="text-3xl sm:text-4xl font-headline font-bold text-primary m-0">99.9%</p>
          <p className="text-sm font-label text-on-surface-variant uppercase tracking-widest m-0">IP Protection</p>
        </div>
      </section>
    </div>
  );
}
