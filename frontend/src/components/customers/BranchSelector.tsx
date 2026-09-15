import { Building2, ChevronDown } from 'lucide-react';

export type Branch = {
  id: string;
  name: string;
  description?: string;
};

export default function BranchSelector({
  branches,
  value,
  onChange,
  className = '',
}: {
  branches: Branch[];
  value: string;
  onChange: (storeId: string) => void;
  className?: string;
}) {
  return (
    <div className={`relative min-w-[220px] ${className}`}>
      <Building2 size={17} className="absolute right-4 top-1/2 -translate-y-1/2 text-labbaik-blue pointer-events-none" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full appearance-none bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl py-3.5 pr-11 pl-10 text-sm font-black text-neutral-900 dark:text-white outline-none focus:ring-2 focus:ring-labbaik-blue/30 shadow-sm"
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id} className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white">
            {branch.name}
          </option>
        ))}
      </select>
      <ChevronDown size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
    </div>
  );
}
