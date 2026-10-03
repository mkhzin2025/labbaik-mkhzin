import { User as UserIcon } from 'lucide-react';

const PALETTE = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#4f46e5'];

const colorFor = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
};

// WhatsApp does not expose customer profile photos, so we show the name's initials on a stable color.
export const getInitials = (name?: string | null) => {
  const words = String(name || '').trim().split(/\s+/).filter((w) => w && !/^[0-9+]/.test(w));
  if (!words.length) return '';
  return words.length === 1 ? Array.from(words[0])[0] : `${Array.from(words[0])[0]}${Array.from(words[1])[0]}`;
};

export default function CustomerAvatar({ name, seed, size = 48, className = '' }: { name?: string | null; seed?: string; size?: number; className?: string }) {
  const initials = getInitials(name);
  const color = colorFor(seed || name || '');
  return (
    <div
      className={`shrink-0 ${/\brounded-/.test(className) ? '' : 'rounded-2xl'} flex items-center justify-center font-black text-white shadow-sm select-none ${className}`}
      style={{ width: size, height: size, backgroundColor: initials ? color : undefined, fontSize: size * 0.36 }}
    >
      {initials || <UserIcon size={size * 0.5} className="text-neutral-500 dark:text-neutral-400" />}
    </div>
  );
}
