"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search,
  Upload,
  Sparkles,
  CheckCircle,
  Gavel,
  ShieldAlert,
  ArrowRight,
  Users
} from "lucide-react";

// Orbiting Men's Lifestyle Products (5 Items = 72 degree separation)
const products = [
  { id: 1, name: "Silver Watch", angle: 270, image: "/images/prod_watch.png", adImage: "/images/ad_watch.png" },
  { id: 2, name: "Aviator Glasses", angle: 342, image: "/images/prod_sunglasses.png", adImage: "/images/ad_sunglasses.png" },
  { id: 3, name: "Leather Jacket", angle: 54, image: "/images/prod_jacket.png", adImage: "/images/ad_jacket.png" },
  { id: 4, name: "Headphones", angle: 126, image: "/images/prod_headphones.png", adImage: "/images/ad_headphones.png" },
  { id: 5, name: "Luxury Cologne", angle: 198, image: "/images/prod_perfume.png", adImage: "/images/ad_perfume.png" },
];

export default function ForBrandsPage() {
  const [activeProduct, setActiveProduct] = useState<number | null>(null);

  // Auto reset to base model after 5 seconds of viewing the ad
  useEffect(() => {
    if (activeProduct !== null) {
      const timer = setTimeout(() => {
        setActiveProduct(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [activeProduct]);

  return (
    <div className="bg-background font-body text-on-surface antialiased selection:bg-primary-container selection:text-on-primary-container overflow-hidden w-full">
      
      {/* ── Orbit Hero Section ── */}
      <section className="relative min-h-[600px] sm:min-h-[870px] flex items-center px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pt-16 sm:pt-20">
        <div className="grid lg:grid-cols-2 gap-8 sm:gap-16 items-center w-full">
          {/* Text Content */}
          <div className="z-10 mt-6 lg:mt-0">
            <span className="inline-block px-4 py-1.5 mb-5 sm:mb-6 text-[10px] font-bold tracking-[0.2em] uppercase bg-surface-container text-primary rounded-full">
              The New Standard for Brands
            </span>
            <h1 className="font-headline text-[2.25rem] sm:text-5xl md:text-[3.5rem] leading-[1.1] font-bold text-on-surface mb-6 sm:mb-8 tracking-tight">
              Scale your <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary-container">presence</span> with AI-powered creative.
            </h1>
            <p className="text-base sm:text-lg text-on-surface-variant max-w-md leading-relaxed mb-8 sm:mb-10">
              Bridge the gap between vision and execution. Access a curated marketplace of AI-optimized creators and high-conversion campaign assets.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
              <button className="px-6 sm:px-8 py-3.5 sm:py-4 bg-primary text-on-primary font-bold rounded-xl flex items-center justify-center gap-2 hover:-translate-y-0.5 active:scale-95 transition-all duration-300">
                Book a Demo <ArrowRight className="w-5 h-5" />
              </button>
              <button className="px-6 sm:px-8 py-3.5 sm:py-4 bg-surface-container-lowest text-on-surface font-semibold rounded-xl border border-outline-variant/20 hover:bg-surface-container-low transition-all duration-300">
                View Case Studies
              </button>
            </div>
          </div>

          {/* Interactive Orbiting Products Visualization */}
          <div className="relative flex justify-center items-center h-[380px] sm:h-[500px] lg:h-[600px] w-full max-w-[600px] mx-auto">
            
            {/* Subtle Decorative Orbit Paths */}
            <div className="absolute w-[200px] sm:w-[250px] lg:w-[350px] h-[200px] sm:h-[250px] lg:h-[350px] rounded-full border border-outline-variant/20 z-0"></div>
            <div className="absolute w-[280px] sm:w-[350px] lg:w-[500px] h-[280px] sm:h-[350px] lg:h-[500px] rounded-full border border-outline-variant/10 border-dashed z-0"></div>

            {/* Central Hub (Active Model Swap) */}
            <div className="absolute left-1/2 top-1/2 flex h-36 w-36 sm:h-48 sm:w-48 lg:h-64 lg:w-64 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-white shadow-2xl border-4 border-primary/20 z-20 overflow-hidden group">
               <AnimatePresence mode="wait">
                 {activeProduct === null ? (
                   <motion.div
                     key="base-model"
                     initial={{ opacity: 0, scale: 1.1 }}
                     animate={{ opacity: 1, scale: 1 }}
                     exit={{ opacity: 0, scale: 0.9 }}
                     transition={{ duration: 0.4 }}
                     className="absolute inset-0"
                   >
                     <Image 
                       src="/images/creator_hero.png" 
                       alt="Verification Base Model"
                       fill
                       className="object-cover"
                     />
                     <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                     <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full border border-white/20 whitespace-nowrap shadow-lg">
                       <span className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1">
                         <CheckCircle className="h-3 w-3" /> Base Model
                       </span>
                     </div>
                   </motion.div>
                 ) : (
                   <motion.div
                     key={`ad-${activeProduct}`}
                     initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
                     animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                     exit={{ opacity: 0, scale: 1.1, filter: "blur(5px)" }}
                     transition={{ duration: 0.5, ease: "easeOut" }}
                     className="absolute inset-0 border-4 border-primary rounded-full overflow-hidden"
                   >
                     <Image 
                       src={products.find(p => p.id === activeProduct)?.adImage || ""} 
                       alt="Generated Advertisement"
                       fill
                       className="object-cover"
                     />
                   </motion.div>
                 )}
               </AnimatePresence>
            </div>

            {/* Orbiting Products Logic */}
            <motion.div 
               animate={{ rotate: 360 }}
               transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
               className="absolute inset-0 z-10 pointer-events-none"
            >
               {products.map((prod) => {
                const isActive = activeProduct === prod.id;
                
                const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
                const radiusX = isMobile ? 160 : 250;
                const radiusY = isMobile ? 160 : 250;
                
                const rad = (prod.angle * Math.PI) / 180;
                const xPos = radiusX * Math.cos(rad);
                const yPos = radiusY * Math.sin(rad);

                return (
                  <motion.button
                    key={prod.id}
                    onClick={() => setActiveProduct(prod.id)}
                    initial={{ opacity: 0, scale: 0, rotate: 0 }}
                    animate={{ 
                      opacity: 1, 
                      scale: isActive ? 1.2 : 1,
                      x: xPos,
                      y: yPos,
                      rotate: -360, // Exact counter-rotation keeps them upright
                      boxShadow: isActive ? "0px 0px 30px rgba(106, 28, 246, 0.4)" : "0px 10px 20px rgba(0, 0, 0, 0.05)",
                      borderColor: isActive ? "var(--color-primary)" : "var(--color-outline-variant)"
                    }}
                    whileHover={{ scale: 1.15, zIndex: 30 }}
                    transition={{ 
                      rotate: { duration: 40, repeat: Infinity, ease: "linear" },
                      opacity: { duration: 0.5, delay: 0.2 + prod.id * 0.05 },
                      scale: { duration: 0.3 },
                      x: { duration: 1.2, type: "spring", bounce: 0.3 },
                      y: { duration: 1.2, type: "spring", bounce: 0.3 }
                    }}
                    className="absolute left-1/2 top-1/2 z-10 flex h-20 w-20 lg:h-24 lg:w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-3xl bg-surface-container-lowest glass-effect shadow-xl border cursor-pointer border-outline-variant/15 transition-colors group"
                    style={{ pointerEvents: "auto", transformOrigin: "center center" }}
                  >
                    {prod.image ? (
                        <div className="absolute inset-2 pointer-events-none">
                          <Image src={prod.image} alt={prod.name} fill className="object-contain drop-shadow-md group-hover:scale-110 transition-transform duration-300" />
                        </div>
                    ) : <div className="absolute inset-0 bg-white opacity-50" />}
                  </motion.button>
                );
              })}
            </motion.div>
            
          </div>
        </div>

        {/* Background Decorative Blur */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/5 rounded-full blur-[100px] -z-10"></div>
        <div className="absolute bottom-0 -left-24 w-72 h-72 bg-tertiary/5 rounded-full blur-[80px] -z-10"></div>
      </section>

      {/* ── Process Section: 3-Step Visualization ── */}
      <section className="py-16 sm:py-32 bg-surface-container-low">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 sm:mb-20 gap-6 sm:gap-8">
            <div className="max-w-xl">
              <h2 className="font-headline text-3xl sm:text-4xl font-bold mb-4 sm:mb-6 tracking-tight">From concept to campaign in minutes.</h2>
              <p className="text-on-surface-variant">We've streamlined the creative workflow for the AI era. No more back-and-forth emails, just results.</p>
            </div>
            <div className="hidden md:block">
              <span className="text-[8rem] font-headline font-bold text-surface-container-highest/50 leading-none pointer-events-none">PROCESS</span>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-5 sm:gap-8">
            
            <div className="relative p-6 sm:p-10 bg-surface-container-lowest rounded-[2rem] sm:rounded-[2.5rem] border border-outline-variant/10 shadow-sm overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 text-6xl font-bold text-surface-container opacity-50 group-hover:text-primary-container transition-colors duration-500">01</div>
              <div className="w-16 h-16 bg-primary/5 rounded-2xl flex items-center justify-center mb-8">
                <Search className="w-8 h-8 text-primary" />
              </div>
              <h3 className="font-headline text-2xl font-bold mb-4">Browse</h3>
              <p className="text-on-surface-variant leading-relaxed">
                Explore our curated gallery of AI-optimized creators and visual styles specifically tuned for your industry.
              </p>
            </div>

            <div className="relative p-6 sm:p-10 bg-surface-container-lowest rounded-[2rem] sm:rounded-[2.5rem] border border-outline-variant/10 shadow-sm overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 text-6xl font-bold text-surface-container opacity-50 group-hover:text-primary-container transition-colors duration-500">02</div>
              <div className="w-16 h-16 bg-primary/5 rounded-2xl flex items-center justify-center mb-8">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <h3 className="font-headline text-2xl font-bold mb-4">Submit Product</h3>
              <p className="text-on-surface-variant leading-relaxed">
                 Upload your product shots or brand guidelines. Our AI engine analyzes your visual DNA to ensure perfect consistency.
              </p>
            </div>

            <div className="relative p-6 sm:p-10 bg-surface-container-lowest rounded-[2rem] sm:rounded-[2.5rem] border border-outline-variant/10 shadow-sm overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 text-6xl font-bold text-surface-container opacity-50 group-hover:text-primary-container transition-colors duration-500">03</div>
              <div className="w-16 h-16 bg-primary/5 rounded-2xl flex items-center justify-center mb-8">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h3 className="font-headline text-2xl font-bold mb-4">Get Campaign</h3>
              <p className="text-on-surface-variant leading-relaxed">
                Receive high-resolution, ready-to-deploy campaign assets tailored for every social platform and digital channel.
              </p>
            </div>
            
          </div>
        </div>
      </section>

      {/* ── Bento Grid Insights Section (The Faiceoff Advantage) ── */}
      <section className="py-32 px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="font-headline text-4xl font-bold mb-4">The Faiceoff Advantage</h2>
          <p className="text-on-surface-variant max-w-lg mx-auto">Proprietary technology that puts your brand months ahead of the competition.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-4 h-auto md:h-[600px]">
          {/* Major Feature 1 */}
          <div className="md:col-span-2 md:row-span-2 bg-surface-container-lowest rounded-[2rem] p-10 border border-outline-variant/15 flex flex-col justify-between group relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
            <div className="relative z-10">
              <div className="w-12 h-12 bg-on-surface text-surface-container-lowest rounded-full flex items-center justify-center mb-6">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="font-headline text-3xl font-bold mb-4">Consistent Persona Engine</h3>
              <p className="text-on-surface-variant max-w-sm">
                Our AI maintains facial and personality consistency across thousands of assets, ensuring your brand "face" remains recognizable everywhere.
              </p>
            </div>
            <div className="mt-12 relative h-56 rounded-xl overflow-hidden shadow-lg shadow-black/5">
              <Image 
                src="https://images.unsplash.com/photo-1549465220-1a8b9238cd48?q=80&w=800&auto=format&fit=crop" 
                alt="Consistent styling"
                fill
                className="object-cover"
              />
            </div>
          </div>
          
          {/* Feature 2 */}
          <div className="md:col-span-2 bg-surface-container-lowest rounded-[2rem] p-8 border border-outline-variant/15 flex items-center gap-8 group">
            <div className="flex-1">
              <h4 className="font-headline text-xl font-bold mb-2">Automated Rights Management</h4>
              <p className="text-sm text-on-surface-variant">Every pixel generated is backed by our DPDP compliant digital rights framework.</p>
            </div>
            <div className="w-20 h-20 bg-surface-container-low rounded-2xl flex-shrink-0 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <Gavel className="w-8 h-8 text-on-surface" />
            </div>
          </div>
          
          {/* Feature 3 */}
          <div className="md:col-span-1 bg-surface-container-lowest rounded-[2rem] p-8 border border-outline-variant/15 flex flex-col justify-center text-center group">
            <div className="text-4xl font-bold text-primary mb-2 font-headline">4.8x</div>
            <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">ROAS Increase</p>
          </div>
          
          {/* Feature 4 */}
          <div className="md:col-span-1 bg-primary rounded-[2rem] p-8 flex flex-col justify-center text-center text-on-primary">
            <div className="text-4xl font-bold mb-2 font-headline">100%</div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-80">Legal Coverage</p>
          </div>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto mb-10 sm:mb-20">
        <div className="bg-on-surface rounded-[2rem] sm:rounded-[3rem] p-8 sm:p-12 md:p-20 text-surface-container-lowest text-center relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-tr from-primary/20 to-transparent pointer-events-none"></div>
          <div className="relative z-10 flex flex-col items-center">
            <h2 className="font-headline text-3xl sm:text-5xl md:text-6xl font-bold mb-6 sm:mb-8 tracking-tighter leading-tight max-w-3xl">
              Ready to evolve your brand?
            </h2>
            <p className="text-base sm:text-xl opacity-70 mb-8 sm:mb-12 max-w-2xl mx-auto">
              Join 500+ forward-thinking brands who are already scaling their creative output with Faiceoff.
            </p>
            <Link href="/signup">
              <button className="px-8 sm:px-12 py-4 sm:py-5 bg-surface-container-lowest text-on-surface font-extrabold rounded-full hover:scale-105 active:scale-95 transition-all duration-300 shadow-xl cursor-pointer">
                Get Started Today
              </button>
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
