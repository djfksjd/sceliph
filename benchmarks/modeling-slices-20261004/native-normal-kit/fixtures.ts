import {writeFileSync} from 'node:fs';
import {generateBearingProject} from '../../src/engine/bearing-pack';
import {generateSpurGearProject} from '../../src/engine/gear-pack';
import {migrateElementProjectToV4,serializeProject} from '../../src/engine/element-project';
const cases={small:generateBearingProject({boreDiameterMm:10,outerDiameterMm:20,widthMm:6,ballDiameterMm:3}),default:generateBearingProject({}),large:generateBearingProject({boreDiameterMm:40,outerDiameterMm:80,widthMm:24,ballDiameterMm:12}),gear:migrateElementProjectToV4(generateSpurGearProject({}))};
cases.gear.parts[0].uvScale=100;
for(const [name,project] of Object.entries(cases))writeFileSync('work/native-normal-kit-20261004/'+name+'.json',serializeProject({...project,selection:project.parts.map(p=>p.id)}));
