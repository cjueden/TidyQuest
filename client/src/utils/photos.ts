// Phone cameras make photos of several MB, more than the server takes (5 MB hosted, 8 MB self-hosted, avatars 2 MB).
// Before uploading, the browser scales a photo down to a JPEG of a few hundred KB. Anything it can't read (some HEIC
// files), animated GIFs and photos that are already small go up as they are; the server limits stay as the safety net.

/** Proof photos: 1600 px on the long side is plenty to check a chore. */
export const PROOF_PHOTO = { maxSide: 1600, quality: 0.8 };
/** Avatars show at most a few hundred pixels wide. */
export const AVATAR_PHOTO = { maxSide: 512, quality: 0.85 };

const SMALL_ENOUGH = 300 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable image')); };
    img.src = url;
  });
}

export async function shrinkPhoto(file: File, { maxSide, quality }: { maxSide: number; quality: number }): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  try {
    // An <img> turns the photo upright from its EXIF orientation, and drawing it keeps that
    const img = await loadImage(file);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size <= SMALL_ENOUGH) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // JPEG has no transparency: a see-through PNG gets a white background instead of black
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]*$/, '') || 'photo';
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}
