# SnapSpace — AI-Powered Interior Design Marketplace

## Quick Start

```bash
npm install
npx expo start          # Dev server (press i for iOS simulator, a for Android)
npx expo start --web    # Web preview
```

## Stack

- **Framework:** React Native + Expo (v55) — JavaScript (not TypeScript)
- **Navigation:** React Navigation (bottom tabs + native stack)
- **Backend:** Supabase (auth, PostgreSQL, storage)
- **AI:** Replicate API (`adirik/interior-design` model)
- **Payments:** Apple IAP only (StoreKit 2 via `expo-iap`) — subscriptions + consumable wishes. No Stripe, no other processors.
- **Affiliates:** Amazon Associates only (tag: `snapspacemkt-20`). Wayfair (CJ) and Houzz (ShareASale) integrations removed in Build 107 — catalog is Amazon-only.

---

## App Config (`app.json`)

```json
{
  "name": "SnapSpace",
  "slug": "SnapSpace",
  "version": "1.0.0",
  "orientation": "portrait",
  "userInterfaceStyle": "light",
  "ios": {
    "bundleIdentifier": "com.anthonyrivera.snapspace",
    "entitlements": { "aps-environment": "development" }
  },
  "android": {
    "adaptiveIcon": { "backgroundColor": "#E6F4FE" }
  }
}
```

**Expo plugins:** `expo-font`, `expo-camera` (no mic), `expo-image-picker`, `expo-secure-store`,
`expo-apple-authentication`, `expo-notifications` (icon: `#0B6DC3`), `expo-iap`

---

## Environment Variables

Stored in `.env` (never commit):

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_REPLICATE_API_TOKEN=

# Amazon Associates (PA-API — LOCKED until 10 qualifying sales)
EXPO_PUBLIC_AMAZON_PARTNER_TAG=snapspacemkt-20
EXPO_PUBLIC_AMAZON_ACCESS_KEY=          # Available after 10 sales
EXPO_PUBLIC_AMAZON_SECRET_KEY=          # Available after 10 sales

# Wayfair (CJ) and Houzz (ShareASale) integrations were removed in
# Build 107. Catalog is Amazon-only. No CJ_PUBLISHER_ID or
# SHAREASALE_AFFILIATE_ID variables are read by the app anymore.
```

---

## Dependencies (`package.json`)

```json
"dependencies": {
  "@react-native-async-storage/async-storage": "2.2.0",
  "@react-navigation/bottom-tabs": "^7.15.5",
  "@react-navigation/native": "^7.1.33",
  "@react-navigation/native-stack": "^7.14.4",
  "@supabase/supabase-js": "^2.98.0",
  "expo": "~55.0.4",
  "expo-apple-authentication": "~55.0.8",
  "expo-blur": "~55.0.9",
  "expo-camera": "~55.0.9",
  "expo-device": "~55.0.9",
  "expo-file-system": "~55.0.10",
  "expo-font": "~55.0.4",
  "expo-image-picker": "^55.0.11",
  "expo-linear-gradient": "~55.0.8",
  "expo-notifications": "^55.0.11",
  "expo-secure-store": "~55.0.8",
  "expo-status-bar": "~55.0.4",
  "react": "19.2.0",
  "react-native": "0.83.2",
  "react-native-safe-area-context": "^5.7.0",
  "react-native-screens": "^4.24.0",
  "react-native-svg": "15.15.3"
}
```

---

## Project Structure

```
App.js                    # Root: providers + tab/stack navigation
src/
  screens/                # 28 screen components (one per route)
  components/             # Reusable UI
    ds/                   # Design System primitives
      Button.js           # Primary, Secondary, Ghost, Destructive, Icon variants
      Badge.js            # style, status, source, outline variants + HeartCountPill
      SectionHeader.js    # Every section header across all screens
      index.js            # Barrel: import { Button, Badge, SectionHeader } from '../components/ds'
    GlassCard.js
    PressableCard.js
    Skeleton.js
  constants/
    colors.js             # Brand color palette (bluePrimary, blueDeep, blueLight, etc.)
    tokens.js             # SINGLE SOURCE OF TRUTH for all visual values
    theme.js              # Thin re-export shim → maps to tokens.js
  context/
    AuthContext.js        # useAuth() → { user, loading, signUp, signIn, signOut, signInWithApple, resetPassword, resendVerificationEmail, refreshUser }
    CartContext.js        # useCart() → { items, addToCart, removeFromCart, updateQuantity, clearCart, cartCount, subtotal }
    LikedContext.js       # useLiked() → { liked, toggleLiked }
    SharedContext.js      # useShared() → { shared, addShared }
    OrderHistoryContext.js # useOrderHistory() → { orders, addOrder }
  data/
    designs.js            # 42 seed designs with real Unsplash images + roomType/styles/productIds
    productCatalog.js     # 160+ Amazon affiliate products (snapspacemkt-20 tag)
    sellers.js            # 10 seller profiles
    styleMap.js           # Style taxonomy: ROOM_KEYWORDS, STYLE_KEYWORDS, MATERIAL_KEYWORDS, MOOD_KEYWORDS, ROOM_FURNITURE
  services/
    api.js                # Unified API layer: Auth, Email, Supplier, Admin — with guards
    supabase.js           # Supabase client + all DB helpers
    affiliateProducts.js  # searchProducts(), getProductsByDesign(), getProductsForPrompt(), getAffiliateUrl()
    productMatcher.js     # matchProducts(parsedPrompt, catalog, limit=6) — scoring algorithm
    replicate.js          # Replicate AI image generation
    notifications.js      # Push notifications
  utils/
    promptParser.js       # parseDesignPrompt(text) → { roomType, styles, materials, moods, furnitureCategories }
