/**
 * SnapSpace Marketplace — Unified API Service Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * This file is the single source of truth for all data operations in the app.
 * Every function maps to a spec-defined API route and enforces its auth/role
 * requirement BEFORE hitting the database.
 *
 * Route mapping (spec § Step 6):
 *
 *  Auth Routes
 *  ──────────────────────────────────────────────────────────────────────────
 *  POST  /api/auth/signup             → Auth.signUp()
 *  POST  /api/auth/login              → Auth.signIn()
 *  POST  /api/auth/logout             → Auth.signOut()
 *  GET   /api/auth/verify-email       → Auth.resendVerification()
 *  POST  /api/auth/refresh            → Auth.refreshSession()
 *  POST  /api/auth/reset-password     → Auth.resetPassword()
 *
 *  Supplier Application Routes
 *  ──────────────────────────────────────────────────────────────────────────
 *  POST  /api/supplier/apply                   → Supplier.apply()
 *  GET   /api/supplier/application/status      → Supplier.getApplicationStatus()
 *
 *  Admin Routes  (role = 'admin' required)
 *  ──────────────────────────────────────────────────────────────────────────
 *  GET   /api/admin/applications               → Admin.getApplications()
 *  GET   /api/admin/applications/:id           → Admin.getApplication()
 *  POST  /api/admin/applications/:id/approve   → Admin.approveApplication()
 *  POST  /api/admin/applications/:id/reject    → Admin.rejectApplication()
 *  POST  /api/admin/suppliers/:id/suspend      → Admin.suspendSupplier()
 *
 *  Supplier Dashboard Routes  (role = 'supplier' + is_verified_supplier required)
 *  ──────────────────────────────────────────────────────────────────────────
 *  GET        /api/supplier/dashboard              → Supplier.getDashboard()
 *  GET        /api/supplier/analytics              → Supplier.getAnalytics()
 *  GET        /api/supplier/storefront             → Supplier.getStorefront()
 *  PUT        /api/supplier/storefront             → Supplier.updateStorefront()
 *  GET        /api/supplier/products               → Supplier.getProducts()
 *  POST       /api/supplier/products               → Supplier.createProduct()
 *  PUT        /api/supplier/products/:id           → Supplier.updateProduct()
 *  DELETE     /api/supplier/products/:id           → Supplier.deleteProduct()
 *  GET        /api/supplier/orders                 → Supplier.getOrders()
 *  PUT        /api/supplier/orders/:id/fulfill     → Supplier.fulfillOrder()
 *
 * Auth enforcement strategy:
 *  - Guards run before every DB call. If a guard throws, the DB is never hit.
 *  - Server-side enforcement: Supabase RLS + SECURITY DEFINER RPCs (migrations).
 *  - Client-side guards here are an extra safety layer + provide clearer errors.
 */

import { supabase } from './supabase';
import * as db from './supabase'; // all raw helpers

// ─── Guard helpers ────────────────────────────────────────────────────────────

/**
 * Throws if user is not authenticated.
 * @param {object|null} user - The user object from AuthContext.
 */
function requireAuth(user) {
  if (!user) {
    throw new ApiError('AUTH_REQUIRED', 'You must be signed in to do that.');
  }
}

/**
 * Throws if user's email is not verified.
 * Required before submitting a supplier application.
 */
function requireEmailVerified(user) {
  requireAuth(user);
  if (!user.email_verified) {
    throw new ApiError(
      'EMAIL_NOT_VERIFIED',
      'Please verify your email address before continuing.',
    );
  }
}

/**
 * Throws if user is not a verified supplier.
 * Required for all supplier dashboard routes.
 */
function requireSupplier(user) {
  requireAuth(user);
  if (!user.is_verified_supplier || user.role !== 'supplier') {
    throw new ApiError(
      'SUPPLIER_REQUIRED',
      'This action requires a verified supplier account.',
    );
  }
}

/**
 * Throws if user is not an admin.
 * Required for all admin panel routes.
 */
function requireAdmin(user) {
  requireAuth(user);
  if (user.role !== 'admin') {
    throw new ApiError('ADMIN_REQUIRED', 'This action requires admin privileges.');
  }
}

// ─── ApiError class ───────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'ApiError';
  }
}

