import React from 'react';

export default function BudgetSkeleton() {
  return (
    <div className="flex flex-col items-end gap-2 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="text-right w-32">
          {/* Mock Total and Limit Amounts */}
          <div className="h-6 w-full bg-white/10 rounded"></div>
          {/* Mock Progress Bar */}
          <div className="w-full bg-white/5 rounded-full h-1.5 mt-2 overflow-hidden">
            <div className="h-full w-1/2 bg-white/10 rounded-full"></div>
          </div>
        </div>
        {/* Mock Toggle Button */}
        <div className="h-7 w-32 bg-white/10 rounded-full"></div>
      </div>
    </div>
  );
}