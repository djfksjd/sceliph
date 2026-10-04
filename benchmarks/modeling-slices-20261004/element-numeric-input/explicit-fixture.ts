import {readFileSync,writeFileSync} from 'node:fs';import {parseProject,detachElement,serializeProject} from '../../src/engine/element-project';
const p=detachElement(parseProject(readFileSync('work/element-numeric-input-20261004/source.json','utf8')),'body_fur/000000');p.selection=['body_fur/000000'];writeFileSync('work/element-numeric-input-20261004/explicit-source.json',serializeProject(p));