// =============================================================================
// AUTH API
// Maps to: POST /api/auth/*, GET /api/auth/*
// All auth routes are public (no guard needed — user not yet signed in).
// =============================================================================

export const Auth = {
  /**
   * POST /api/auth/signup
   * Creates a consumer account. role = 'consumer', is_verified_supplier = false.
   * Triggers Supabase to send an email verification link.
   *
   * @param {string} fullName
   * @param {string} email
   * @param {string} password  (min 6 chars)
   * @returns {{ needsEmailVerification: boolean }}
   */
  async signUp(fullName, email, password) {
    if (!fullName?.trim()) throw new ApiError('VALIDATION', 'Full name is required.');
    if (!email?.trim() || !/\S+@\S+\.\S+/.test(email)) {
      throw new ApiError('VALIDATION', 'A valid email address is required.');
    }
    if (!password || password.length < 6) {
      throw new ApiError('VALIDATION', 'Password must be at least 6 characters.');
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    if (error) throw new ApiError('SIGNUP_FAILED', error.message);
    return { needsEmailVerification: !data.session };
  },

  /**
   * POST /api/auth/login
   * Authenticates with email + password. Returns JWT stored in the Supabase
   * client's AsyncStorage session (equivalent to an httpOnly cookie on web).
   * JWT payload includes: userId, email, role, is_verified_supplier.
   *
   * @param {string} email
   * @param {string} password
   */
  async signIn(email, password) {
    if (!email?.trim()) throw new ApiError('VALIDATION', 'Email is required.');
    if (!password)       throw new ApiError('VALIDATION', 'Password is required.');

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      if (error.message.includes('Email not confirmed')) {
        throw new ApiError(
          'EMAIL_NOT_VERIFIED',
          'Please verify your email before signing in. Check your inbox.',
        );
      }
      if (error.message.includes('Invalid login credentials')) {
        throw new ApiError('INVALID_CREDENTIALS', 'Incorrect email or password.');
      }
      throw new ApiError('LOGIN_FAILED', error.message);
    }
  },

  /**
   * POST /api/auth/logout
   * Clears the session from AsyncStorage and signs the user out.
   */
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new ApiError('LOGOUT_FAILED', error.message);
  },

  /**
   * GET /api/auth/verify-email
   * Resends the email verification link to the given address.
   *
   * @param {string} email
   */
  async resendVerification(email) {
    if (!email?.trim()) throw new ApiError('VALIDATION', 'Email is required.');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
    });
    if (error) throw new ApiError('RESEND_FAILED', error.message);
  },

  /**
   * POST /api/auth/refresh
   * Refreshes the JWT access token using the stored refresh token.
   * Supabase does this automatically via autoRefreshToken: true, but
   * call this manually if you need a fresh token immediately.
   */
  async refreshSession() {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw new ApiError('REFRESH_FAILED', error.message);
    return data.session;
  },

  /**
   * POST /api/auth/reset-password
   * Sends a password reset email.
   *
   * @param {string} email
   */
  async resetPassword(email) {
    if (!email?.trim()) throw new ApiError('VALIDATION', 'Email is required.');
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
    );
    if (error) throw new ApiError('RESET_FAILED', error.message);
  },
};

// =============================================================================
// EMAIL API
// Transactional emails are sent server-side via the send-email Edge Function,
// triggered automatically by database events (005_email_notifications.sql).
//
// This section covers the two email actions the CLIENT can trigger directly:
//   1. Resend email verification  (before sign-in)
//   2. Resend password reset link (from sign-in screen)
//
// All other emails (welcome, application updates, orders) fire automatically
// from database triggers without any client involvement.
// =============================================================================

export const Email = {
  /**
   * Resend the email verification link to the given address.
   * Maps to: GET /api/auth/verify-email
   * Called from: VerifyEmailSentScreen "Resend" button.
   *
   * @param {string} email
   */
  resendVerification: Auth.resendVerification,

  /**
   * Send a password reset link.
   * Maps to: POST /api/auth/reset-password
   * Called from: AuthScreen "Forgot Password" flow.
   *
   * @param {string} email
   */
  resetPassword: Auth.resetPassword,
};

