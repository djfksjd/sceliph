import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { compileAssemblyIR, waitForReferenceProjections } from '../engine/assembly-compiler';
import type { AssemblyIR } from '../engine/assembly-ir';

/**
 * Browser-side renderer for the appearance evaluation (scripts/abo-appearance-eval.ts).
 * Reference GLB and candidate (an AssemblyIR, or a controlled variant of the
 * reference) are placed exactly like compareMeshShapes (floor at y = 0, x/z
 * centred, candidate turned by the shape-aligned yaw) and rendered from the
 * same ring of synthetic cameras in two passes:
 *   albedo  unlit base colour (map × colour), no tone mapping: colour fidelity
 *   lit     the materials as authored under one fixed neutral studio light
 * Evaluation only; never part of the viewer or a delivered asset.
 */

export type Control = 'flat' | 'grey';
export interface RenderRequest {
  glbUrl: string;
  /** Candidate IR; absent means the candidate is the reference itself (with an optional control). */
  ir?: AssemblyIR;
  /** Paint every candidate surface this colour (the "grey IR" baseline). */
  paint?: string;
  control?: Control;
  yawDeg: number;
  views: number;
  elevationDeg: number;
  size: number;
}
/** albedo, lit and ids (each mesh painted a unique exact sRGB colour, so part boundaries can be excluded). */
export interface RenderedView { albedo: string; lit: string; ids: string }
export interface RenderResult { reference: RenderedView[]; candidate: RenderedView[] }

const loader = new GLTFLoader();
let renderer: THREE.WebGLRenderer | undefined;
let environment: THREE.Texture | undefined;

function setup(size: number): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  return renderer;
}

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((object) => { if (object instanceof THREE.Mesh) out.push(object); });
  return out;
}
const materialsOf = (mesh: THREE.Mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[];
/** Replaces materials keeping the single-vs-array shape (an array on an ungrouped geometry draws nothing). */
function mapMaterials(mesh: THREE.Mesh, map: (material: THREE.MeshStandardMaterial) => THREE.Material): void {
  const next = materialsOf(mesh).map(map);
  mesh.material = Array.isArray(mesh.material) ? next : next[0]!;
}

/** Mean colour of a texture in linear space, read through a small canvas. */
function meanTextureColor(texture: THREE.Texture | null): THREE.Color {
  const image = texture?.image as CanvasImageSource & { width?: number; height?: number } | undefined;
  if (!image || !image.width) return new THREE.Color(1, 1, 1);
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0, 32, 32);
  const data = context.getImageData(0, 0, 32, 32).data;
  let r = 0; let g = 0; let b = 0;
  for (let i = 0; i < data.length; i += 4) { r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; }
  const n = data.length / 4;
  return new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
}

function applyControl(root: THREE.Object3D, control: Control | undefined, paint: string | undefined): void {
  for (const mesh of meshes(root)) {
    mapMaterials(mesh, (source) => {
      const material = source.clone();
      if (paint || control === 'grey') {
        material.map = null;
        material.color = new THREE.Color(paint ?? '#808080');
      } else if (control === 'flat') {
        const mean = meanTextureColor(material.map);
        material.color = (material.color?.clone() ?? new THREE.Color(1, 1, 1)).multiply(mean);
        material.map = null;
      }
      material.needsUpdate = true;
      return material;
    });
  }
}

function idCopy(root: THREE.Object3D): THREE.Object3D {
  const copy = root.clone(true);
  meshes(copy).forEach((mesh, index) => {
    const id = index + 1;
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    material.color.setRGB((id & 255) / 255, ((id >> 8) & 255) / 255, 0.5, THREE.SRGBColorSpace);
    mesh.material = material;
  });
  return copy;
}

function albedoCopy(root: THREE.Object3D): THREE.Object3D {
  const copy = root.clone(true);
  for (const mesh of meshes(copy)) {
    mapMaterials(mesh, (source) => new THREE.MeshBasicMaterial({
      color: source.color?.clone() ?? new THREE.Color(1, 1, 1),
      map: source.map ?? null,
      side: source.side,
      vertexColors: source.vertexColors,
    }));
  }
  return copy;
}

