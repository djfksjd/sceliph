import fs from 'node:fs';
import {WebIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
const io=new WebIO().registerExtensions(ALL_EXTENSIONS);const rows=[];
for(const f of ['before/morphloom-uv-diagnostic.glb','explicit-zero/morphloom-uv-diagnostic.glb','explicit-four/morphloom-uv-diagnostic.glb','reopened/morphloom-uv-diagnostic.glb','bearing-five/morphloom-project.glb','four-native-kit/model.glb']){const d=await io.readBinary(new Uint8Array(fs.readFileSync(new URL(f,import.meta.url))));rows.push({file:f,meshes:d.getRoot().listMeshes().length,nodes:d.getRoot().listNodes().length,materials:d.getRoot().listMaterials().length,accessors:d.getRoot().listAccessors().length});}
fs.writeFileSync(new URL('independent-reopen.json',import.meta.url),JSON.stringify(rows,null,2));console.log('6 actual GLBs independently reopened PASS');
