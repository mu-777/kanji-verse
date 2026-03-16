import * as THREE from "three";
import { EffectComposer }   from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass }       from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass }  from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass }       from "three/addons/postprocessing/OutputPass.js";

export interface ComposerBundle {
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;
}

export function createComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): ComposerBundle {
  const composer = new EffectComposer(renderer);

  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.4,   // strength
    0.5,   // radius
    0.2,   // threshold（低すぎると全ピクセルがブルーム対象になり重い）
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  window.addEventListener("resize", () => {
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  return { composer, bloomPass };
}
