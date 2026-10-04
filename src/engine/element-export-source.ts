import {extractToothGeometry} from './spur-gear';
import {parseProject,serializeProject,type ElementProject} from './element-project';

/** Isolated UI export input uses the existing saved IR representation.
 * Keeps legacy serialization policy; source values and renderer remain unchanged. */
export function prepareElementExportSource(project:ElementProject):ElementProject {
 const source=parseProject(serializeProject(project));
 delete source.selection;
 return source;
}

/** A diagnostic connected sector copy; the full gear remains the editable source. */
export function prepareDiagnosticToothExportSource(project:ElementProject,partId:string,featureId:string):ElementProject {
 const copy=prepareElementExportSource(project),piece=copy.parts.find(p=>p.id===partId);
 if(piece?.geometry?.op!=='spur-gear')throw new Error('Select a spur gear');
 if(piece.axialChamferMm)throw new Error('Chamfered diagnostic tooth cuts are unsupported; export whole gear or set chamfer to 0');
 piece.geometry=extractToothGeometry(piece.geometry,featureId);
 delete piece.assemblyId;delete piece.home;delete piece.axialChamferMm;
 copy.parts=[piece];copy.regions=[];copy.groups=[];copy.elements=[];copy.assemblies=[];
 return copy;
}
