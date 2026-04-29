/**
 * Homepage — root of homegenie.app.
 *
 * Minimal teaser that points to the App Store. The real surface is
 * /wish/[id]; this exists so direct visits to the bare domain don't
 * 404 and so search engines have something to index.
 */
export default function HomePage() {
  const appStoreUrl = process.env.NEXT_PUBLIC_APP_STORE_URL || '#';
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        textAlign: 'center',
      }}
    >
      <h1
        style={{
          fontSize: 'clamp(40px, 8vw, 88px)',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          marginBottom: '16px',
        }}
      >
        HomeGenie
      </h1>
      <p
        style={{
          fontSize: 'clamp(16px, 2.4vw, 22px)',
          color: 'var(--hg-text-soft)',
          maxWidth: '480px',
          marginBottom: '40px',
        }}
      >
        Generate stunning room designs and shop curated furniture.
      </p>
      <a
        href={appStoreUrl}
        style={{
          padding: '16px 32px',
          background: 'var(--hg-white)',
          color: 'var(--hg-blue-primary)',
          borderRadius: '999px',
          fontWeight: 700,
          fontSize: '17px',
        }}
      >
        Get HomeGenie
      </a>
    </main>
  );
}