supabase/
  migrations/             # Database migrations
  functions/              # Edge functions
```

---

## Navigation (`App.js`)

### Provider Tree (outermost first)
```
SafeAreaProvider
  AuthProvider
    SubscriptionProvider
      CartProvider
        OrderHistoryProvider
          LikedProvider
            SharedProvider
              OnboardingProvider
                NavigationContainer
                  RootNavigator
```

### Tab Navigator (bottom tabs)
| Tab | Screen | Icon |
|-----|--------|------|
| Home | `HomeScreen` | House SVG |
| Explore | `ExploreScreen` | Search/Circle SVG |
| Snap | `SnapScreen` | Custom Frame3 SVG button (ears: #035DA8 + #67ACE9, body: black) |
| Cart | `CartScreen` | Shopping cart SVG + `CartBadge` |
| Profile | `ProfileScreen` | User SVG |

**Tab bar styles:** `backgroundColor: 'rgba(255,255,255,0.96)'`, height: 88, paddingTop: 6, borderTopColor: `rgba(0,0,0,0.06)`

### Stack Navigator (all screens)
`Main` → `Auth` → `VerifyEmailSent` → `RoomResult` → `ProductDetail` → `ShopTheLook` → `UserProfile` → `Liked` → `Shared` → `OrderHistory` → `PaymentMethods` → `Help` → `RestorePurchase` → `RequestFeature` → `Notifications` → `Language` → `TermsOfUse` → `PrivacyPolicy` → `SupplierApplication` → `SupplierApplicationStatus` → `AdminApplications` → `AdminApplicationDetail` → `SupplierOnboarding` → `SupplierDashboard`

All stack screens: `headerShown: false`

---

## Design Tokens — `src/constants/tokens.js`

**Single source of truth. Never hardcode values. Always import from tokens.**

### Import patterns
```js
// Named exports:
import { palette, uiColors, fontSize, typography, typeScale, fontWeight,
         letterSpacing, space, radius, shadow, elevation, border, opacity,
         touchTargets, textStyles, homeTypography, backgrounds, animation,
         motion, layout, colors } from '../constants/tokens';
