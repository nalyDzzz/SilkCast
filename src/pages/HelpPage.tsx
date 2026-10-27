import type { ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Film,
  Keyboard,
  ListVideo,
  MonitorPlay,
  Plug,
  TriangleAlert,
} from 'lucide-react';
import { PLAYER_SHORTCUTS } from '@/components/player/playerShortcuts';
import { ShortcutList } from '@/components/player/ShortcutList';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAppStore } from '@/store/appStore';
import { PageHeader } from '@/components/layouts/PageHeader';

function GuideSection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

const TROUBLESHOOTING: { problem: string; fix: ReactNode }[] = [
  {
    problem: 'A channel shows "Provider refused the stream (HTTP 401/403)"',
    fix: 'Your subscription may have expired, or another device is using your only connection. Stop the other player and press Retry.',
  },
  {
    problem: '"Connection limit reached" (HTTP 429/458/509)',
    fix: 'Providers cap simultaneous streams per account. Close other apps and wait a few seconds before retrying; zapping very quickly can briefly hold two connections.',
  },
  {
    problem: '"The built-in player can\'t decode this stream"',
    fix: (
      <>
        The file uses a container or codec WebView2 can't play (AVI, HEVC on
        some PCs, AC3/DTS audio). Use <strong>Open in MPV</strong>, which plays
        practically everything.
      </>
    ),
  },
  {
    problem: 'Video plays but there is no sound',
    fix: 'Usually AC3/EAC3/DTS audio, which the built-in player cannot decode. Open it in MPV instead.',
  },
  {
    problem: 'Channels or movies are missing or outdated',
    fix: 'Open the source menu in the top bar and choose Refresh source. Providers change their catalogs and stream addresses regularly.',
  },
  {
    problem: 'No programme guide (EPG) information',
    fix: 'Guide data is only available for Xtream sources. Choose Refresh guide in the source menu, or press Ctrl K and run Refresh guide.',
  },
];

export function HelpPage() {
  const mpvAvailable = useAppStore(
    (state) => state.playerEnvironment?.mpv_available ?? null
  );

  return (
    <main className="p-4 md:p-6">
      <section className="mx-auto w-full max-w-3xl space-y-4">
        <PageHeader
          title="Help"
          description="Everything you need to get watching, plus fixes for common stream problems."
        />

        <GuideSection
          icon={<Plug className="size-5" />}
          title="1. Add a source"
          description="SilkCast is a player only; it ships with no channels."
        >
          <p>
            Open the source menu in the top bar and choose{' '}
            <strong>Add source</strong>. You can add either:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>M3U playlist</strong>: a URL (often ending in{' '}
              <code>get.php?…&amp;type=m3u_plus</code>) or a local{' '}
              <code>.m3u</code> file path. Channels, movies, and series are
              detected from the playlist's groups and names.
            </li>
            <li>
              <strong>Xtream provider</strong>: the server address, username,
              and password from your provider. This gives the richest
              experience: separate movie and series catalogs, episode lists, and
              the programme guide.
            </li>
          </ul>
          <p>
            Large catalogs can take a minute to import. Sources are stored only
            on this computer.
          </p>
        </GuideSection>

        <GuideSection icon={<Film className="size-5" />} title="2. Browse">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Search</strong>: press <strong>Ctrl K</strong> anywhere
              to find a channel, movie, series, or group, or to run an action
              such as Refresh guide.
            </li>
            <li>
              <strong>Live TV, Movies, Series</strong>: pick a group, filter the
              list, and tap the heart to favorite. The{' '}
              <strong>Favorites</strong> chip shows only your favorites.
            </li>
            <li>
              Filters, the open series, and your scroll position are kept when
              you open the player and come back.
            </li>
            <li>
              <strong>Live TV</strong> has two views: <strong>Channels</strong>{' '}
              (pick a channel to see what's on now and next, use the arrow keys,
              press Enter to watch) and <strong>Guide</strong> (a timeline of the
              next few hours).
            </li>
            <li>
              <strong>Home</strong> picks up where you left off. Its{' '}
              <strong>Watch history</strong> link lists everything you played, by
              type.
            </li>
          </ul>
        </GuideSection>

        <GuideSection
          icon={<MonitorPlay className="size-5" />}
          title="3. Watch"
          description="Choose your default player in Settings."
        >
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>In-app player</strong> (recommended): plays HLS and
              MPEG-TS live streams and MP4/MKV/WebM files. Live channels
              reconnect on their own when a stream drops.
            </li>
            <li>
              While watching live TV, use the <strong>Channels</strong> panel or
              Page Up/Page Down to switch channels without leaving the player.
            </li>
            <li>
              Movies and episodes <strong>resume where you left off</strong>,
              and the next episode starts automatically after a 10-second
              countdown.
            </li>
            <li className="space-y-1">
              <span>
                <strong>MPV</strong> plays anything (all codecs and containers)
                in its own window. Use <strong>Open in MPV</strong> from the
                player at any time; movies continue from the same position.
              </span>
              <span className="flex flex-wrap items-center gap-2">
                MPV on this PC:
                {mpvAvailable === null ? (
                  <Badge variant="outline">Checking…</Badge>
                ) : mpvAvailable ? (
                  <Badge className="bg-emerald-600 text-white">Detected</Badge>
                ) : (
                  <Badge variant="destructive">Not found</Badge>
                )}
              </span>
              {mpvAvailable === false ? (
                <span className="block">
                  Install it with <code>winget install mpv</code> (or from
                  mpv.io), make sure <code>mpv</code> is on your PATH, then
                  restart SilkCast.
                </span>
              ) : null}
            </li>
          </ul>
        </GuideSection>

        <GuideSection
          icon={<Keyboard className="size-5" />}
          title="Player keyboard shortcuts"
          description="Press ? in the player to see these at any time."
        >
          <ShortcutList shortcuts={PLAYER_SHORTCUTS} />
        </GuideSection>

        <GuideSection
          icon={<TriangleAlert className="size-5" />}
          title="Troubleshooting"
        >
          <dl className="space-y-4">
            {TROUBLESHOOTING.map((entry) => (
              <div key={entry.problem} className="space-y-1">
                <dt className="font-medium text-foreground">{entry.problem}</dt>
                <dd>{entry.fix}</dd>
              </div>
            ))}
          </dl>
        </GuideSection>

        <GuideSection icon={<ListVideo className="size-5" />} title="More">
          <p>
            Change the default player, startup behavior, and theme in{' '}
            <Link
              to="/dashboard/settings"
              className="text-primary underline-offset-4 hover:underline"
            >
              Settings
            </Link>
            . Logs and crash reports are stored in the SilkCast app data folder.
          </p>
        </GuideSection>
      </section>
    </main>
  );
}
