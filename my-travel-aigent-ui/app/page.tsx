import React from 'react';
import { Map as MapIcon, Calendar, Wallet, Settings } from 'lucide-react';

export default function DashboardPage() {
  return (
    <main className="flex h-screen bg-slate-50 dark:bg-slate-950">
      {/* Sidebar Navigation */}
      <nav className="w-16 flex flex-col items-center py-4 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
        <div className="p-2 mb-8 bg-blue-600 rounded-lg text-white font-bold">TA</div>
        <div className="space-y-6 flex flex-col">
          <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><MapIcon size={24} /></button>
          <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><Calendar size={24} /></button>
          <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><Wallet size={24} /></button>
          <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><Settings size={24} /></button>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex items-center justify-between px-8 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 italic tracking-tight">
            My Travel Aigent <span className="text-blue-600 not-italic ml-2">/ Dashboard</span>
          </h1>
          <div className="text-sm text-slate-500 font-medium">Session: savannah_test_001</div>
        </header>

        <div className="flex-1 flex p-6 gap-6 overflow-hidden">
          {/* Left Column: Timeline (Phase 5 Feature) */}
          <section className="w-1/3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm overflow-y-auto">
            <h2 className="font-bold mb-4 flex items-center gap-2"><Calendar className="text-blue-600" size={18}/> Itinerary Draft</h2>
            <p className="text-sm text-slate-500 italic">No draft active. Start a conversation to build your trip.</p>
          </section>

          {/* Right Column: Map & Discovery (Phase 5 Feature) */}
          <section className="flex-1 bg-slate-200 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center relative overflow-hidden shadow-inner">
             <span className="text-slate-400 font-medium flex items-center gap-2"><MapIcon size={20} /> Map View (API Key Required)</span>
          </section>
        </div>
      </div>
    </main>
  );
}