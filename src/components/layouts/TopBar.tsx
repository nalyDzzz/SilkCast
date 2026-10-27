import { Link, NavLink } from 'react-router';
import { CircleHelp, Search, Settings } from 'lucide-react';
import { Wordmark } from '@/components/brand/BrandMark';
import { useCommandPaletteStore } from '@/components/command/commandPaletteStore';
import { SourceSwitcher } from '@/components/sources/SourceSwitcher';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { label: 'Home', to: '/dashboard', end: true },
  { label: 'Live TV', to: '/dashboard/live', end: false },
  { label: 'Movies', to: '/dashboard/movies', end: false },
  { label: 'Series', to: '/dashboard/series', end: false },
];

function IconLink({ to, label, children }: { to: string; label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={to}
          aria-label={label}
          className="grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-[current=page]:text-foreground [&_svg]:size-[19px]"
        >
          {children}
        </NavLink>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The app's only navigation: wordmark, sections, global search (Ctrl K), the
 * source switcher and settings. Floats over the Home hero when `overlay` is set.
 */
export function TopBar({ overlay = false, solid = true }: { overlay?: boolean; solid?: boolean }) {
  const openPalette = useCommandPaletteStore((state) => state.setOpen);

  return (
    <header
      className={cn(
        'z-40 flex h-16 shrink-0 items-center gap-8 px-6 transition-colors duration-300 lg:px-8',
        overlay ? 'absolute inset-x-0 top-0' : 'relative',
        solid
          ? 'border-b border-border bg-background/92 backdrop-blur-md'
          : 'border-b border-transparent bg-linear-to-b from-background/80 via-background/35 to-transparent'
      )}
    >
      <Link to="/dashboard" aria-label="SilkCast home" className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <Wordmark />
      </Link>

      <nav aria-label="Main" className="flex items-center gap-6">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="relative py-2 text-[15px] font-medium text-muted-foreground transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-thread after:opacity-0 after:transition-opacity hover:text-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-[current=page]:text-foreground aria-[current=page]:after:opacity-100"
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="ml-auto flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          onClick={() => openPalette(true)}
          className="hidden h-10 w-80 min-w-0 items-center gap-2.5 rounded-full border border-border bg-foreground/[0.04] pr-2 pl-4 text-left text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.08] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:flex xl:w-96"
        >
          <Search className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Search channels, movies and series</span>
          <Kbd className="bg-foreground/[0.08]">Ctrl K</Kbd>
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => openPalette(true)}
              aria-label="Search"
              className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden"
            >
              <Search className="size-[19px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Search (Ctrl K)</TooltipContent>
        </Tooltip>
        <SourceSwitcher />
        <IconLink to="/dashboard/help" label="Help">
          <CircleHelp />
        </IconLink>
        <IconLink to="/dashboard/settings" label="Settings">
          <Settings />
        </IconLink>
      </div>
    </header>
  );
}
