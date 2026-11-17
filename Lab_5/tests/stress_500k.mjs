import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { rect, equivalentSegments } from '../src/geometry.js';
import { makeDataset, DATA_BOUNDS } from '../src/dataset.js';
import { Quadtree } from '../src/quadtree.js';
import { scanSegments, compareAlgorithms } from '../src/analysis.js';
const n=500000;
const started=performance.now();
for (const density of [1, 8]) {
  const data=makeDataset(n,density,4461);
  const tree = new Quadtree(data,DATA_BOUNDS,{maxDepth:8});
  for(const window of [rect(-10,-8,10,8),rect(-100,-100,100,100),rect(200,200,230,230)]){
    for (const options of [{}, {motionTime:345678.9,motionAmplitude:3}]) {
      const plain=scanSegments(data,window,'cohen',{ ...options,maxVisible:0 });
      const indexed=scanSegments(data,window,'cohen',{ ...options,tree,maxVisible:0 });
      assert.equal(indexed.visible,plain.visible,JSON.stringify({density,window,options,indexed:indexed.visible,plain:plain.visible}));
      const compare=compareAlgorithms(data,window,options);
      assert.equal(compare.mismatch,0,JSON.stringify({density,window,options,mismatch:compare.mismatch}));
      console.log(`Density=${density} window=${window.xmin}..${window.xmax} motion=${options.motionAmplitude||0} visible=${indexed.visible} candidates=${indexed.scanned}`);
    }
  }
}
console.log(`Stress test PASS: ${n} segments, float64, static and independent motion; ${Math.round(performance.now()-started)} ms`);
