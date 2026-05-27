'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, BrainCircuit, Map as MapIcon, Wallet, Route, Database, Sparkles, Check } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-16 md:py-24 space-y-24">
        
        <div className="text-center space-y-6 max-w-3xl mx-auto">
          <h1 className="text-5xl font-extrabold text-slate-900 tracking-tight">
            Beyond traditional <span className="text-indigo-600">itineraries.</span>
          </h1>
          <p className="text-xl text-slate-600">
            My Travel AIgent doesn't just list places to go. It coordinates logistics, resolves scheduling conflicts, and tracks your budget in real-time using a swarm of specialized AI agents.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
              <BrainCircuit size={24} />
            </div>
            <h2 className="text-3xl font-bold text-slate-900">Multi-Agent Orchestration</h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              Instead of relying on a single AI that gets easily confused, our system uses a <strong>Supervisor</strong> to route tasks between specialized experts. The <strong>Concierge</strong> handles your preferences, while the <strong>Architect</strong> plans logistics, hotels, and experiences, ensuring perfect coordination.
            </p>
            <ul className="space-y-3 pt-4">
              <li className="flex items-start gap-3 text-slate-700">
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-0.5"><Check size={14} /></div>
                <span><strong>Concierge Agent:</strong> Gathers your preferences and builds your traveler profile.</span>
              </li>
              <li className="flex items-start gap-3 text-slate-700">
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-0.5"><Check size={14} /></div>
                <span><strong>Architect Agent:</strong> Discovers optimal destinations, hotels, and fills your days with vibe-matching activities while validating the timeline.</span>
              </li>
            </ul>
          </div>
          <div className="bg-slate-200 p-8 rounded-3xl shadow-inner border border-slate-300 aspect-square md:aspect-auto md:h-80 flex flex-col items-center justify-center gap-4">
            <div className="bg-white px-4 py-2 rounded-lg shadow font-bold text-indigo-600 flex items-center gap-2"><BrainCircuit size={16}/> Travel Supervisor</div>
            <div className="flex gap-4">
              <div className="bg-white px-4 py-2 rounded-lg shadow text-sm flex items-center gap-2 text-slate-700">Concierge</div>
              <div className="bg-white px-4 py-2 rounded-lg shadow text-sm flex items-center gap-2 text-slate-700">Architect</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center md:flex-row-reverse">
          <div className="order-2 md:order-1 bg-slate-200 p-8 rounded-3xl shadow-inner border border-slate-300 aspect-square md:aspect-auto md:h-80 flex flex-col items-center justify-center gap-4 relative overflow-hidden">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(var(--tw-colors-slate-400) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
            <div className="bg-white p-4 rounded-xl shadow-lg flex gap-4 w-3/4 z-10 relative">
              <div className="w-10 h-10 bg-indigo-100 rounded-full shrink-0" />
              <div className="space-y-2 flex-1 pt-1">
                <div className="h-2 bg-slate-200 rounded w-full" />
                <div className="h-2 bg-slate-200 rounded w-2/3" />
              </div>
            </div>
          </div>
          <div className="order-1 md:order-2 space-y-6">
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
              <MapIcon size={24} />
            </div>
            <h2 className="text-3xl font-bold text-slate-900">Interactive Visual Workspace</h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              Chat with the agent and watch your trip assemble itself in real-time. Drag and drop events on the chronological timeline, explore suggested venues directly on the Google Map, and seamlessly sync everything to the database.
            </p>
            <ul className="space-y-3 pt-4">
              <li className="flex items-start gap-3 text-slate-700">
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-0.5"><Check size={14} /></div>
                <span><strong>Chronological Timeline:</strong> Visualize your days and rearrange events intuitively with drag-and-drop.</span>
              </li>
              <li className="flex items-start gap-3 text-slate-700">
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-0.5"><Check size={14} /></div>
                <span><strong>Integrated Google Maps:</strong> See exactly where you're going with custom polyline routes and real-world pins.</span>
              </li>
              <li className="flex items-start gap-3 text-slate-700">
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-0.5"><Check size={14} /></div>
                <span><strong>Contextual AI Interactions:</strong> Click any map POI or update your profile to trigger instant, contextual agent workflows.</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-4 hover:shadow-md transition-shadow flex flex-col">
            <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
              <Route size={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Smart Logistics</h3>
            <p className="text-slate-600 text-sm leading-relaxed flex-1">
              The AI natively integrates with Google Maps Routes to accurately calculate driving times, plot flight paths, and ensure you have enough transit time between events.
            </p>
            <ul className="space-y-2 text-sm text-slate-500 border-t border-slate-100 pt-4 mt-auto">
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Auto-calculated transit buffers</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Geodesic flight path plotting</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Google Places & Routes integrations</li>
            </ul>
          </div>
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-4 hover:shadow-md transition-shadow flex flex-col">
            <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
              <Wallet size={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Budget Tracking</h3>
            <p className="text-slate-600 text-sm leading-relaxed flex-1">
              Real-time budget monitoring automatically calculates per-person or total group costs, tracking room-sharing ratios and alerting you before you overspend.
            </p>
            <ul className="space-y-2 text-sm text-slate-500 border-t border-slate-100 pt-4 mt-auto">
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Total vs. per-person viewing</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Accurate room-sharing math</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Real-time overspending alerts</li>
            </ul>
          </div>
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-4 hover:shadow-md transition-shadow flex flex-col">
            <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
              <ShieldCheck size={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Conflict Engine</h3>
            <p className="text-slate-600 text-sm leading-relaxed flex-1">
              Never accidentally double-book yourself. Our strict rule engine flags schedule overlaps, impossible commutes, and closed venues instantly on the timeline.
            </p>
            <ul className="space-y-2 text-sm text-slate-500 border-t border-slate-100 pt-4 mt-auto">
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Prevents temporal overlaps</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Validates venue operating hours</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Checks geographic sanity</li>
            </ul>
          </div>
          
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-4 hover:shadow-md transition-shadow flex flex-col">
            <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
              <Database size={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Voyage AI Caching</h3>
            <p className="text-slate-600 text-sm leading-relaxed flex-1">
              Background processors use semantic search embeddings to automatically find and cache the best hotels and restaurants globally, ensuring lightning-fast recommendations.
            </p>
            <ul className="space-y-2 text-sm text-slate-500 border-t border-slate-100 pt-4 mt-auto">
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Voyage-4 text embeddings</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> MongoDB Vector Search</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Autonomous data gathering</li>
            </ul>
          </div>
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-4 hover:shadow-md transition-shadow md:col-span-2 flex flex-col">
            <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
              <Sparkles size={20} />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Circadian Optimization</h3>
            <p className="text-slate-600 text-sm leading-relaxed flex-1">
              The agents adapt to your rhythm. "Night Owls" get late-night recommendations and sleep in, while "Early Birds" get sunrise hikes and early dinners. It’s deeply personalized travel planning.
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-500 border-t border-slate-100 pt-4 mt-auto">
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Custom scheduling blocks</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Activity density preferences</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Vibe and energy-level mapping</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Built-in recovery days</li>
            </ul>
          </div>
        </div>

        <div className="text-center pt-12 pb-8">
          <Link 
            href="/dashboard" 
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-indigo-700 transition-all hover:scale-105 active:scale-95"
          >
            Experience it yourself
            <ArrowRight />
          </Link>
        </div>

      </main>
      
      <footer className="py-8 text-center text-slate-400 text-sm border-t border-slate-200 mt-auto">
        &copy; {new Date().getFullYear()} Travel AIgent. Built for the modern adventurer.
      </footer>
    </div>
  );
}
