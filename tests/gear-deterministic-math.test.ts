import {afterEach,expect,it,vi} from 'vitest';
import * as m from '../src/engine/gear-deterministic-math';
afterEach(()=>vi.restoreAllMocks());
it('bounded trig agrees with independent native diagnostic over 8193 points',()=>{
 let atan=0,atan2=0,acos=0,sin=0,cos=0,tan=0;
 for(let i=0;i<=8192;i++){const t=-10+20*i/8192,x=-1+2*i/8192,a=-2*Math.PI+4*Math.PI*i/8192;
 atan=Math.max(atan,Math.abs(m.atan(t)-Math.atan(t)));acos=Math.max(acos,Math.abs(m.acos(x)-Math.acos(x)));sin=Math.max(sin,Math.abs(m.sin(a)-Math.sin(a)));cos=Math.max(cos,Math.abs(m.cos(a)-Math.cos(a)));
 const pressure=.34+.1*i/8192;tan=Math.max(tan,Math.abs(m.tan(pressure)-Math.tan(pressure)));atan2=Math.max(atan2,Math.abs(m.atan2(Math.sin(a),Math.cos(a))-Math.atan2(Math.sin(a),Math.cos(a))));}
 expect(atan).toBeLessThan(1e-14);expect(atan2).toBeLessThan(1e-14);expect(acos).toBeLessThan(1e-14);expect(sin).toBeLessThan(1e-13);expect(cos).toBeLessThan(1e-13);expect(tan).toBeLessThan(1e-13);
});
it('handles poles, signed zeros and invalid bounded input explicitly',()=>{
 expect(m.atan(Infinity)).toBe(Math.PI/2);expect(m.atan(-Infinity)).toBe(-Math.PI/2);expect(Object.is(m.atan(-0),-0)).toBe(true);
 for(const [y,x] of [[0,0],[-0,0],[0,-0],[-0,-0],[1,0],[-1,0],[0,-1],[-0,-1]])expect(Object.is(m.atan2(y,x),Math.atan2(y,x))).toBe(true);
 expect(m.acos(1)).toBe(0);expect(m.acos(-1)).toBe(Math.PI);expect(()=>m.atan(NaN)).toThrow();expect(()=>m.acos(1.1)).toThrow();expect(()=>m.sin(2*Math.PI+.001)).toThrow();expect(()=>m.hypot(10001)).toThrow();expect(()=>m.atan2(Infinity,1)).toThrow();
});
it('computes without native transcendental calls or mutating coordinate input',()=>{
 for(const key of ['sin','cos','tan','atan','atan2','acos','hypot'] as const)vi.spyOn(Math,key).mockImplementation(()=>{throw Error('native transcendental used');});
 expect(Number.isFinite(m.atan2(.4,.8))).toBe(true);expect(Number.isFinite(m.acos(.9))).toBe(true);expect(Number.isFinite(m.tan(.4))).toBe(true);const xy=[3,4];expect(m.hypot(...xy)).toBe(5);expect(xy).toEqual([3,4]);
});
