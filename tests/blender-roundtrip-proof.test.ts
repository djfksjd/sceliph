import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {auditBlenderRoundTripProof,type BlenderRoundTripExpectation} from '../src/engine/blender-roundtrip-proof';
const expected:BlenderRoundTripExpectation={compilerRevision:'morphloom-compiler/0.40.0',assetId:'laurel-homes-architecture',assemblyFingerprint:'a'.repeat(64),sourceSha256:'b'.repeat(64),finalDeliverySha256:'c'.repeat(64)};
it('blocks the actual historical single report despite its legacy PASS flags',()=>{
 const report=JSON.parse(readFileSync('tests/fixtures/blender-roundtrip-legacy.json','utf8'));
 expect(auditBlenderRoundTripProof(report,expected).length).toBeGreaterThan(0);
});
it('blocks omitted imported/reopened counts that the legacy undefined equality accepted',()=>{
 const report=JSON.parse(readFileSync('tests/fixtures/blender-roundtrip-legacy.json','utf8'));delete report.imported;delete report.reopened;
 expect(auditBlenderRoundTripProof(report,expected).length).toBeGreaterThan(0);
});
const valid=()=>({assemblyFingerprintRepresentation:'source-json/0.1',schema:'morphloom.blender-roundtrip/0.3',compilerRevision:expected.compilerRevision,assetId:expected.assetId,assemblyFingerprint:expected.assemblyFingerprint,sourceSha256:expected.sourceSha256,roundTripSha256:'d'.repeat(64),finalDeliverySha256:expected.finalDeliverySha256,sourceBytes:100,roundTripBytes:100,finalDeliveryBytes:100,pass:true,geometryParity:true,imageParity:true,skinningParity:true,blenderVersion:'5.2.1 LTS',boundsErrorMm:0,boundsToleranceMm:.1,imported:{meshes:1,polygons:12,materials:1},reopened:{meshes:1,polygons:12,materials:1},roundTripStandardValidation:{status:'pass',khronosErrors:0,khronosWarnings:0,independentReadStatus:'pass',validatedSha256:expected.finalDeliverySha256}});
it('accepts only the explicitly versioned current source and final-delivery binding',()=>{expect(auditBlenderRoundTripProof(valid(),expected)).toEqual([])});
it('blocks compiler, asset, source, final file and IR substitutions',()=>{
 for(const key of ['compilerRevision','assetId','assemblyFingerprint','sourceSha256','finalDeliverySha256'] as const){const report=valid();report[key]='e'.repeat(64);expect(auditBlenderRoundTripProof(report,expected).length).toBeGreaterThan(0)}
 expect(auditBlenderRoundTripProof(valid(),{...expected,sourceSha256:''}).length).toBeGreaterThan(0);
});
it('blocks wrong validated bytes, independent parser failures and count tampering',()=>{
 for(const edit of [(r:ReturnType<typeof valid>)=>{r.roundTripStandardValidation.validatedSha256='e'.repeat(64)},(r:ReturnType<typeof valid>)=>{r.roundTripStandardValidation.independentReadStatus='blocked'},(r:ReturnType<typeof valid>)=>{r.reopened.polygons++},(r:ReturnType<typeof valid>)=>{r.geometryParity=false},(r:ReturnType<typeof valid>)=>{r.roundTripStandardValidation.khronosWarnings=1}]){const report=valid();edit(report);expect(auditBlenderRoundTripProof(report,expected).length).toBeGreaterThan(0)}
});
it('rejects nonfinite, negative, string, missing and relaxed tolerance inputs',()=>{
 for(const boundsErrorMm of [undefined,'0',NaN,Infinity,-.001,.10001])expect(auditBlenderRoundTripProof({...valid(),boundsErrorMm},expected).length).toBeGreaterThan(0);
 expect(auditBlenderRoundTripProof({...valid(),boundsToleranceMm:.5},expected).length).toBeGreaterThan(0);
 for(const value of [null,[],{},'pass'])expect(auditBlenderRoundTripProof(value,expected).length).toBeGreaterThan(0);
});
