import {writeFileSync} from 'node:fs';
import {createFurProject} from '../../src/engine/bird-element-demo';
import {migrateElementProject,editElement,serializeProject} from '../../src/engine/element-project';
import {exportSelectedScene} from '../../src/engine/element-renderer';
import {analyzeTopology} from '../../src/engine/topology';
import {inspectUvQuality} from '../../src/engine/uv-quality';
const p=createFurProject();p.groups[0].count=3;
const q=editElement(migrateElementProject(p),'body_fur/000000',{position:[5,0,0]});q.selection=['body_fur/000000'];writeFileSync('work/element-numeric-input-20261004/source.json',serializeProject(q));
const s=exportSelectedScene(q,[...q.parts.map(p=>p.id),'body_fur/000000','body_fur/000001','body_fur/000002']);try{writeFileSync('work/element-numeric-input-20261004/baseline-geometry.json',JSON.stringify({topology:analyzeTopology(s.root),uv:await inspectUvQuality(s.root)},null,2));console.log('existing explicit0.2 migration, authored three strands, selected owner-local5mm fixture generated');}finally{s.dispose();}
