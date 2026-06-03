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
      {/* Skip Link for keyboard navigation */}
      <a
        href="#main-content"
        className="skip-link"
      >
        Skip to main content
      </a>

      {/* Desktop Header */}
      {showNav && (
        <header className="hidden lg:block bg-[var(--bg-card)] border-b border-[var(--border-color)] sticky top-0 z-50">
          <div className={`${maxWidthClass} mx-auto px-6 h-16 flex items-center justify-between`}>
            <div className="flex items-center gap-8">
              {/* Logo */}
              <Link to="/" className="flex items-center hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-[var(--accent-green)] focus:ring-offset-2 focus:ring-offset-[var(--ring-offset)] rounded-lg">
                <img
                  src={`${import.meta.env.BASE_URL}music-bingo-header.svg`}
                  alt="Music Bingo"
                  className="h-10"
                />
              </Link>

              {/* Nav Links */}
              <nav className="flex items-center gap-1" aria-label="Main navigation">
                <Link
                  to="/"
                  aria-current={isHome ? 'page' : undefined}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-green)] focus:ring-offset-2 focus:ring-offset-[var(--ring-offset)] ${
                    isHome
                      ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  Host
                </Link>
                <Link
                  to="/admin"
                  aria-current={isAdmin ? 'page' : undefined}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-green)] focus:ring-offset-2 focus:ring-offset-[var(--ring-offset)] ${
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
            <Link to="/" className="flex items-center focus:outline-none focus:ring-2 focus:ring-[var(--accent-green)] focus:ring-offset-2 focus:ring-offset-[var(--ring-offset)] rounded-lg">
              <img
                src={`${import.meta.env.BASE_URL}music-bingo-header.svg`}
                alt="Music Bingo"
                className="h-8"
              />
            </Link>
            <nav className="flex items-center gap-2" aria-label="Mobile navigation">
              <Link
                to={isAdmin ? '/' : '/admin'}
                className="px-4 py-2.5 min-h-[44px] flex items-center text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-green)] focus:ring-offset-2 focus:ring-offset-[var(--ring-offset)] rounded-lg"
              >
                {isAdmin ? 'Host' : 'Admin'}
              </Link>
              <ThemeToggle />
            </nav>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main id="main-content" className={`flex-1 ${centered ? 'flex items-center justify-center' : ''}`}>
        <div className={`${maxWidthClass} mx-auto px-4 lg:px-6 py-6 lg:py-8 w-full`}>
          {children}
        </div>
      </main>

      {/* Footer - Desktop only */}
      <footer className="hidden lg:block border-t border-[var(--border-color)] bg-[var(--bg-card)]">
        <div className={`${maxWidthClass} mx-auto px-6 py-4 flex items-center justify-between text-sm text-[var(--text-muted)]`}>
          <span>One More Tune Bingo</span>
          <span>Built for live events</span>
        </div>
      </footer>
    </div>
  );
}
