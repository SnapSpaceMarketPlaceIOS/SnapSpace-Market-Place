/**
 * SnapSpace — amazon-search Edge Function
 *
 * Proxies Amazon Product Advertising API v5 SearchItems.
 * Credentials stay server-side; the mobile app never touches the secret key.
 *
 * Required secrets (set in Supabase Dashboard → Edge Functions → Secrets):
 *   AMAZON_ACCESS_KEY   — PA-API Access Key (available after 10 qualifying sales)
 *   AMAZON_SECRET_KEY   — PA-API Secret Key (available after 10 qualifying sales)
 *
 * Returns:
 *   { products: AffiliateProduct[], source: "amazon" | "unavailable" | "error" }
 */

const PARTNER_TAG = "snapspacemkt-20";
const REGION      = "us-east-1";
const HOST        = "webservices.amazon.com";
const ENDPOINT    = `https://${HOST}/paapi5/searchitems`;
const TARGET      = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems";
const SERVICE     = "ProductAdvertisingAPI";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Category mapping: our room types → Amazon SearchIndex + keyword boosts ──

const ROOM_INDEX: Record<string, string> = {
  "living-room":  "HomeAndKitchen",
  "bedroom":      "HomeAndKitchen",
  "kitchen":      "HomeAndKitchen",
  "dining-room":  "HomeAndKitchen",
  "office":       "HomeAndKitchen",
  "bathroom":     "HomeAndKitchen",
  "outdoor":      "Lawn&Garden",
  "nursery":      "Baby",
};

// ── AWS Signature V4 helpers ─────────────────────────────────────────────────

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(message: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(message),
  );
  return toHex(buf);
}

async function hmacSha256(
  key: ArrayBuffer | string,
  message: string,
): Promise<ArrayBuffer> {
  const keyBuf =
    typeof key === "string"
      ? new TextEncoder().encode(key)
      : key;

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}

async function getSigningKey(
  secretKey: string,
  dateStamp: string,
): Promise<ArrayBuffer> {
  const kDate    = await hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion  = await hmacSha256(kDate, REGION);
  const kService = await hmacSha256(kRegion, SERVICE);
  return hmacSha256(kService, "aws4_request");
}

