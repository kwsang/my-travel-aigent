'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface ThemedSelectProps {
  label?: string;
  icon?: LucideIcon;
  value: string;
  onChange: (value: string) => void;
  options: Option[] | string[];
  className?: string;
  selectClassName?: string;
}

export default function ThemedSelect({
  label,
  icon: Icon,
  value,
  onChange,
  options,
  className = "",
  selectClassName = "",
}: ThemedSelectProps) {
  const normalizedOptions = options.map((opt) =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
          {Icon && <Icon size={14} />} {label}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-white-outline focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer transition-all ${selectClassName}`}
      >
        {normalizedOptions.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-card text-white">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