// Default export (everything):
import tokens from '../constants/tokens';
// Theme shim (legacy screens):
import { colors as C } from '../constants/theme';   // → uiColors
import theme from '../constants/theme';              // → { colors: uiColors, typography, fontWeight, space, radius, shadow }
```

### `colors` (from `colors.js`, re-exported by tokens)
```js
bluePrimary: '#0B6DC3'
blueDeep:    '#035DA8'
blueLight:   '#67ACE9'
heroStart:   '#0D1E35'
heroEnd:     '#1E5AB0'
background:  '#F8FAFF'
black:       '#000000'
white:       '#FFFFFF'
gray:        '#D7D7D7'
cardBg:      'rgba(255,255,255,0.1)'
glassBorder: 'rgba(255,255,255,0.18)'
```

### `palette`
```js
primaryBlue:   '#0B6DC3'   // colors.bluePrimary
deepBlue:      '#035DA8'   // colors.blueDeep
lightBlue:     '#67ACE9'   // colors.blueLight
background:    '#F8FAFF'
surfaceWhite:  '#FFFFFF'
surfaceSubtle: '#F8FAFC'
surfaceMuted:  '#F1F5F9'
heroStart:     '#0D1E35'
heroEnd:       '#1E5AB0'
success:       '#16A34A'
successLight:  '#F0FDF4'
error:         '#EF4444'
textPrimary:   '#0F172A'
textSecondary: 'rgba(15,23,42,0.72)'
textTertiary:  'rgba(15,23,42,0.44)'
textDisabled:  'rgba(15,23,42,0.28)'
textWhite:     '#FFFFFF'
borderSubtle:  'rgba(0,0,0,0.04)'
borderLight:   'rgba(0,0,0,0.08)'
separator:     'rgba(0,0,0,0.06)'
```

### `uiColors` (also exported as `colors` from `theme.js`)
```js
primary:       '#1D4ED8'   // Buttons, links, active states
primaryLight:  '#DBEAFE'   // Hover states, tag backgrounds
bg:            '#FFFFFF'   // All screen backgrounds
surface:       '#F9FAFB'   // Cards, drawers, input backgrounds
surface2:      '#F3F4F6'   // Secondary cards, dividers
textPrimary:   '#111827'   // All primary text, titles, prices
textSecondary: '#6B7280'   // Labels, subtitles, metadata
textTertiary:  '#9CA3AF'   // Placeholder text, disabled states
border:        '#E5E7EB'   // All borders, dividers, separators
success:       '#16A34A'   // In Stock badge, trust signals
successBg:     '#DCFCE7'   // In Stock badge background
amazon:        '#FF9900'   // Amazon button bg ONLY
amazonText:    '#111827'   // Amazon button text (dark on orange)
destructive:   '#EF4444'   // Delete / remove actions
white:         '#FFFFFF'
```

### `fontSize`
```js
xs: 11,  sm: 13,  base: 15,  md: 17,  lg: 21,  xl: 26,  '2xl': 33,  '3xl': 40
```

### `typography` (used by Cart, PDP, Explore — `TY.xs.fontSize` style)
```js
xs:   { fontSize: 11, fontWeight: '400' }
sm:   { fontSize: 13, fontWeight: '400' }
base: { fontSize: 15, fontWeight: '400' }
md:   { fontSize: 17, fontWeight: '500' }
lg:   { fontSize: 20, fontWeight: '600' }
xl:   { fontSize: 24, fontWeight: '700' }
'2xl':{ fontSize: 28, fontWeight: '700' }
'3xl':{ fontSize: 34, fontWeight: '800' }
```

### `typeScale` (design system spec — 10 named styles, only these allowed)
```js
display:     { fontSize: 24, fontWeight: '700', lineHeight: 30 }
title:       { fontSize: 18, fontWeight: '700', lineHeight: 24 }
headline:    { fontSize: 15, fontWeight: '600', lineHeight: 20 }
subheadline: { fontSize: 13, fontWeight: '600', lineHeight: 18, letterSpacing: 1.2, textTransform: 'uppercase' }
body:        { fontSize: 14, fontWeight: '400', lineHeight: 20 }
caption:     { fontSize: 12, fontWeight: '400', lineHeight: 16 }
micro:       { fontSize: 11, fontWeight: '600', lineHeight: 14, letterSpacing: 0.5, textTransform: 'uppercase' }
price:       { fontSize: 16, fontWeight: '700', lineHeight: 20 }
priceSmall:  { fontSize: 14, fontWeight: '600', lineHeight: 18 }
button:      { fontSize: 14, fontWeight: '600', lineHeight: 18 }
```

### `fontWeight`
```js
regular:   '400'
medium:    '500'
semibold:  '600'
bold:      '700'
xbold:     '800'
extrabold: '800'  // alias for xbold
```

### `letterSpacing`
```js
tight:   -0.5   // large headings, prices
normal:  0      // body text
wide:    0.5    // uppercase labels, badges
wider:   1.2    // tiny caps, section headers
widest:  1.5    // section headers — homepage standard
```

### `space` (8px grid — named + numeric aliases, same values)
```js
// Named
xs: 4,  sm: 8,  md: 12,  base: 16,  lg: 20,  xl: 24,  '2xl': 32,  '3xl': 40,  '4xl': 48,  '5xl': 56,  '6xl': 64
// Numeric aliases
1: 4,  2: 8,  3: 12,  4: 16,  5: 20,  6: 24,  8: 32
// Hairline
hairline: 2
```

### `radius`
```js
badge:  6     // all badges — consistent
sm:     8     // chips, small interactive elements
md:     12    // ALL cards, buttons, inputs
lg:     16    // images inside cards
xl:     20    // outer cards, main containers, bottom sheets
button: 24    // all pill-shaped buttons
full:   9999  // avatars, circular FABs only
```

### `shadow`
```js
// Standard (tokens.js consumers)
low:    { shadowColor: '#000', shadowOffset: { width: 0, height: 1 },  shadowOpacity: 0.04, shadowRadius: 3,  elevation: 1 }
medium: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 },  shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }
high:   { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.12, shadowRadius: 40, elevation: 8 }
// Theme.js aliases (sm/md/lg)
sm:     { shadowColor: '#000', shadowOffset: { width: 0, height: 1 },  shadowOpacity: 0.08, shadowRadius: 3,  elevation: 2 }
md:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 },  shadowOpacity: 0.10, shadowRadius: 16, elevation: 5 }
lg:     { shadowColor: '#000', shadowOffset: { width: 0, height: 8 },  shadowOpacity: 0.14, shadowRadius: 32, elevation: 10 }
```

### `elevation` (design system — 4 levels)
```js
0: { shadowColor: 'transparent', ...zero values, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }  // flat + border
1: { shadowColor: '#000', height: 1, opacity: 0.08, radius: 3,  elevation: 2  }  // sticky headers
2: { shadowColor: '#000', height: 4, opacity: 0.12, radius: 12, elevation: 5  }  // modals, sheets, FAB
3: { shadowColor: '#000', height: 8, opacity: 0.16, radius: 24, elevation: 10 }  // overlays, toasts
```

### `border`
```js
subtle: { borderWidth: 1,   borderColor: 'rgba(0,0,0,0.04)' }
light:  { borderWidth: 1,   borderColor: 'rgba(0,0,0,0.08)' }
focus:  { borderWidth: 1.5, borderColor: colors.bluePrimary }
```

### `opacity`
```js
primary:   1.0   // headings, prices, product names
secondary: 0.72  // brand names, descriptions
tertiary:  0.44  // metadata, timestamps, captions
disabled:  0.28  // disabled states
```

### `layout`
```js
screenPaddingH:        20   // consistent on every screen
screenPaddingTop:      24   // below status bar
screenPaddingBottom:   32   // above tab bar
sectionGap:            32   // between unrelated sections
sectionHeaderToContent:16   // header to first card below
cardInnerPadding:      12   // card internal padding
cardGap:               12   // horizontal gap between cards
relatedGap:            12   // between related list items
buttonHeight:          56   // sticky bottom buttons
buttonHeightMd:        52
buttonHeightSm:        36
tabBarHeight:          88   // total including safe area
tabBarBaseHeight:      56
fabSize:               56
fabIconSize:           26
avatarSizeLg:          88
avatarSizeMd:          40
avatarSizeSm:          36
```

### `touchTargets`
```js
min:         44   // Apple HIG minimum
compact:     36   // Dense list items
iconTapArea: 44   // Icon tap target (visual may be smaller)
```

### `animation` (legacy)
```js
fast: 100,  normal: 150,  slow: 200,  verySlow: 250
spring:      { damping: 0.85, stiffness: 300 }
springBounce:{ tension: 300, friction: 10,  useNativeDriver: true }
springSnap:  { tension: 200, friction: 20,  useNativeDriver: true }
```

### `motion` (design system spec — use for new/updated components)
```js
durationFast:   150    // button press, toggle
durationNormal: 250    // page transitions, card expansions
durationSlow:   400    // modal/sheet slides
easingDefault:  [0.25, 0.1, 0.25, 1.0]   // smooth
easingSpring:   [0.34, 1.56, 0.64, 1.0]  // slight overshoot
cardPressScale: 0.98
iconPressOpacity: 0.6
listRowPressBackground: 'rgba(0,0,0,0.04)'
```

### `homeTypography`
```js
sectionHeader: { fontSize: 13, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }
seeAllLink:    { fontSize: 14, fontWeight: '600' }
cardTitle:     { fontSize: 15, fontWeight: '600' }
cardSubtitle:  { fontSize: 12, fontWeight: '400' }
cardBadge:     { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }
price:         { fontSize: 16, fontWeight: '700' }
body:          { fontSize: 14, fontWeight: '400' }
```

### `backgrounds`
```js
primary:   '#FFFFFF'   // default section background
secondary: '#F8F9FA'   // alternating section background
```

---

## Design System Components (`src/components/ds/`)

### `Button`
**Variants:** `primary` | `secondary` | `ghost` | `destructive` | `icon`

```js
<Button variant="primary"     label="Shop Now"       onPress={fn} />
<Button variant="secondary"   label="Explore Looks"  onPress={fn} />
<Button variant="ghost"       label="See all"        onPress={fn} />
<Button variant="destructive" label="Remove"         onPress={fn} />
<Button variant="icon"        icon={<TrashIcon />}   onPress={fn} />
<Button variant="primary"     label="Add to Cart"    onPress={fn} fullWidth />
<Button variant="primary"     label="Loading..."     onPress={fn} loading />
<Button variant="primary"     label="Disabled"       onPress={fn} disabled />
<Button variant="primary"     label="Dark Card CTA"  onPress={fn} inverted />
```

Props: `variant`, `label`, `icon`, `onPress`, `fullWidth`, `disabled`, `loading`, `style`, `labelStyle`, `inverted`
Press state: animated opacity (icon: 0.6, others: 0.85) using `motion.durationFast`

### `Badge`
**Variants:** `style` | `status` | `source` | `outline`

```js
<Badge variant="style"  label="DARK LUXE" />
<Badge variant="status" label="NEW" />           // green
<Badge variant="status" label="SALE" />          // red
<Badge variant="status" label="LIMITED TIME" />  // green
<Badge variant="status" label="SOLD OUT" />      // gray
<Badge variant="source" label="Amazon" color="#FF9900" />
<Badge variant="outline" label="BOHO" />         // transparent + white border
```

All badges: `typeScale.micro`, `radius.badge` (6px), paddingV: 4, paddingH: 10 (8 for source)

```js
// Heart Count Pill (bottom-right overlay on image cards)
<HeartCountPill count={142} icon={<HeartIcon />} />
```

### `SectionHeader`
**Every section header on every screen uses this.**

```js
<SectionHeader title="TOP SPACES" />
<SectionHeader title="FEATURED PRODUCTS" actionLabel="Shop all" onAction={fn} />
<SectionHeader title="RECENTLY VIEWED"   actionLabel="Clear"    onAction={fn} />
<SectionHeader title="PICKED FOR YOU"    icon={<SparkleIcon />} actionLabel="See all" onAction={fn} />
<SectionHeader title="DETAILS" noTopMargin />
```

Spacing: `paddingHorizontal: space.lg (20)`, `marginBottom: space.base (16)`, `marginTop: space['2xl'] (32)`
Title style: `typeScale.subheadline`, color: `C.textTertiary`
Action style: `typeScale.button`, color: `C.primary`, `minHeight: 36` touch target

---

## Context APIs

### `AuthContext` — `useAuth()`
```js
user: {
  id: string,
  email: string,
  name: string,
  username: string | null,
  bio: string | null,
  avatarUrl: string | null,
  role: 'consumer' | 'supplier' | 'admin',
  is_verified_supplier: boolean,
  email_verified: boolean,
}
loading: boolean
signUp(fullName, email, password)         // → { needsEmailVerification: boolean }
signIn(email, password)                   // throws on error
signOut()
signInWithApple()
resetPassword(email)
resendVerificationEmail(email)
refreshUser()                             // re-fetches profile from DB
```

5-second safety timeout on bootstrap so app never hangs on loading screen.

### `CartContext` — `useCart()`
```js
items: [{ key, name, brand, price, priceDisplay, quantity }]
cartCount: number   // total quantity across all items
subtotal: number    // sum of price * quantity
addToCart(product)          // product needs: { name, brand, price }
removeFromCart(key)
updateQuantity(key, delta)  // Math.max(1, quantity + delta)
clearCart()
```

Cart item key: `"${product.name}__${product.brand}"`

### `LikedContext` — `useLiked()`
```js
liked: { [id]: boolean }
toggleLiked(id)
```

### `SharedContext` — `useShared()`
```js
shared: { [id]: boolean }
addShared(id)
```

### `OrderHistoryContext` — `useOrderHistory()`
```js
orders: [{ id, date, status, items, subtotal, shipping, total }]
addOrder({ items, subtotal, shipping, total })
// Seeded with 2 mock orders (ORD-847291, ORD-623047)
```

---

## Services

### `src/services/supabase.js`

```js
export const supabase  // createClient with AsyncStorage, persistSession, autoRefreshToken, detectSessionInUrl: false