/** Floor at y = 0, centred in x/z, after turning by yaw (compareMeshShapes' placement). */
function place(root: THREE.Object3D, yawDeg: number): THREE.Group {
  const group = new THREE.Group();
  const turn = new THREE.Group();
  turn.rotation.y = yawDeg * Math.PI / 180;
  turn.add(root);
  group.add(turn);
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group, true);
  const center = bounds.getCenter(new THREE.Vector3());
  turn.position.set(-center.x, -bounds.min.y, -center.z);
  group.updateMatrixWorld(true);
  return group;
}

function shoot(object: THREE.Object3D, cameras: THREE.PerspectiveCamera[], lit: boolean): string[] {
  const r = renderer!;
  const scene = new THREE.Scene();
  scene.add(object);
  if (lit) {
    scene.environment = environment ?? null;
    scene.environmentIntensity = 0.6;
    scene.add(new THREE.HemisphereLight('#ffffff', '#5a5a5a', 0.8));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(2, 4, 3);
    scene.add(key);
  }
  return cameras.map((camera) => {
    // PMREM generation can leave its render target bound; always draw to the canvas.
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, camera);
    // Raw RGBA, top row first, base64: no image codec between the GPU and the metric.
    const size = r.domElement.width;
    const gl = r.getContext();
    const pixels = new Uint8Array(size * size * 4);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const flipped = new Uint8Array(pixels.length);
    for (let y = 0; y < size; y += 1) flipped.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    let binary = '';
    for (let i = 0; i < flipped.length; i += 0x8000) binary += String.fromCharCode(...flipped.subarray(i, i + 0x8000));
    return `rgba:${size}:${btoa(binary)}`;
  });
}

async function loadReference(url: string): Promise<THREE.Object3D> {
  const gltf = await loader.loadAsync(url);
  return gltf.scene;
}

export async function renderPair(request: RenderRequest): Promise<RenderResult> {
  setup(request.size);
  const referenceRoot = await loadReference(request.glbUrl);
  let candidateRoot: THREE.Object3D;
  if (request.ir) {
    candidateRoot = compileAssemblyIR(request.ir, 'beauty').root;
    // Photo projections and generated maps load asynchronously; never score a placeholder.
    await waitForReferenceProjections(candidateRoot);
    if (request.paint) applyControl(candidateRoot, undefined, request.paint);
  } else {
    candidateRoot = await loadReference(request.glbUrl);
    applyControl(candidateRoot, request.control, request.paint);
  }
  const reference = place(referenceRoot, 0);
  const candidate = place(candidateRoot, request.ir ? request.yawDeg : 0);
  const extent = (object: THREE.Object3D) => new THREE.Box3().setFromObject(object, true).getSize(new THREE.Vector3());
  const refSize = extent(reference);
  const reach = Math.max(refSize.length(), extent(candidate).length());
  const fov = 40;
  const distance = 0.65 * reach / Math.tan(fov / 2 * Math.PI / 180);
  const target = new THREE.Vector3(0, refSize.y / 2, 0);
  const elevation = request.elevationDeg * Math.PI / 180;
  const cameras = Array.from({ length: request.views }, (_, k) => {
    const azimuth = k * 2 * Math.PI / request.views;
    const camera = new THREE.PerspectiveCamera(fov, 1, distance / 100, distance * 10);
    camera.position.set(
      target.x + distance * Math.cos(elevation) * Math.sin(azimuth),
      target.y + distance * Math.sin(elevation),
      target.z + distance * Math.cos(elevation) * Math.cos(azimuth),
    );
    camera.lookAt(target);
    return camera;
  });
  const views = (object: THREE.Object3D): RenderedView[] => {
    const albedo = shoot(albedoCopy(object), cameras, false);
    const ids = shoot(idCopy(object), cameras, false);
    const lit = shoot(object, cameras, true);
    return albedo.map((image, index) => ({ albedo: image, lit: lit[index]!, ids: ids[index]! }));
  };
  const result = { reference: views(reference), candidate: views(candidate) };
  // Free GPU memory between items; a long run otherwise loses the WebGL context.
  for (const object of [reference, candidate]) {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      for (const material of materialsOf(child)) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
        material.dispose();
      }
    });
  }
  renderer?.renderLists.dispose();
  return result;
}

Object.assign(window, { sceliphAppearance: { renderPair } });