async function signRequest(
  body: string,
  accessKey: string,
  secretKey: string,
): Promise<Record<string, string>> {
  const now        = new Date();
  const amzDate    = now.toISOString().replace(/[:\-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp  = amzDate.slice(0, 8);

  const bodyHash   = await sha256(body);

  // Canonical headers — must be sorted and lowercased
  const canonicalHeaders =
    `content-encoding:amz-1.0\n` +
    `content-type:application/json; charset=UTF-8\n` +
    `host:${HOST}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${TARGET}\n`;

  const signedHeaders = "content-encoding;content-type;host;x-amz-date;x-amz-target";

  const canonicalRequest = [
    "POST",
    "/paapi5/searchitems",
    "",                   // no query string
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join("\n");

  const signingKey = await getSigningKey(secretKey, dateStamp);
  const sigBuf     = await hmacSha256(signingKey, stringToSign);
  const signature  = toHex(sigBuf);

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    "Authorization":    authorization,
    "Content-Encoding": "amz-1.0",
    "Content-Type":     "application/json; charset=UTF-8",
    "Host":             HOST,
    "X-Amz-Date":       amzDate,
    "X-Amz-Target":     TARGET,
  };
}

// ── Result normalization ─────────────────────────────────────────────────────

interface AmazonItem {
  ASIN?: string;
  ItemInfo?: {
    Title?: { DisplayValue?: string };
    ByLineInfo?: { Brand?: { DisplayValue?: string } };
  };
  Images?: {
    Primary?: { Medium?: { URL?: string } };
  };
  Offers?: {
    Listings?: Array<{ Price?: { Amount?: number; DisplayAmount?: string } }>;
  };
  CustomerReviews?: {
    Count?: number;
    StarRating?: { Value?: number };
  };
}

function normalizeItems(items: AmazonItem[], searchIndex: string): object[] {
  return items.map((item) => {
    const asin        = item.ASIN ?? "";
    const title       = item.ItemInfo?.Title?.DisplayValue ?? "Product";
    const brand       = item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue ?? "Amazon";
    const imageUrl    = item.Images?.Primary?.Medium?.URL ?? "";
    const listing     = item.Offers?.Listings?.[0];
    const price       = listing?.Price?.Amount ?? 0;
    const priceDisplay = listing?.Price?.DisplayAmount ?? `$${price.toFixed(2)}`;
    const rating      = item.CustomerReviews?.StarRating?.Value ?? 4.0;
    const reviewCount = item.CustomerReviews?.Count ?? 0;
    const affiliateUrl = `https://www.amazon.com/dp/${asin}?tag=${PARTNER_TAG}`;

    const category = inferCategory(title);
    const styles   = inferStyles(title);

    return {
      id:           `amz-live-${asin}`,
      name:         title,
      brand,
      price,
      priceDisplay,
      imageUrl,
      affiliateUrl,
      source:       "amazon",
      category,
      styles,
      roomType:     searchIndexToRoomType(searchIndex),
      materials:    [],
      rating,
      reviewCount,
      description:  "",
    };
  });
}

function inferCategory(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("sofa") || t.includes("couch") || t.includes("sectional")) return "sofa";
  if (t.includes("chair") && !t.includes("desk") && !t.includes("office")) return "accent-chair";
  if (t.includes("desk") || t.includes("office chair") || t.includes("task chair")) return "desk";
  if (t.includes("table") && t.includes("dining")) return "dining-table";
  if (t.includes("coffee table") || t.includes("cocktail table")) return "coffee-table";
  if (t.includes("bed frame") || t.includes("headboard") || t.includes("platform bed")) return "bed";
  if (t.includes("dresser") || t.includes("chest of drawers")) return "dresser";
  if (t.includes("nightstand") || t.includes("night stand")) return "nightstand";
  if (t.includes("lamp") || t.includes("floor lamp") || t.includes("table lamp")) return "lamp";
  if (t.includes("rug") || t.includes("area rug")) return "rug";
  if (t.includes("mirror")) return "mirror";
  if (t.includes("bookshelf") || t.includes("bookcase")) return "bookshelf";
  if (t.includes("pillow")) return "throw-pillow";
  if (t.includes("curtain") || t.includes("drape")) return "curtains";
  if (t.includes("planter") || t.includes("plant pot")) return "planter";
  if (t.includes("vase")) return "vase";
  if (t.includes("wall art") || t.includes("canvas") || t.includes("painting")) return "wall-art";
  return "decor";
}

function inferStyles(title: string): string[] {
  const t = title.toLowerCase();
  const styles: string[] = [];
  if (t.includes("modern") || t.includes("contemporary")) styles.push("modern");
  if (t.includes("minimalist") || t.includes("minimal")) styles.push("minimalist");
  if (t.includes("mid-century") || t.includes("mid century")) styles.push("mid-century");
  if (t.includes("bohemian") || t.includes("boho")) styles.push("bohemian");
  if (t.includes("rustic") || t.includes("farmhouse")) styles.push("rustic");
  if (t.includes("industrial")) styles.push("industrial");
  if (t.includes("scandinavian") || t.includes("nordic")) styles.push("scandinavian");
  if (t.includes("coastal") || t.includes("beach")) styles.push("coastal");
  return styles.length ? styles : ["contemporary"];
}

function searchIndexToRoomType(index: string): string {
  if (index === "Lawn&Garden") return "outdoor";
  if (index === "Baby") return "nursery";
  return "living-room";
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const accessKey = Deno.env.get("AMAZON_ACCESS_KEY");
  const secretKey = Deno.env.get("AMAZON_SECRET_KEY");

  // Graceful degradation — credentials not set yet (PA-API locked until 10 sales)
  if (!accessKey || !secretKey) {
    return new Response(
      JSON.stringify({ products: [], source: "unavailable" }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  const { keywords = "home furniture", roomType = "living-room", limit = 6 } =
    await req.json().catch(() => ({}));

  const searchIndex = ROOM_INDEX[roomType] ?? "HomeAndKitchen";

  const requestBody = JSON.stringify({
    Keywords:     keywords,
    Resources:    [
      "Images.Primary.Medium",
      "ItemInfo.Title",
      "ItemInfo.ByLineInfo",
      "Offers.Listings.Price",
      "CustomerReviews.Count",
      "CustomerReviews.StarRating",
    ],
    SearchIndex:  searchIndex,
    PartnerTag:   PARTNER_TAG,
    PartnerType:  "Associates",
    Marketplace:  "www.amazon.com",
    ItemCount:    Math.min(limit, 10),
  });

  try {
    const headers = await signRequest(requestBody, accessKey, secretKey);

    const res = await fetch(ENDPOINT, {
      method:  "POST",
      headers,
      body:    requestBody,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("PA-API error:", res.status, errText);
      return new Response(
        JSON.stringify({ products: [], source: "error" }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const data     = await res.json();
    const items    = data?.SearchResult?.Items ?? [];
    const products = normalizeItems(items, searchIndex);

    return new Response(
      JSON.stringify({ products, source: "amazon" }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("amazon-search error:", err);
    return new Response(
      JSON.stringify({ products: [], source: "error" }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