// Profile
fetchProfile(userId)                      // → profiles row
updateProfile(userId, updates)            // → profiles row
uploadAvatar(userId, uri)                 // → public URL (bucket: 'avatars')
uploadRoomPhoto(userId, uri, base64?)     // → public URL (bucket: 'room-uploads')
savePushToken(userId, token)

// Supplier Applications
submitSupplierApplication(userId, payload)  // payload: { business_name, business_type, website_url, tax_id, description, product_categories, inventory_size }
getMyApplication(userId)

// Supplier Dashboard
getSupplierProfile(supplierId)
updateSupplierProfile(supplierId, updates)
getSupplierStats(supplierId)              // RPC: get_supplier_stats(p_supplier_id)
getSupplierProducts(supplierId)
createProduct(supplierId, payload)        // payload: { title, price, description?, category?, inventory? }
updateProduct(productId, supplierId, updates)
deleteProduct(productId, supplierId)      // soft-delete: is_active = false
getSupplierOrders(supplierId)
fulfillOrder(orderId, supplierId, trackingNumber?)
getSupplierAnalytics(supplierId, days=30) // RPC: get_supplier_analytics(p_supplier_id, p_days)
recordProductView(productId, supplierId, viewerId?) // RPC: record_product_view

// Admin
adminGetApplications(filters?)           // filters: { status?, businessType? } — joins profiles
adminGetApplication(applicationId)       // joins profiles
adminApproveApplication(applicationId, adminId) // RPC: approve_supplier_application
adminRejectApplication(applicationId, adminId, notes?)  // RPC: reject_supplier_application
adminSuspendSupplier(targetUserId, adminId, reason?)    // RPC: suspend_supplier
```

### `src/services/api.js` — Unified API Layer with Guards

```js
import { Auth, Email, Supplier, Admin, ApiError } from '../services/api';

