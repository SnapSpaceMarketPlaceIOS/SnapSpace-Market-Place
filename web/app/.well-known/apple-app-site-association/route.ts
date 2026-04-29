/**
 * Apple App Site Association — Universal Links discovery file.
 *
 * Apple fetches this from https://homegenie.app/.well-known/apple-app-site-association
 * once after install. If the response is valid, tapping a homegenie.app/wish/<id>
 * link in iMessage / Mail / Safari opens HomeGenie directly into the app
 * instead of bouncing through the browser.
 *
 * Served via a route handler (not a static file) so the Content-Type is
 * exactly `application/json` — Apple is strict about this.
 *
 * Team ID + bundle ID match app.json:
 *   - DEVELOPMENT_TEAM = X4MD8GSG95
 *   - bundleIdentifier  = com.anthonyrivera.snapspace
 */
export const dynamic = 'force-static';

export function GET() {
  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appID: 'X4MD8GSG95.com.anthonyrivera.snapspace',
          paths: ['/wish/*', '/wish'],
        },
      ],
    },
  };
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
