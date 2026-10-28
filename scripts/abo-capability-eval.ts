/**
 * Capability-exposure runs (roadmap step 2b): the same evaluation as
 * scripts/abo-multiview-eval.ts with the Manifold runtime initialised first,
 * so a guide that offers booleanCSG can be compiled and scored. Same arguments.
 *
 * ABO data, images and 3D models © Amazon.com, CC-BY-4.0.
 */
import { initManifold } from '../src/engine/boolean-csg';

await initManifold();
await import('./abo-multiview-eval');
