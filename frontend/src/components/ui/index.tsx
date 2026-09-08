import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/* Small, owned-in-repo primitives in the shadcn spirit: copied source we can
   edit, not a dependency to fight. */

const variants = {
  primary: 'bg-teal-700 text-white hover:bg-teal-800 disabled:bg-teal-700/50',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
} as const

const sizes = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-6 text-base',
} as const

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
}

export function Button({
  variant = 'primary', size = 'md', className, ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant], sizes[size], className,
      )}
      {...props}
    />
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-lg border border-slate-200 bg-white', className)}>
      {children}
    </div>
  )
}

export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {action}
    </div>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm',
        'placeholder:text-slate-400 focus:border-teal-600 focus:outline-none',
        'focus:ring-2 focus:ring-teal-600/20 disabled:bg-slate-50',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm',
        'focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export function Field({
  label, error, hint, children,
}: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-slate-500">{hint}</span>}
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </label>
  )
}

export function Badge({
  tone = 'slate', children,
}: { tone?: 'slate' | 'green' | 'amber' | 'red' | 'teal'; children: ReactNode }) {
  const tones = {
    slate: 'border-slate-300 bg-slate-100 text-slate-700',
    green: 'border-green-800/25 bg-green-100 text-green-800',
    amber: 'border-amber-700/30 bg-amber-50 text-amber-800',
    red: 'border-red-700/30 bg-red-50 text-red-800',
    teal: 'border-teal-700/25 bg-teal-50 text-teal-800',
  }
  return (
    <span
      className={cn(
        'inline-flex rounded-xs border px-1.5 py-0.5 text-xs font-medium tabular-nums',
        tones[tone],
      )}
    >
      {children}
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-teal-700',
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  )
}