// Auth
Auth.signUp(fullName, email, password)         // → { needsEmailVerification }
Auth.signIn(email, password)
Auth.signOut()
Auth.resendVerification(email)
Auth.refreshSession()                          // → session
Auth.resetPassword(email)

// Email (aliases to Auth)
Email.resendVerification(email)
Email.resetPassword(email)

// Supplier
Supplier.apply(user, payload)                  // guard: email verified + no dupe
Supplier.getApplicationStatus(user)
Supplier.getDashboard(user)                    // guard: verified supplier
Supplier.getAnalytics(user, days=30)
Supplier.getStorefront(user)
Supplier.updateStorefront(user, updates)
Supplier.getProducts(user)
Supplier.createProduct(user, payload)
Supplier.updateProduct(user, productId, updates)
Supplier.deleteProduct(user, productId)
Supplier.getOrders(user)
Supplier.fulfillOrder(user, orderId, trackingNumber?)

// Admin
Admin.getApplications(user, filters?)
Admin.getApplication(user, applicationId)
Admin.approveApplication(user, applicationId)
Admin.rejectApplication(user, applicationId, notes?)
Admin.suspendSupplier(user, targetUserId, reason?)

// Error handling
try { ... } catch(e) {
  if (e instanceof ApiError) { e.code; e.message; }
}
// Error codes: AUTH_REQUIRED, EMAIL_NOT_VERIFIED, SUPPLIER_REQUIRED,
//              ADMIN_REQUIRED, VALIDATION, SIGNUP_FAILED, LOGIN_FAILED,
//              INVALID_CREDENTIALS, LOGOUT_FAILED, RESEND_FAILED,
//              REFRESH_FAILED, RESET_FAILED, APPLICATION_PENDING, ALREADY_SUPPLIER
```

### `src/services/affiliateProducts.js`

```js
searchProducts(keywords, roomType, style, limit)    // general product search
getProductsByDesign(designId)                        // products for a seed design
getProductsForPrompt(promptText)                     // AI prompt → products (THE KEY FUNCTION)
getAffiliateUrl(product)                             // correct affiliate URL
// Fallback chain: Amazon PA-API → local catalog → generic fallback
```

### `src/services/productMatcher.js`

```js
matchProducts(parsedPrompt, catalog, limit = 6)
// Scoring: style match 40%, room type 30%, material match 20%, category diversity 10%
// Diversity rule: max 2/category, min 4 categories in a set of 6
// Priority: seating → tables → lighting → textiles → decor → storage
```

### `src/utils/promptParser.js`

```js
parseDesignPrompt(promptText)
// → { roomType, styles[], materials[], moods[], furnitureCategories[] }
// Default: { roomType: 'living-room', styles: ['contemporary'], materials: [], moods: [], furnitureCategories: [...] }

