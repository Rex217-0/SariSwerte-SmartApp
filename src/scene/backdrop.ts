/**
 * Store backdrop.
 *
 * Drop a photo of the real tindahan at `public/backdrop.jpg` (or .png / .webp)
 * and it becomes the wall behind INDAY. No rebuild needed: the file is served
 * as a static asset, so replacing it updates the app on the next reload.
 *
 * The scene has a solid emerald wall at z = -3 that would hide any photo, so the
 * backdrop is mounted slightly in front of it and the wall is left as a fallback
 * for when no photo exists.
 */
import * as THREE from 'three';

/** Filenames tried in order, so the operator can drop whichever format they have. */
const CANDIDATES = ['backdrop.jpg', 'backdrop.png', 'backdrop.webp'];

/**
 * Load the first backdrop that exists. Resolves to null when the operator has not
 * added one, which is not an error: the emerald wall stays.
 */
export async function loadBackdrop(): Promise<THREE.Mesh | null> {
  for (const name of CANDIDATES) {
    const url = `${import.meta.env.BASE_URL}${name}`.replace(/\/{2,}/g, '/');
    const texture = await probeTexture(url);
    if (texture) {
      // The photo is behind everything, so let it read as a lit surface rather
      // than a glowing flat panel.
      texture.colorSpace = THREE.SRGBColorSpace;
      const aspect = texture.image.height / texture.image.width;
      const width = 11;
      const height = Math.min(4.2, width * aspect);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
      );
      // Just in front of the back wall, and above the floor line.
      mesh.position.set(0, 1.8, -2.93);
      mesh.name = 'StoreBackdrop';
      return mesh;
    }
  }
  return null;
}

/**
 * A dev server's SPA fallback answers a missing image with index.html and HTTP
 * 200, so the response has to be checked as an image before it reaches the
 * texture loader. Without this, a missing photo shows a broken texture.
 */
function probeTexture(url: string): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        resolve(null);
        return;
      }
      const texture = new THREE.Texture(img);
      texture.needsUpdate = true;
      resolve(texture);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
