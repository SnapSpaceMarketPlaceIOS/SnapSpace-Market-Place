#!/usr/bin/env node
/**
 * upload-onboarding-videos — uploads the 7 onboarding MP4s to Supabase
 * storage. Run ONCE per release that ships new onboarding videos.
 *
 * Why: Build 147 (C4) moves the ~44 MB of bundled onboarding videos out
 * of the IPA and into a public Supabase bucket. This script does the
 * upload (the JS app then sets EXPO_PUBLIC_ONBOARDING_VIDEO_BASE_URL
 * to the public bucket URL so OnboardingArt.js picks them up at
 * runtime).
 *
 * Requirements:
 *   - SUPABASE_URL              (your project URL)
 *   - SUPABASE_SERVICE_ROLE_KEY (service role, NOT anon — admin perms
 *                                needed to create/write to a public bucket)
 *
 * Bucket: `onboarding-videos` (created if missing, set to public).
 * Files: slide-1.mp4 … slide-7.mp4 (skips slide-6 which is the paywall).
 *
 * Usage:
 *   SUPABASE_URL=https://lqjf...supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/upload-onboarding-videos.mjs
 *
 * After running, set in EAS / .env (and rebuild):
 *   EXPO_PUBLIC_ONBOARDING_VIDEO_BASE_URL=
 *     https://lqjf...supabase.co/storage/v1/object/public/onboarding-videos
 *
 * Then verify on TestFlight, then delete the bundled MP4s:
 *   rm src/assets/onboarding/videos/slide-*.mp4
 *   # And Metro will tree-shake the require() fallbacks out of the bundle.
 */

import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEOS_DIR = path.resolve(__dirname, '../src/assets/onboarding/videos');
const SLIDES = [1, 2, 3, 4, 5, 7]; // skip 6 = paywall
const BUCKET = 'onboarding-videos';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env vars. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function ensureBucket() {
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) throw new Error(`listBuckets: ${listErr.message}`);
  const exists = buckets?.some(b => b.name === BUCKET);
  if (exists) {
    console.log(`Bucket "${BUCKET}" already exists.`);
    return;
  }
  console.log(`Creating bucket "${BUCKET}" (public)...`);
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 50 * 1024 * 1024, // 50 MB safety cap
    allowedMimeTypes: ['video/mp4'],
  });
  if (error) throw new Error(`createBucket: ${error.message}`);
}

async function uploadSlide(n) {
  const filename = `slide-${n}.mp4`;
  const localPath = path.join(VIDEOS_DIR, filename);
  let bytes;
  try {
    bytes = await readFile(localPath);
  } catch (e) {
    console.error(`SKIP ${filename}: not found at ${localPath}`);
    return;
  }
  console.log(`Uploading ${filename} (${(bytes.length / (1024 * 1024)).toFixed(2)} MB)...`);
  const { error } = await supabase.storage.from(BUCKET).upload(filename, bytes, {
    contentType: 'video/mp4',
    upsert: true,
    cacheControl: '31536000',  // 1 year — videos are static
  });
  if (error) {
    console.error(`FAIL ${filename}: ${error.message}`);
    return;
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  console.log(`OK   ${filename}  →  ${data.publicUrl}`);
}

(async () => {
  try {
    await ensureBucket();
    for (const n of SLIDES) {
      await uploadSlide(n);
    }
    console.log('\nDone. Set EXPO_PUBLIC_ONBOARDING_VIDEO_BASE_URL to:');
    console.log(`  ${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`);
  } catch (e) {
    console.error('FATAL:', e.message);
    process.exit(1);
  }
})();