// =============================================================================
// SUPPLIER API
// Maps to: /api/supplier/*
// Application routes: require auth + email_verified.
// Dashboard routes: require is_verified_supplier = true.
// =============================================================================

export const Supplier = {
  /**
   * POST /api/supplier/apply
   * Guard: logged in + email verified + no existing pending/approved application.
   *
   * @param {object} user    - From AuthContext
   * @param {object} payload - { business_name, business_type, website_url, tax_id,
   *                            description, product_categories, inventory_size }
   */
  async apply(user, payload) {
    requireEmailVerified(user);

    // Block duplicate applications
    const existing = await db.getMyApplication(user.id);
    if (existing?.status === 'pending') {
      throw new ApiError(
        'APPLICATION_PENDING',
        'You already have a supplier application under review.',
      );
    }
    if (existing?.status === 'approved') {
      throw new ApiError(
        'ALREADY_SUPPLIER',
        'Your supplier application has already been approved.',
      );
    }

    return db.submitSupplierApplication(user.id, payload);
  },

  /**
   * GET /api/supplier/application/status
   * Returns the current application record for the logged-in user.
   * Guard: logged in.
   *
   * @param {object} user
   */
  async getApplicationStatus(user) {
    requireAuth(user);
    return db.getMyApplication(user.id);
  },

  // ── Dashboard routes (require verified supplier) ──────────────────────────

  /**
   * GET /api/supplier/dashboard
   * Returns overview stats: revenue today/week/month, active listings,
   * pending orders.
   * Guard: verified supplier.
   *
   * @param {object} user
   */
  async getDashboard(user) {
    requireSupplier(user);
    return db.getSupplierStats(user.id);
  },

  /**
   * GET /api/supplier/analytics?days=30
   * Returns daily revenue chart, top products, views, conversion rate.
   * Guard: verified supplier.
   *
   * @param {object} user
   * @param {number} days - Look-back window (default 30)
   */
  async getAnalytics(user, days = 30) {
    requireSupplier(user);
    return db.getSupplierAnalytics(user.id, days);
  },

  /**
   * GET /api/supplier/storefront
   * Returns the supplier's public storefront profile.
   * Guard: verified supplier.
   *
   * @param {object} user
   */
  async getStorefront(user) {
    requireSupplier(user);
    return db.getSupplierProfile(user.id);
  },

  /**
   * PUT /api/supplier/storefront
   * Updates storefront slug, tagline, banner, policies, payout config.
   * Guard: verified supplier.
   *
   * @param {object} user
   * @param {object} updates - Fields to update on supplier_profiles row
   */
  async updateStorefront(user, updates) {
    requireSupplier(user);
    return db.updateSupplierProfile(user.id, updates);
  },

  /**
   * GET /api/supplier/products
   * Lists all of the supplier's active product listings.
   * Guard: verified supplier.
   *
   * @param {object} user
   */
  async getProducts(user) {
    requireSupplier(user);
    return db.getSupplierProducts(user.id);
  },

  /**
   * POST /api/supplier/products
   * Creates a new product listing owned by this supplier.
   * Guard: verified supplier. Ownership (supplier_id) is set server-side via RLS.
   *
   * @param {object} user
   * @param {object} payload - { title, price, description?, category?, inventory? }
   */
  async createProduct(user, payload) {
    requireSupplier(user);
    if (!payload.title?.trim()) {
      throw new ApiError('VALIDATION', 'Product title is required.');
    }
    if (payload.price == null || isNaN(parseFloat(payload.price))) {
      throw new ApiError('VALIDATION', 'A valid price is required.');
    }
    return db.createProduct(user.id, payload);
  },

  /**
   * PUT /api/supplier/products/:id
   * Updates a product listing. Ownership verified server-side via RLS
   * (supplier_id column check) and in the query itself.
   * Guard: verified supplier.
   *
   * @param {object} user
   * @param {string} productId
   * @param {object} updates
   */
  async updateProduct(user, productId, updates) {
    requireSupplier(user);
    if (!productId) throw new ApiError('VALIDATION', 'Product ID is required.');
    return db.updateProduct(productId, user.id, updates);
  },

  /**
   * DELETE /api/supplier/products/:id
   * Soft-deletes a product (sets is_active = false).
   * Ownership verified server-side. Guard: verified supplier.
   *
   * @param {object} user
   * @param {string} productId
   */
  async deleteProduct(user, productId) {
    requireSupplier(user);
    if (!productId) throw new ApiError('VALIDATION', 'Product ID is required.');
    return db.deleteProduct(productId, user.id);
  },

  /**
   * GET /api/supplier/orders
   * Lists all incoming orders for this supplier's products.
   * Guard: verified supplier.
   *
   * @param {object} user
   */
  async getOrders(user) {
    requireSupplier(user);
    return db.getSupplierOrders(user.id);
  },

  /**
   * PUT /api/supplier/orders/:id/fulfill
   * Marks an order as fulfilled and optionally records a tracking number.
   * Ownership verified server-side. Guard: verified supplier.
   *
   * @param {object} user
   * @param {string} orderId
   * @param {string|null} trackingNumber
   */
  async fulfillOrder(user, orderId, trackingNumber = null) {
    requireSupplier(user);
    if (!orderId) throw new ApiError('VALIDATION', 'Order ID is required.');
    return db.fulfillOrder(orderId, user.id, trackingNumber);
  },
};

