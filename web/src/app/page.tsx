'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, PlaneTakeoff, Globe, ShieldCheck } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';

/**
 * LandingPage Component
 * Serves as the root entry point for the application.
 * Provides a call-to-action to the planning dashboard.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        {/* Hero Section */}
        <div className="max-w-3xl space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold uppercase tracking-wider">
              <Globe size={14} />
              Next-Gen Travel Planning
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight">
              Meet <span className="text-indigo-600 underline decoration-indigo-200">Travel AIgent</span>, your personal travel architect.
            </h1>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Design hyper-optimized itineraries with Gemini. Handle logistics, budgets, and maps in real-time, all in one place.
            </p>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link 
              href="/dashboard" 
              className="group flex items-center gap-2 bg-indigo-600 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-indigo-700 transition-all hover:scale-105 active:scale-95"
            >
              Start Planning Now
              <ArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <a 
              href="#features" 
              className="text-slate-500 font-semibold hover:text-slate-700 transition-colors"
            >
              How it works
            </a>
          </div>

          {/* Minimal Feature Grid */}
          <div id="features" className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-20 border-t border-slate-200">
            <div className="space-y-2">
              <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-slate-200 flex items-center justify-center mx-auto text-indigo-600">
                <PlaneTakeoff size={20} />
              </div>
              <h3 className="font-bold text-slate-900">AI Logic</h3>
              <p className="text-sm text-slate-500">Gemini ensures your schedule makes sense geographically and temporally.</p>
            </div>
            <div className="space-y-2">
              <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-slate-200 flex items-center justify-center mx-auto text-indigo-600">
                <ShieldCheck size={20} />
              </div>
              <h3 className="font-bold text-slate-900">Conflict Detection</h3>
              <p className="text-sm text-slate-500">Real-time validation flags overlaps and budget overages instantly.</p>
            </div>
            <div className="space-y-2">
              <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-slate-200 flex items-center justify-center mx-auto text-indigo-600">
                <Globe size={20} />
              </div>
              <h3 className="font-bold text-slate-900">Visual Workspace</h3>
              <p className="text-sm text-slate-500">See your trip come to life with an interactive timeline and map view.</p>
            </div>
          </div>
        </div>

        <footer className="mt-20 text-slate-400 text-sm">
          &copy; {new Date().getFullYear()} Travel AIgent. Built for the modern adventurer.
        </footer>
      </div>
    </div>
  );
}