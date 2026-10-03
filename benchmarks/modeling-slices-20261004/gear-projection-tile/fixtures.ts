import {writeFileSync} from 'node:fs';import {generateSpurGearProject} from '../../src/engine/gear-pack';import {serializeProject} from '../../src/engine/element-project';
for(const [name,input] of Object.entries({small:{moduleMm:.5,faceWidthMm:4,boreDiameterMm:3},default:{},large:{moduleMm:2,faceWidthMm:16,boreDiameterMm:12}})){
 const p=generateSpurGearProject(input);p.parts.push({id:'preserved_sphere',name:'Preserved reference sphere',shape:'assembly-geometry',geometry:{op:'sphere',radius:2,widthSegments:24,heightSegments:16},position:[40,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#bc6546',material:{roughness:.5,metalness:.2},visible:true,locked:false,evidence:{status:'authored',source:'UV edit non-target preservation sentinel'}});
 p.selection=['spur_gear'];writeFileSync('work/gear-projection-tile-20261004/'+name+'-source.json',serializeProject(p));
}
