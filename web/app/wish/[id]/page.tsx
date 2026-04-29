/**
 * /wish/[id] — branded share landing page.
 *
 * This is the page recipients land on when someone shares a HomeGenie
 * wish via iMessage / link. iMessage rich preview is driven by
 * generateMetadata's Open Graph block — recipient sees a card with the
 * design image, the prompt as title, and the homegenie.app URL instead
 * of the raw Supabase storage URL.
 *
 * The page itself shows the design at hero size with the prompt as
 * caption and a single "Get HomeGenie" CTA. On iOS, the URL is also
 * a Universal Link target — if the app is installed, the recipient
 * deep-links straight into the app and never sees this page.
 *
 * Server component: data fetched at request time via the get_shared_wish
 * RPC. Increments view_count as a side effect of the RPC, so we get
 * organic share-funnel telemetry without an extra round trip.
 */
import type { Metadata } from 'next';
import { fetchSharedWish } from '@/lib/supabase';

interface Props {
  params: { id: string };
}

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://homegenie.app';
const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL || '#';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const wish = await fetchSharedWish(params.id);
  if (!wish) {
    return {
      title: 'HomeGenie · Wish not found',
      description: 'This wish is no longer available.',
    };
  }
  const promptLine = wish.prompt?.trim() || 'A HomeGenie wish';
  const ogTitle = `HomeGenie · ${truncate(promptLine, 70)}`;
  const ogDescription = `${truncate(promptLine, 180)} — make yours free on HomeGenie.`;
  const canonical = `${SITE_ORIGIN}/wish/${params.id}`;
  return {
    title: ogTitle,
    description: ogDescription,
    alternates: { canonical },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: canonical,
      siteName: 'HomeGenie',
      images: [{ url: wish.image_url, width: 1200, height: 1200, alt: promptLine }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: ogDescription,
      images: [wish.image_url],
    },
  };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

export default async function WishPage({ params }: Props) {
  const wish = await fetchSharedWish(params.id);

  if (!wish) {
    return (
      <main style={styles.notFoundRoot}>
        <h1 style={styles.notFoundTitle}>Wish not found</h1>
        <p style={styles.notFoundBody}>
          This wish is no longer available. Make your own on HomeGenie.
        </p>
        <a href={APP_STORE_URL} style={styles.cta}>Get HomeGenie</a>
      </main>
    );
  }

  return (
    <main style={styles.root}>
      <header style={styles.header}>
        <span style={styles.brandWordmark}>HomeGenie</span>
      </header>

      <section style={styles.heroFrame}>
        {/* Plain <img> instead of next/image: the source is a Supabase URL
            with no defined dimensions — sizing is driven by CSS aspect
            container instead of next/image's required width/height. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={wish.image_url} alt={wish.prompt || 'HomeGenie design'} style={styles.heroImage} />
      </section>

      {wish.prompt && (
        <p style={styles.caption}>“{wish.prompt}”</p>
      )}

      <a href={APP_STORE_URL} style={styles.cta}>
        Get HomeGenie
      </a>
      <p style={styles.subCta}>
        Free on iOS · Make your own wish
      </p>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    maxWidth: '720px',
    margin: '0 auto',
    padding: '40px 24px 80px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '32px',
  },
  brandWordmark: {
    fontSize: '28px',
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  heroFrame: {
    width: '100%',
    aspectRatio: '1 / 1',
    background: 'rgba(255,255,255,0.04)',
    borderRadius: '24px',
    overflow: 'hidden',
    boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
    marginBottom: '24px',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  caption: {
    fontSize: '17px',
    lineHeight: 1.5,
    color: 'var(--hg-text-soft)',
    fontStyle: 'italic',
    textAlign: 'center',
    maxWidth: '560px',
    marginBottom: '32px',
  },
  cta: {
    padding: '16px 36px',
    background: 'var(--hg-white)',
    color: 'var(--hg-blue-primary)',
    borderRadius: '999px',
    fontWeight: 700,
    fontSize: '17px',
    marginBottom: '12px',
  },
  subCta: {
    fontSize: '13px',
    color: 'var(--hg-text-faint)',
  },
  notFoundRoot: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
    textAlign: 'center',
  },
  notFoundTitle: {
    fontSize: '32px',
    fontWeight: 800,
    marginBottom: '16px',
  },
  notFoundBody: {
    fontSize: '17px',
    color: 'var(--hg-text-soft)',
    maxWidth: '420px',
    marginBottom: '32px',
  },
};