summarizeParsed(parsed)
// → "living-room · minimalist, scandi · wood, marble"
```

---

## Data Schemas

### Product (`productCatalog.js`)

```js
{
  id: 'amz-001',
  name: 'Rivet Revolve Modern Sofa',
  brand: 'Rivet',
  price: 1149,                            // number, USD
  imageUrl: 'https://...',
  category: 'sofa',
  roomType: 'living-room',
  styles: ['modern', 'minimalist'],
  materials: ['linen', 'wood'],
  source: 'amazon',                       // Amazon-only as of Build 107
  affiliateUrl: 'https://amzn.to/...',
  asin: 'B075X1KPLZ',
  description: '...',
  rating: 4.2,
  reviewCount: 1847,
}
```

### Seller (`sellers.js`)

```js
{
  handle: 'alex.designs',
  displayName: 'Alex Chen',
  initial: 'A',
  bio: 'Minimalist spaces with maximum impact',
  verified: true,
  specialty: ['minimalist', 'modern', 'scandi'],
  followerCount: 12400,
  designCount: 8,
}
```

**All 10 sellers:** `alex.designs` (Minimalist/Modern), `home.by.mia` (Luxury/Glam), `spacesby.jo` (Rustic/Farmhouse), `green.interiors` (Biophilic), `nordic.spaces` (Scandi), `darkmode.design` (Dark Luxe), `wabi.studio` (Japandi), `retro.rooms` (Mid-Century), `earthy.abode` (Bohemian), `shore.living` (Coastal)

### Design (`designs.js`)

```js
{
  id: 1,
  title: 'Modern Minimalist Living...',
  user: 'alex.designs',              // references sellers.js handle
  initial: 'A',
  verified: true,
  imageUrl: 'https://images.unsplash.com/...',
  description: '...',
  prompt: 'Minimalist Scandi living room...',
  roomType: 'living-room',
  styles: ['minimalist', 'scandi'],
  products: ['amz-001', 'wf-012'],   // references productCatalog.js IDs
  tags: ['#Minimalist', '#LivingRoom'],
  likes: 142,
  shares: 38,
}
```

42 designs total. Room distribution: Living Room (10), Bedroom (8), Kitchen (6), Dining Room (5), Office (5), Bathroom (3), Outdoor (2), Nursery (1).

### Style Taxonomy (`styleMap.js`)

**Room types:** `living-room`, `bedroom`, `kitchen`, `dining-room`, `office`, `bathroom`, `outdoor`, `nursery`, `entryway`

**Design styles:** `minimalist`, `japandi`, `rustic`, `industrial`, `coastal`, `art-deco`, `mid-century`, `bohemian`, `scandinavian`, `dark-luxe`, `biophilic`, `transitional`, `contemporary`, `farmhouse`, `mediterranean`, `wabi-sabi`, `maximalist`, `french-country`, `glam`

**Product categories:** `sofa`, `accent-chair`, `coffee-table`, `dining-table`, `dining-chair`, `bed`, `dresser`, `nightstand`, `desk`, `desk-chair`, `bookshelf`, `rug`, `lamp`, `pendant-light`, `chandelier`, `mirror`, `throw-pillow`, `throw-blanket`, `vase`, `planter`, `wall-art`, `curtains`, `shelving`

**Materials:** `wood`, `marble`, `velvet`, `linen`, `leather`, `rattan`, `concrete`, `brass`, `copper`, `ceramic`, `glass`, `wicker`

**Exports:** `ROOM_KEYWORDS`, `STYLE_KEYWORDS`, `MATERIAL_KEYWORDS`, `MOOD_KEYWORDS`, `ROOM_FURNITURE`

---

## Database Tables

| Table | Key Columns |
|-------|-------------|
| `profiles` | `id`, `email`, `full_name`, `username`, `bio`, `avatar_url`, `role` (consumer/supplier/admin), `is_verified_supplier`, `email_verified`, `push_token`, `created_at`, `updated_at` |
| `supplier_applications` | `id`, `user_id`, `business_name`, `business_type`, `website_url`, `tax_id`, `description`, `product_categories`, `inventory_size`, `status` (pending/approved/rejected/suspended), `submitted_at` |
| `supplier_profiles` | `id` (= user_id), storefront slug, tagline, banner, policies, payout config |
| `products` | `id`, `supplier_id`, `title`, `price`, `description`, `category`, `inventory`, `is_active`, `created_at`, `updated_at` |
| `supplier_orders` | `id`, `supplier_id`, `status`, `ordered_at`, `fulfilled_at`, `tracking_number`, `updated_at` |
| `audit_log` | admin action log |

### Supabase RPCs
- `get_supplier_stats(p_supplier_id)` — overview stats
- `get_supplier_analytics(p_supplier_id, p_days)` — daily revenue, top products
- `record_product_view(p_product_id, p_supplier_id, p_viewer_id)` — analytics
- `approve_supplier_application(application_id, admin_id)` — atomic: approve + promote role + create supplier_profiles
- `reject_supplier_application(application_id, admin_id, rejection_notes)` — atomic
- `suspend_supplier(target_user_id, admin_id, suspend_reason)` — atomic: revoke badge + role

### Storage Buckets
- `avatars` — user profile photos (`{userId}/avatar.jpeg`)
- `room-uploads` — AI room scan photos (`{userId}/{timestamp}.jpeg`)

---

## AI Data Flow

```
User prompt/photo
  → Replicate AI (adirik/interior-design model) → room image
  → promptParser.js → { roomType, styles[], materials[], moods[], furnitureCategories[] }
  → productMatcher.js → scores catalog (40% style, 30% room, 20% material, 10% diversity)
  → affiliateProducts.js → top 6 products
  → RoomResultScreen / ShopTheLookScreen
