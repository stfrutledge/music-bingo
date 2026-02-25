import { Link, useLocation } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';
import type { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showNav?: boolean;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  centered?: boolean;
}

export function AppShell({
  children,
  title,
  subtitle,
  showNav = true,
  maxWidth = 'xl',
  centered = false,
}: AppShellProps) {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const isHome = location.pathname === '/';

  const maxWidthClass = {
    sm: 'max-w-xl',
    md: 'max-w-3xl',
    lg: 'max-w-5xl',
    xl: 'max-w-7xl',
    full: 'max-w-full',
  }[maxWidth];

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)] flex flex-col">
      {/* Desktop Header */}
      {showNav && (
        <header className="hidden lg:block bg-[var(--bg-card)] border-b border-[var(--border-color)] sticky top-0 z-50">
          <div className={`${maxWidthClass} mx-auto px-6 h-16 flex items-center justify-between`}>
            <div className="flex items-center gap-8">
              {/* Logo */}
              <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <div className="w-9 h-9 rounded-lg bg-[var(--accent-green)] flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
                <span className="text-lg font-semibold text-[var(--text-primary)]">Music Bingo</span>
              </Link>

              {/* Nav Links */}
              <nav className="flex items-center gap-1">
                <Link
                  to="/"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isHome
                      ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  Host
                </Link>
                <Link
                  to="/admin"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isAdmin
                      ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  Admin
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-4">
              {title && (
                <div className="text-right mr-4">
                  <div className="text-sm font-medium text-[var(--text-primary)]">{title}</div>
                  {subtitle && <div className="text-xs text-[var(--text-secondary)]">{subtitle}</div>}
                </div>
              )}
              <ThemeToggle />
            </div>
          </div>
        </header>
      )}

      {/* Mobile Header */}
      {showNav && (
        <header className="lg:hidden bg-[var(--bg-card)] border-b border-[var(--border-color)] sticky top-0 z-50">
          <div className="px-4 h-14 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent-green)] flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
              <span className="font-semibold text-[var(--text-primary)]">Music Bingo</span>
            </Link>
            <div className="flex items-center gap-2">
              <Link
                to={isAdmin ? '/' : '/admin'}
                className="px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                {isAdmin ? 'Host' : 'Admin'}
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className={`flex-1 ${centered ? 'flex items-center justify-center' : ''}`}>
        <div className={`${maxWidthClass} mx-auto px-4 lg:px-6 py-6 lg:py-8 w-full`}>
          {children}
        </div>
      </main>

      {/* Footer - Desktop only */}
      <footer className="hidden lg:block border-t border-[var(--border-color)] bg-[var(--bg-card)]">
        <div className={`${maxWidthClass} mx-auto px-6 py-4 flex items-center justify-between text-sm text-[var(--text-muted)]`}>
          <span>Music Bingo Host</span>
          <span>Built for live events</span>
        </div>
      </footer>
    </div>
  );
}
