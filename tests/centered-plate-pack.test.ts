import {expect,it}from'vitest';
import {Mesh,Raycaster,Vector3,DoubleSide,MeshBasicMaterial}from'three';
import {generateCenteredPlateProject,centeredPlatePack}from'../src/engine/centered-plate-pack';
import {exportSelectedScene}from'../src/engine/element-renderer';
import {analyzeTopology}from'../src/engine/topology';
import {createElementDomainRegistry}from'../src/engine/element-domain-packs';
import {executeDomainInvocation,parseDomainInvocation}from'../src/engine/domain-invocation';
const call={schema:'sceliph.domain-invocation/0.1',units:'mm',coordinates:'right-handed-y-up',packId:'product.centered-plate',input:{},requiredCapabilities:['generate']};
it('creates actual centered dimensions, thickness and a through bore at three sizes',()=>{
 for(const k of [.5,1,2]){const p=generateCenteredPlateProject({widthMm:20*k,heightMm:10*k,thicknessMm:4*k,boreDiameterMm:4*k}),b=exportSelectedScene(p,['plate_body']);try{expect(analyzeTopology(b.root).pass).toBe(true);const m=b.root.getObjectByName('plate_body')as Mesh;m.geometry.computeBoundingBox();const box=m.geometry.boundingBox!;expect(box.getSize(new Vector3()).multiplyScalar(1000).toArray()).toEqual([20*k,10*k,4*k].map(n=>expect.closeTo(n,4)));expect(box.min.x+box.max.x).toBeCloseTo(0,8);expect(box.min.y+box.max.y).toBeCloseTo(0,8);expect(box.min.z+box.max.z).toBeCloseTo(0,8);const mat=new MeshBasicMaterial({side:DoubleSide}),probe=new Mesh(m.geometry,mat);probe.updateMatrixWorld(true);expect(new Raycaster(new Vector3(0,0,1),new Vector3(0,0,-1)).intersectObject(probe).length).toBe(0);mat.dispose();}finally{b.dispose();}}
});
it('executes a registered pack without compiler changes and rejects invalid dimensions/frame/capability',()=>{
 const registry=createElementDomainRegistry();registry.register(centeredPlatePack);expect(executeDomainInvocation(registry,JSON.stringify(call)).project.parts[0].geometry?.op).toBe('extrude');
 for(const input of [{widthMm:0},{boreDiameterMm:10},{widthMm:null},{seed:-1},{units:'cm'},{coordinates:'left-handed-y-up'}])expect(()=>registry.generate(centeredPlatePack.metadata.id,input)).toThrow();
 for(const patch of [{schema:'future'},{units:'cm'},{extra:true},{requiredCapabilities:['solid-brep']}])expect(()=>executeDomainInvocation(registry,JSON.stringify({...call,...patch}))).toThrow();expect(()=>parseDomainInvocation(' '.repeat(65537))).toThrow();
});
it('keeps material edits atomic and does not repair unsupported styles or source schemas',()=>{
 const registry=createElementDomainRegistry();registry.register(centeredPlatePack);const baseline=JSON.stringify(registry.generate(centeredPlatePack.metadata.id,{}));
 const valid={componentId:'plate_body',material:{roughness:.6,metalness:.9,surface:{finish:'bead-blasted-metal',channels:'roughness-only',repeat:[8,8]}}};expect(executeDomainInvocation(registry,JSON.stringify({...call,materials:[valid]})).project.parts[0].material?.surface?.finish).toBe('bead-blasted-metal');
 for(const materials of [[valid,valid],[valid,{componentId:'missing',material:{roughness:.5,metalness:0}}],[{...valid,material:{roughness:.5,metalness:0,surface:{finish:'invented',channels:'roughness-only',repeat:[1,1]}}}]])expect(()=>executeDomainInvocation(registry,JSON.stringify({...call,materials}))).toThrow();expect(JSON.stringify(registry.generate(centeredPlatePack.metadata.id,{}))).toBe(baseline);
});

it('rejects null dimensions and non-record inputs through the direct generator boundary',()=>{expect(()=>generateCenteredPlateProject({widthMm:null})).toThrow();expect(()=>generateCenteredPlateProject(new Date() as unknown as Record<string,unknown>)).toThrow();});

it('uses the same strict seed boundary for direct and registered generation',()=>{const registry=createElementDomainRegistry();registry.register(centeredPlatePack);for(const seed of [null,-1,1.5,Number.MAX_SAFE_INTEGER+1,'42']){expect(()=>generateCenteredPlateProject({seed})).toThrow();expect(()=>registry.generate(centeredPlatePack.metadata.id,{seed})).toThrow();}expect(generateCenteredPlateProject({seed:0}).seed).toBe(0);});