// =============================================================================
// ADMIN API
// Maps to: /api/admin/*
// All routes require role = 'admin'.
// ⚠️  The database additionally enforces this via SECURITY DEFINER RPCs and
//     admin-only RLS policies — never trust client-side role claims alone.
// =============================================================================

export const Admin = {
  /**
   * GET /api/admin/applications
   * Returns all supplier applications, sorted oldest-first (pending first).
   * Optionally filter by status and/or business type.
   * Guard: admin.
   *
   * @param {object} user
   * @param {{ status?: string, businessType?: string }} filters
   */
  async getApplications(user, filters = {}) {
    requireAdmin(user);
    return db.adminGetApplications(filters);
  },

  /**
   * GET /api/admin/applications/:id
   * Returns a single application with joined applicant profile.
   * Guard: admin.
   *
   * @param {object} user
   * @param {string} applicationId
   */
  async getApplication(user, applicationId) {
    requireAdmin(user);
    if (!applicationId) throw new ApiError('VALIDATION', 'Application ID is required.');
    return db.adminGetApplication(applicationId);
  },

  /**
   * POST /api/admin/applications/:id/approve
   * Atomically:
   *  1. Sets application.status = 'approved'
   *  2. Sets user.role = 'supplier', is_verified_supplier = true
   *  3. Creates supplier_profiles row with auto-generated slug
   *  4. Logs to audit_log
   * Guard: admin. Server enforced via approve_supplier_application RPC.
   *
   * @param {object} user   - Admin user from AuthContext
   * @param {string} applicationId
   */
  async approveApplication(user, applicationId) {
    requireAdmin(user);
    if (!applicationId) throw new ApiError('VALIDATION', 'Application ID is required.');
    return db.adminApproveApplication(applicationId, user.id);
  },

  /**
   * POST /api/admin/applications/:id/reject
   * Sets application.status = 'rejected', saves admin notes as rejection reason,
   * logs to audit_log.
   * Guard: admin. Server enforced via reject_supplier_application RPC.
   *
   * @param {object} user
   * @param {string} applicationId
   * @param {string|null} notes  - Shown to applicant as rejection reason
   */
  async rejectApplication(user, applicationId, notes = null) {
    requireAdmin(user);
    if (!applicationId) throw new ApiError('VALIDATION', 'Application ID is required.');
    return db.adminRejectApplication(applicationId, user.id, notes);
  },

  /**
   * POST /api/admin/suppliers/:id/suspend
   * Revokes is_verified_supplier = false and role = 'consumer'.
   * Updates latest application to status = 'suspended'.
   * Logs to audit_log.
   * Guard: admin. Server enforced via suspend_supplier RPC.
   *
   * @param {object} user
   * @param {string} targetUserId  - The supplier's profile ID
   * @param {string|null} reason
   */
  async suspendSupplier(user, targetUserId, reason = null) {
    requireAdmin(user);
    if (!targetUserId) throw new ApiError('VALIDATION', 'Target user ID is required.');
    return db.adminSuspendSupplier(targetUserId, user.id, reason);
  },
};
