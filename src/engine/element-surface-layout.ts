import { applyEllipsoidSurfaceFlow } from './element-surface-flow';
import { ProjectError, resolveElements, slotId, validateProject, type ElementProject, type Vec3 } from './element-project';

export type SurfaceLayout = {
  rows: number;
  latitudeDegrees: [number, number];
  azimuthDegrees: [number, number];
  direction: Vec3;
  elevationDegrees: number;
};

/** Owner-local ellipsoid patch; rows retain original slot indices including deleted slots. */
export function applyEllipsoidSurfaceLayout(project: ElementProject, groupId: string, layout: SurfaceLayout): ElementProject {
  validateProject(project);
  const group = project.groups.find(g => g.id === groupId);
  const region = project.regions.find(r => r.id === group?.regionId);
  const owner = project.parts.find(p => p.id === region?.partId);
  if (!group || !owner || owner.shape !== 'ellipsoid' || group.distribution !== 'ellipsoid-surface')
    throw new ProjectError('unsupportedLayoutSurface', groupId);
  if (!Number.isInteger(layout.rows) || layout.rows < 1 || group.count === 0 || group.count % layout.rows !== 0)
    throw new ProjectError('layoutRowsMustDivideCount', groupId);
  for (const [range, limit, name] of [[layout.latitudeDegrees,89,'latitude'],[layout.azimuthDegrees,360,'azimuth']] as const) {
    if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite) || range[0] < -limit || range[1] > limit || range[0] >= range[1])
      throw new ProjectError('layoutAngleRange', name);
  }
  if (layout.azimuthDegrees[1] - layout.azimuthDegrees[0] > 360) throw new ProjectError('layoutAngleRange','azimuth');
  const members = new Set(resolveElements(project).filter(e=>e.groupId===groupId && e.source==='generated').map(e=>e.id));
  const next = structuredClone(project), target = next.groups.find(g=>g.id===groupId)!;
  const columns = group.count / layout.rows;
  for (let i=0;i<group.count;i++) {
    const id=slotId(groupId,i);
    if (!members.has(id)) continue;
    const row=Math.floor(i/columns), column=i%columns;
    const latitude=(layout.latitudeDegrees[0]+(row+.5)/layout.rows*(layout.latitudeDegrees[1]-layout.latitudeDegrees[0]))*Math.PI/180;
    // A quarter-cell alternating stagger stays inside the declared patch; no wrap seam.
    const u=(column+.5+(row%2 ? .25 : 0))/columns;
    const azimuth=(layout.azimuthDegrees[0]+u*(layout.azimuthDegrees[1]-layout.azimuthDegrees[0]))*Math.PI/180;
    const position:Vec3=[owner.scale[0]*.5*Math.cos(latitude)*Math.sin(azimuth),owner.scale[1]*.5*Math.sin(latitude),owner.scale[2]*.5*Math.cos(latitude)*Math.cos(azimuth)];
    target.overrides[id]={...target.overrides[id],position};
  }
  // Flow performs the shared lock/direction validation. A failure never mutates the caller.
  return applyEllipsoidSurfaceFlow(next,groupId,layout.direction,layout.elevationDegrees);
}
