import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildStore, addStoreLights } from './store';
import { loadInday, type AvatarCapabilities, type IndayHandle } from '../inday/inday';
import { LipSyncPlayer } from '../inday/lipsync';

export interface StageProps {
  /** Mouth opening, 0..1, owned by React so speech can drive it. */
  mouthRef: React.MutableRefObject<number>;
  onCapabilities: (caps: AvatarCapabilities) => void;
  onReady: () => void;
  onError: (message: string) => void;
}

/** The Three.js canvas: store, INDAY, and the render loop. */
export function Stage({ mouthRef, onCapabilities, onReady, onError }: StageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<IndayHandle | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x065f46);
    scene.fog = new THREE.Fog(0x065f46, 14, 26);

    const camera = new THREE.PerspectiveCamera(42, host.clientWidth / host.clientHeight, 0.1, 100);
    camera.position.set(0, 1.62, 4.35);
    camera.lookAt(0, 1.3, -0.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.3, -0.4);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2.2;
    controls.maxDistance = 8;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.enablePan = false;
    controls.update();

    addStoreLights(scene);
    const store = buildStore();
    scene.add(store.root);

    // A soft contact shadow so INDAY feels planted on the tile.
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(0, 0.005, 0.55);
    scene.add(blob);

    const clock = new THREE.Clock();
    let raf = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      const inday = handleRef.current;
      if (inday) {
        inday.update(elapsed);
        inday.setMouthOpen(mouthRef.current);
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!host) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener('resize', onResize);

    loadInday()
      .then((inday) => {
        if (disposed) {
          inday.dispose();
          return;
        }
        handleRef.current = inday;
        scene.add(inday.root);
        onCapabilities(inday.capabilities);
        onReady();
        if (import.meta.env.DEV) {
          // Diagnostic hook so the lip-sync chain can be asserted end to end.
          (window as unknown as Record<string, unknown>).__inday = inday;
        }
      })
      .catch((err: Error) => {
        if (!disposed) onError(err.message);
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      handleRef.current?.dispose();
      handleRef.current = null;
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
    // Mount once: the scene owns its own lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className="stage" />;
}

export { LipSyncPlayer };
