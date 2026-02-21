// ── cloudinary.js ─────────────────────────────────────
// HOW THE PRESET WORKS:
//
// Cloudinary needs two things to accept an upload:
//   1. CLOUD_NAME    — your Cloudinary account name (already set below)
//   2. UPLOAD_PRESET — a named rule you create in your Cloudinary dashboard
//                      that allows unsigned uploads from the browser
//
// There is ONE place to set the preset: the constant below.
// It must exactly match a preset name you created at:
//   Cloudinary Dashboard → Settings → Upload → Upload presets → Add preset
//   Set "Signing mode" to UNSIGNED, give it any name you like.
//
// ↓ Only change this line if you rename your preset
const CLOUD_NAME    = "dps1y8zta";
const UPLOAD_PRESET = "unimart_preset";

// ── Upload files to Cloudinary ─────────────────────────
// Accepts: array of File objects (from <input type="file">)
// Returns: array of permanent HTTPS image URLs
// Throws:  descriptive Error so the caller can show the right message
async function uploadToCloudinary(files) {
  const urls = [];

  for (const file of files) {
    const formData = new FormData();
    formData.append("file",          file);
    formData.append("upload_preset", UPLOAD_PRESET); // ← sent to Cloudinary here

    // 30-second timeout prevents the "stuck at Uploading…" freeze
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 30000);

    let res;
    try {
      res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        { method: "POST", body: formData, signal: controller.signal }
      );
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr.name === 'AbortError') {
        throw new Error('Upload timed out after 30s. Check your internet and try again.');
      }
      throw new Error('Network error — check your connection and try again.');
    }

    clearTimeout(timeout);

    const data = await res.json();

    // Cloudinary sends { error: { message } } when something is wrong
    // Common causes: preset doesn't exist, preset is signed not unsigned,
    //                wrong cloud name, file too large
    if (data.error) {
      throw new Error(`Cloudinary: ${data.error.message}`);
    }

    if (!data.secure_url) {
      throw new Error('Cloudinary returned no URL. Check your preset is set to Unsigned.');
    }

    // secure_url is the permanent HTTPS link stored in Firestore
    urls.push(data.secure_url);
  }

  return urls;
}
