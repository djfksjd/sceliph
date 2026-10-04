import {readFileSync,writeFileSync} from 'node:fs';
import {probe} from './probe';
writeFileSync('work/gear-runtime-math-20261004/node-probe.json',JSON.stringify(probe(JSON.parse(readFileSync('work/gear-runtime-math-20261004/cases.json','utf8')))));
