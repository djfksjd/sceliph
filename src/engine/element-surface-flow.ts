import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { ProjectError, resolveElements, validateProject, type ElementProject, type Vec3 } from './element-project';

/** Bake an owner-local tangent flow into existing rotation overrides. No schema or legacy resolver change. */
export function applyEllipsoidSurfaceFlow(project: ElementProject, groupId: string, direction: Vec3, elevationDegrees: number): ElementProject {
  validateProject(project);
  if (direction.length !== 3 || !direction.every(Number.isFinite) || new Vector3(...direction).lengthSq() < 1e-12)
    throw new ProjectError('flowDirection', groupId);
  if (!Number.isFinite(elevationDegrees) || elevationDegrees < 0 || elevationDegrees > 85)
    throw new ProjectError('flowElevation', groupId);
  const group = project.groups.find(g => g.id === groupId);
  const region = project.regions.find(r => r.id === group?.regionId);
  const owner = project.parts.find(p => p.id === region?.partId);
  if (!group || !owner || owner.shape !== 'ellipsoid' || group.distribution !== 'ellipsoid-surface')
    throw new ProjectError('unsupportedFlowSurface', groupId);
  const members = resolveElements(project).filter(e => e.groupId === groupId && e.source === 'generated');
  if (!members.length) throw new ProjectError('flowNoGeneratedMembers', groupId);
  if (owner.locked || members.some(e => e.locked)) throw new ProjectError('locked', groupId);
  const next = structuredClone(project);
  const target = next.groups.find(g => g.id === groupId)!;
  // Resolve without old rotation deltas so repeated application is exactly idempotent.
  for (const member of members) {
    const o = target.overrides[member.id];
    if (o) delete o.rotation;
  }
  const baseline = new Map(resolveElements(next).map(e => [e.id, e]));
  const ownerQ = new Quaternion().setFromEuler(new Euler(...owner.rotation));
  const inverseOwner = ownerQ.clone().invert();
  const radians = elevationDegrees * Math.PI / 180;
  for (const member of members) {
    const root = new Vector3(...member.position).sub(new Vector3(...owner.position)).applyQuaternion(inverseOwner);
    const n = new Vector3(root.x / owner.scale[0] ** 2, root.y / owner.scale[1] ** 2, root.z / owner.scale[2] ** 2);
    if (n.lengthSq() < 1e-20) throw new ProjectError('flowSurfaceRoot', member.id);
    n.normalize();
    const tangent = new Vector3(...direction).normalize();
    tangent.addScaledVector(n, -tangent.dot(n));
    if (tangent.lengthSq() < 1e-12) throw new ProjectError('flowParallelToNormal', member.id);
    tangent.normalize();
    const y = tangent.multiplyScalar(Math.cos(radians)).addScaledVector(n, Math.sin(radians));
    const z = n.clone().addScaledVector(y, -n.dot(y)).normalize();
    const x = y.clone().cross(z).normalize();
    const desired = ownerQ.clone().multiply(new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z)));
    const baseQ = new Quaternion().setFromEuler(new Euler(...baseline.get(member.id)!.rotation));
    const delta = new Euler().setFromQuaternion(baseQ.invert().multiply(desired), 'XYZ');
    target.overrides[member.id] = { ...target.overrides[member.id], rotation: [delta.x, delta.y, delta.z] };
  }
  return validateProject(next);
}
