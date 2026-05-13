import React from 'react';

export default function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-10 py-4 animate-pulse">
      {[1, 2].map((day) => (
        <div key={day} className="flex flex-col gap-4">
          <div className="sticky top-0 z-10 -mx-6 bg-card/80 px-6 py-2 border-y border-white/5 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <div className="h-6 w-20 bg-white/10 rounded"></div>
              <div className="h-4 w-16 bg-white/5 rounded"></div>
            </div>
            <div className="h-4 w-4 bg-white/5 rounded-full"></div>
          </div>
          <div className="relative space-y-4 pl-6 pb-4 border-l-2 border-white/10">
            {[1, 2, 3].map((item) => (
              <div key={`${day}-skel-${item}`} className="relative rounded-xl border border-white/5 bg-white/5 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-2 w-2/3">
                    <div className="h-3 w-24 bg-white/10 rounded"></div>
                    <div className="h-5 w-3/4 bg-white/20 rounded"></div>
                    <div className="h-4 w-1/2 bg-white/10 rounded"></div>
                  </div>
                  <div className="flex flex-col items-end gap-2 w-1/3">
                    <div className="h-4 w-16 bg-white/10 rounded"></div>
                    <div className="h-4 w-20 bg-white/10 rounded"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}