```

---

## Affiliate Pipeline Status

| Platform | Status | Tag/ID |
|----------|--------|--------|
| Amazon Associates | Active — tag: `snapspacemkt-20` | PA-API locked (needs 10 sales) |

Wayfair (CJ Affiliate) and Houzz (ShareASale) integrations were removed
in Build 107. Catalog is Amazon-only. If multi-vendor is reintroduced
later, restore the source-specific URL builders in
`src/services/affiliateProducts.js` and the source filter in
`src/screens/CartScreen.js`.

**Amazon PA-API deprecation:** April 30, 2026 → migrating to Creators API (OAuth 2.0)

---

## Key Conventions

### Design Tokens
All visual values from `src/constants/tokens.js` and `src/constants/colors.js`. Never hardcode colors, spacing, font sizes, or radii.

### Component Patterns
- Screens in `src/screens/`, one file per screen
- Reusable components in `src/components/`
- DS primitives in `src/components/ds/` — import via barrel: `import { Button, Badge, SectionHeader } from '../components/ds'`
- State management via React Context (`src/context/`)
- SVG icons are inline using `react-native-svg` (no icon library)

### Styling
- `StyleSheet.create()` at bottom of each file
- 8px spacing grid (`space` tokens)
- 4-tier radius: badge(6), sm(8), md(12), lg(16), xl(20), button(24), full(9999)
- 3-tier shadow: low/medium/high (+ sm/md/lg aliases)
- Light mode only
- 10 locked `typeScale` styles — only these for text

### Import Shortcuts
```js
// Colors for screens using theme shim pattern (CartScreen, ExploreScreen, PDP, etc.)
import { colors as C } from '../constants/theme';
// C.primary, C.bg, C.surface, C.textPrimary, C.textSecondary, C.border, C.success, C.destructive, C.amazon, etc.

