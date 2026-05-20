import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children: React.ReactNode;
}

const variantClasses = {
  primary: 'bg-[var(--accent-green)] text-white hover:bg-[var(--accent-green-light)] focus:ring-[var(--accent-green)]',
  secondary: 'bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-color)] hover:bg-[var(--bg-card)] hover:border-[var(--border-strong)] focus:ring-[var(--accent-teal)]',
  success: 'bg-[var(--accent-green)] text-white hover:bg-[var(--accent-green-light)] focus:ring-[var(--accent-green)]',
  danger: 'bg-red-600 text-white hover:bg-red-500 focus:ring-red-500',
  ghost: 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus:ring-[var(--accent-teal)]',
};

const sizeClasses = {
  // Mobile-first: ensure 44px minimum touch target, then allow smaller on desktop
  sm: 'px-4 py-2.5 text-xs min-h-[44px] sm:min-h-0 sm:px-3 sm:py-1.5',
  md: 'px-4 py-3 text-sm min-h-[44px] sm:min-h-0 sm:py-2',
  lg: 'px-8 py-4 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center
        font-semibold tracking-wide
        rounded-lg transition-all duration-150
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--ring-offset)]
        focus-visible:ring-2 focus-visible:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
