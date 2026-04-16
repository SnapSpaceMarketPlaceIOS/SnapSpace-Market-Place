/**
 * moderation.js — client-side helpers for the Report + Block UGC mechanism.
 *
 * Required by Apple Guideline 1.2 for apps that host user-generated content
 * (community designs in HomeGenie). Users must have a path to:
 *   1. Report objectionable content
 *   2. Block other users from their view of the community
 *
 * This module exports:
 *   - reportUser(opts)  — file a report, optionally block the target
 *   - blockUser(id)     — add a block without filing a report
 *   - unblockUser(id)   — remove a block
 *   - getBlockedIds()   — fetch the current user's block list (for filtering feeds)
 *
 * All calls are best-effort — network failures never throw to the caller, so
 * UI can always close its modals cleanly. Errors are logged to console only.
 */

import { supabase } from './supabase';

export const REPORT_REASONS = [
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'spam',          label: 'Spam or misleading' },
  { value: 'harassment',    label: 'Harassment or bullying' },
  { value: 'hate_speech',   label: 'Hate speech' },
  { value: 'copyright',     label: 'Copyright violation' },
  { value: 'other',         label: 'Something else' },
];

/**
 * File a report against a user (optionally a specific design), and optionally
 * block the target at the same time.
 *
 * @param {object} opts
 * @param {string} opts.targetUserId      The user being reported. REQUIRED.
 * @param {string} [opts.targetDesignId]  Specific design being reported (if any).
 * @param {string} [opts.reason]          One of REPORT_REASONS.value (default 'other').
 * @param {string} [opts.notes]           Free-text additional notes.
 * @param {boolean} [opts.alsoBlock]      Default true — hide the user from this user's feed.
 * @returns {Promise<{ success: boolean, reportId?: string, blocked?: boolean, error?: string }>}
 */
export async function reportUser({
  targetUserId,
  targetDesignId = null,
  reason = 'other',
  notes = null,
  alsoBlock = true,
}) {
  if (!targetUserId) {
    return { success: false, error: 'Missing target user.' };
  }
  try {
    const { data, error } = await supabase.rpc('report_and_block_user', {
      p_target_user_id:   targetUserId,
      p_target_design_id: targetDesignId,
      p_reason:           reason,
      p_notes:            notes,
      p_also_block:       alsoBlock,
    });
    if (error) {
      console.warn('[Moderation] report RPC error:', error.message);
      return { success: false, error: error.message };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return {
      success:  true,
      reportId: row?.report_id,
      blocked:  !!row?.blocked,
    };
  } catch (e) {
    console.warn('[Moderation] report threw:', e?.message || e);
    return { success: false, error: 'Network error — please try again.' };
  }
}

/**
 * Block a user without filing a report.
 */
export async function blockUser(targetUserId) {
  if (!targetUserId) return { success: false, error: 'Missing target user.' };
  try {
    const { error } = await supabase
      .from('user_blocks')
      .insert({ blocked_id: targetUserId });
    if (error && !error.message.includes('duplicate key')) {
      console.warn('[Moderation] block error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e) {
    console.warn('[Moderation] block threw:', e?.message || e);
    return { success: false, error: 'Network error — please try again.' };
  }
}

/**
 * Remove a block.
 */
export async function unblockUser(targetUserId) {
  if (!targetUserId) return { success: false };
  try {
    const { error } = await supabase.rpc('unblock_user', { p_blocked_id: targetUserId });
    if (error) {
      console.warn('[Moderation] unblock error:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e) {
    console.warn('[Moderation] unblock threw:', e?.message || e);
    return { success: false };
  }
}

/**
 * Fetch the current user's blocked-user IDs. Used to filter community feeds
 * client-side so blocked users' content doesn't appear.
 *
 * @returns {Promise<string[]>} array of blocked user IDs (empty on any error)
 */
export async function getBlockedIds() {
  try {
    const { data, error } = await supabase.rpc('get_my_blocked_ids');
    if (error) {
      console.warn('[Moderation] getBlockedIds error:', error.message);
      return [];
    }
    return (data || []).map((row) => row.blocked_id).filter(Boolean);
  } catch (e) {
    console.warn('[Moderation] getBlockedIds threw:', e?.message || e);
    return [];
  }
}