// All tokens in one import
import { space, radius, shadow, fontSize, fontWeight, typography, typeScale, uiColors, layout, motion } from '../constants/tokens';

// Design system components
import { Button, Badge, SectionHeader } from '../components/ds';
```

### CardImage Component
Drop-in `<Image>` replacement with graceful fallback for broken/missing URLs.

```js
import CardImage from '../components/CardImage';

// Usage — replace any <Image source={{ uri }} ... /> with:
<CardImage
  uri={design.imageUrl}        // string | null — safe to pass undefined/null
  style={styles.cardImage}     // same style prop as Image
  placeholderColor="#D0D7E3"   // optional (default #D0D7E3)
  resizeMode="cover"           // optional (default 'cover')
/>
```

Use `CardImage` everywhere a URI image is rendered. Never use raw `<Image source={{ uri }}>` for user/design images.

### Image Pool (`src/data/imagePool.js`)
125 browser-verified Unsplash interior-only URLs grouped by room type. All confirmed HTTP 200 with no people, no exteriors, no food/clothing.

```js
import { IMAGE_POOL, getRandomImage, getImagesForRoom } from '../data/imagePool';

getRandomImage()                        // random across all rooms
getRandomImage('living-room')           // random for a specific room
getImagesForRoom('bedroom')             // full array for a room
// Room keys: 'living-room' | 'bedroom' | 'kitchen' | 'dining-room'
//            'office' | 'bathroom' | 'outdoor' | 'nursery'
```

### FTC Compliance
All screens showing affiliate products must display: *"We may earn a commission when you buy through links on this app."*

### Price Display
Amazon TOS: show current price, never cache Amazon prices > 1 hour. Static catalog prices should note "Price may vary."

### Navigation Patterns
```js
navigation.navigate('ProductDetail', { product })
navigation.navigate('ShopTheLook', { design })
navigation.navigate('UserProfile', { seller })
navigation.navigate('Auth')
navigation.navigate('SupplierApplication')
navigation.navigate('SupplierDashboard')
navigation.navigate('AdminApplications')
navigation.goBack()
```

---

## GitHub Remote

```
https://SnapSpaceMarketPlaceIOS@github.com/SnapSpaceMarketPlaceIOS/SnapSpace-Market-Place.git
```
