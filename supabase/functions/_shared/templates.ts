/**
 * SnapSpace Marketplace — Transactional Email Templates
 * All templates return { subject, html } ready to pass to the Resend API.
 * Brand palette: Blue #0B6DC3, Dark text #111827, Muted #6B7280
 */

const BASE_URL = Deno.env.get('APP_URL') ?? 'https://snapspace.app';

// ─── Shared layout wrapper ────────────────────────────────────────────────────

function layout(content: string, previewText = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <!--[if !mso]><!-->
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <!--<![endif]-->
  <title>SnapSpace</title>
  <style>
    body { margin: 0; padding: 0; background: #F3F4F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-text-size-adjust: 100%; }
    .wrapper { max-width: 560px; margin: 40px auto; }
    .card { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .header { background: #0B6DC3; padding: 28px 32px; }
    .wordmark { font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px; }
    .body { padding: 32px; color: #111827; }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px; color: #111827; }
    p { font-size: 15px; line-height: 1.6; color: #374151; margin: 0 0 16px; }
    .muted { color: #6B7280; font-size: 13px; }
    .btn { display: inline-block; background: #0B6DC3; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 15px; font-weight: 600; margin: 8px 0 20px; }
    .btn-outline { display: inline-block; border: 2px solid #0B6DC3; color: #0B6DC3 !important; text-decoration: none; padding: 10px 26px; border-radius: 8px; font-size: 15px; font-weight: 600; }
    .divider { border: none; border-top: 1px solid #E5E7EB; margin: 24px 0; }
    .badge { display: inline-block; background: #EFF6FF; color: #1D4ED8; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 20px; margin-bottom: 16px; }
    .status-approved { background: #D1FAE5; color: #065F46; }
    .status-rejected { background: #FEE2E2; color: #991B1B; }
    .status-pending  { background: #FEF3C7; color: #92400E; }
    .info-row { display: flex; padding: 8px 0; border-bottom: 1px solid #F3F4F6; }
    .info-label { font-size: 13px; color: #6B7280; min-width: 140px; }
    .info-value { font-size: 13px; color: #111827; font-weight: 500; }
    .footer { padding: 20px 32px; text-align: center; }
    .footer p { font-size: 12px; color: #9CA3AF; margin: 0; line-height: 1.5; }
    .footer a { color: #6B7280; }
  </style>
</head>
<body>
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;">${previewText}&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;</div>` : ''}
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="wordmark">SnapSpace</div>
      </div>
      <div class="body">
        ${content}
      </div>
    </div>
    <div class="footer">
      <p>
        SnapSpace Marketplace &bull; <a href="${BASE_URL}">snapspace.app</a><br />
        You're receiving this because you have an account with us.<br />
        <a href="${BASE_URL}/unsubscribe">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ─── 1. Welcome ───────────────────────────────────────────────────────────────

export function welcome(recipientName: string): { subject: string; html: string } {
  return {
    subject: 'Welcome to SnapSpace 👋',
    html: layout(`
      <h1>Welcome to SnapSpace, ${recipientName}!</h1>
      <p>Your email is verified and your account is ready. Start exploring thousands of unique designs — or apply to become a Verified Supplier and sell to our community.</p>
      <a href="${BASE_URL}" class="btn">Browse Designs</a>
      <hr class="divider" />
      <p class="muted">Want to sell on SnapSpace? Head to your Profile and tap <strong>Sell on SnapSpace</strong> to apply.</p>
    `, `Welcome! Your SnapSpace account is ready.`),
  };
}

// ─── 2. Application Received ──────────────────────────────────────────────────

export function applicationReceived(
  recipientName: string,
  businessName: string,
): { subject: string; html: string } {
  return {
    subject: `We received your supplier application — ${businessName}`,
    html: layout(`
      <span class="badge status-pending">Under Review</span>
      <h1>Application received!</h1>
      <p>Hi ${recipientName}, we've received your supplier application for <strong>${businessName}</strong> and it's now in our review queue.</p>
      <p>Our team typically reviews applications within <strong>2–3 business days</strong>. We'll email you as soon as a decision is made.</p>
      <a href="${BASE_URL}/application-status" class="btn">Check Status</a>
      <hr class="divider" />
      <p class="muted">In the meantime, keep browsing and shopping on SnapSpace. Your consumer account remains fully active.</p>
    `, `Your application for ${businessName} is under review.`),
  };
}

// ─── 3. Application Approved ──────────────────────────────────────────────────

export function applicationApproved(
  recipientName: string,
  businessName: string,
): { subject: string; html: string } {
  return {
    subject: `🎉 You're approved! Welcome to the SnapSpace Supplier Program`,
    html: layout(`
      <span class="badge status-approved">✓ Approved</span>
      <h1>Congratulations, ${recipientName}!</h1>
      <p>Your application for <strong>${businessName}</strong> has been approved. You're now a Verified Supplier on SnapSpace — complete with the blue verification badge.</p>
      <p>Set up your storefront, add your first products, and start selling to our community today.</p>
      <a href="${BASE_URL}/supplier/onboarding" class="btn">Set Up My Store →</a>
      <hr class="divider" />
      <p class="muted">As a Verified Supplier you can list products, track orders, and access your seller dashboard from the Profile tab.</p>
    `, `Your SnapSpace supplier application was approved!`),
  };
}

// ─── 4. Application Rejected ──────────────────────────────────────────────────

export function applicationRejected(
  recipientName: string,
  businessName: string,
  reason: string | null,
): { subject: string; html: string } {
  const reasonSection = reason
    ? `<p><strong>Reviewer notes:</strong><br /><em style="color:#4B5563;">"${reason}"</em></p><hr class="divider" />`
    : `<hr class="divider" />`;

  return {
    subject: `Update on your SnapSpace supplier application`,
    html: layout(`
      <span class="badge status-rejected">Application Update</span>
      <h1>Application not approved</h1>
      <p>Hi ${recipientName}, after reviewing your application for <strong>${businessName}</strong> we're unable to approve it at this time.</p>
      ${reasonSection}
      <p>You're welcome to reapply in 30 days if your situation changes. If you have questions, reply to this email.</p>
      <a href="${BASE_URL}" class="btn-outline">Return to SnapSpace</a>
    `, `Update on your supplier application for ${businessName}.`),
  };
}

// ─── 5. New Order (to supplier) ───────────────────────────────────────────────

export function newOrder(
  supplierName: string,
  order: {
    id: string;
    product_title: string;
    quantity: number;
    subtotal: number;
    buyer_name: string;
    shipping_name: string;
    shipping_address: Record<string, string>;
  },
): { subject: string; html: string } {
  const addr = order.shipping_address ?? {};
  const addrLine = [addr.line1, addr.city, addr.state, addr.zip, addr.country]
    .filter(Boolean)
    .join(', ');

  return {
    subject: `New order #${order.id.slice(0, 8).toUpperCase()} — ${order.product_title}`,
    html: layout(`
      <span class="badge">New Order</span>
      <h1>You have a new order!</h1>
      <p>Hi ${supplierName}, someone just purchased from your SnapSpace store.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td class="info-label">Order ID</td><td class="info-value">#${order.id.slice(0, 8).toUpperCase()}</td></tr>
        <tr><td class="info-label">Product</td><td class="info-value">${order.product_title}</td></tr>
        <tr><td class="info-label">Quantity</td><td class="info-value">${order.quantity}</td></tr>
        <tr><td class="info-label">Order Total</td><td class="info-value"><strong>$${(order.subtotal / 100).toFixed(2)}</strong></td></tr>
        <tr><td class="info-label">Ship To</td><td class="info-value">${order.shipping_name}<br /><span style="color:#6B7280">${addrLine}</span></td></tr>
      </table>
      <a href="${BASE_URL}/supplier/orders" class="btn">View in Dashboard</a>
      <hr class="divider" />
      <p class="muted">Mark it as fulfilled once it ships to keep your buyer updated.</p>
    `, `New order: ${order.product_title} (qty ${order.quantity})`),
  };
}

// ─── 6. Order Fulfilled (to buyer) ───────────────────────────────────────────

export function orderFulfilled(
  buyerName: string,
  order: {
    id: string;
    product_title: string;
    quantity: number;
    subtotal: number;
    tracking_number: string | null;
    supplier_name: string;
  },
): { subject: string; html: string } {
  const trackingSection = order.tracking_number
    ? `<p>Your tracking number is: <strong style="font-size:16px;color:#0B6DC3;">${order.tracking_number}</strong></p>`
    : `<p>Your supplier will update the tracking information shortly.</p>`;

  return {
    subject: `Your SnapSpace order has shipped! 📦`,
    html: layout(`
      <span class="badge status-approved">Shipped</span>
      <h1>Your order is on its way, ${buyerName}!</h1>
      <p><strong>${order.product_title}</strong> (qty ${order.quantity}) has been shipped by ${order.supplier_name}.</p>
      ${trackingSection}
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td class="info-label">Order ID</td><td class="info-value">#${order.id.slice(0, 8).toUpperCase()}</td></tr>
        <tr><td class="info-label">Order Total</td><td class="info-value">$${(order.subtotal / 100).toFixed(2)}</td></tr>
        <tr><td class="info-label">Sold by</td><td class="info-value">${order.supplier_name}</td></tr>
      </table>
      <a href="${BASE_URL}/orders" class="btn">View My Orders</a>
      <hr class="divider" />
      <p class="muted">Questions about your order? Reply to this email or contact the seller through your order page.</p>
    `, `Your order of ${order.product_title} has shipped!`),
  };
}
