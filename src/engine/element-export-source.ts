import {parseProject,serializeProject,type ElementProject} from './element-project';

/** Isolated UI export input uses the existing saved IR representation.
 * Keeps legacy serialization policy; source values and renderer remain unchanged. */
export function prepareElementExportSource(project:ElementProject):ElementProject {
 const source=parseProject(serializeProject(project));
 delete source.selection;
 return source;
}
