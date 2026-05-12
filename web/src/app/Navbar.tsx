'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Menu, X, Plane } from 'lucide-react';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="w-full bg-background/80 backdrop-blur-md border-b border-border shrink-0 z-[100] sticky top-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="bg-primary p-1.5 rounded-lg group-hover:scale-110 transition-transform">
                <Plane className="text-white w-5 h-5" />
              </div>
              <span className="font-bold text-xl text-foreground tracking-tight">Travel AIgent</span>
            </Link>
          </div>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="/#features" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">
              Features
            </Link>
            <Link href="/dashboard" className="bg-primary text-primary-foreground px-5 py-2 rounded-xl text-sm font-bold shadow-md hover:brightness-110 transition-all hover:scale-105 active:scale-95">
              Launch App
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center">
            <button 
              onClick={() => setIsOpen(!isOpen)} 
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 p-4 space-y-4 shadow-xl animate-in fade-in slide-in-from-top-2">
          <Link 
            href="/#features" 
            onClick={() => setIsOpen(false)}
            className="block px-4 py-2 text-base font-semibold text-slate-600 hover:text-indigo-600 hover:bg-slate-50 rounded-lg"
          >
            Features
          </Link>
          <Link 
            href="/dashboard" 
            onClick={() => setIsOpen(false)}
            className="block w-full text-center bg-indigo-600 text-white px-4 py-3 rounded-xl font-bold shadow-md hover:bg-indigo-700"
          >
            Launch App
          </Link>
        </div>
      )}
    </nav>
  );
}