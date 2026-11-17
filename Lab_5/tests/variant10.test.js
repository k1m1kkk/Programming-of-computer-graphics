import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EPS, rect, clipCohen, clipLiang, clipCyrusBeck, convexOrientation,
  equivalentSegments, parseSegments, serializeSegments
} from '../src/geometry.js';
import { clipPolygon, polygonArea, rectangleRing } from '../src/polygons.js';
import { seededRandom, makeDataset, DATA_BOUNDS } from '../src/dataset.js';
import { Quadtree } from '../src/quadtree.js';
import { scanSegments } from '../src/analysis.js';

const window = rect(-5, -5, 5, 5);
const square = rectangleRing(window);
const points = (list) => list.map(([x, y]) => ({x, y}));
const area = (rings) => rings.reduce((sum, ring) => sum + polygonArea(ring), 0);

test('variant 10 Cyrus-Beck agrees with rectangular parametric clipping', () => {
  const rand = seededRandom(971);
  for (let i = 0; i < 30000; i++) {
    const line = Array.from({length:4}, () => (rand() - 0.5) * 32);
    const c = clipCyrusBeck(...line, square);
    const l = clipLiang(...line, window);
    assert.ok(equivalentSegments(c,l,2e-6), `Mismatch at case ${i}: ${JSON.stringify({line,c,l})}`);
  }
});

test('variant 10 polygon is handled with either orientation', () => {
  const diamond = points([[0,-5],[5,0],[0,5],[-5,0]]);
  assert.equal(convexOrientation(diamond),1);
  assert.equal(convexOrientation([...diamond].reverse()),-1);
  for (const ring of [diamond, [...diamond].reverse()]) {
    assert.ok(equivalentSegments(clipCyrusBeck(-10,0,10,0,ring),[-5-EPS,0,5+EPS,0]));
    assert.equal(clipCyrusBeck(7,7,9,9,ring),null);
    assert.ok(equivalentSegments(clipCyrusBeck(0,5,0,5,ring),[0,5,0,5]));
    assert.equal(clipCyrusBeck(0,6,0,6,ring),null);
  }
});

test('Cyrus-Beck correctly handles triangle, parallel, tangent and vertex intersection', () => {
  const triangle = points([[-5,-5],[5,-5],[0,5]]);
  assert.ok(equivalentSegments(clipCyrusBeck(-10,-5,10,-5,triangle),[-5-EPS,-5,5+EPS,-5]));
  assert.ok(equivalentSegments(clipCyrusBeck(0,-10,0,10,triangle),[0,-5-EPS,0,5+EPS]));
  assert.equal(clipCyrusBeck(-10,6,10,6,triangle),null);
  assert.ok(equivalentSegments(clipCyrusBeck(-10,5,0,5,triangle),[0,5,0,5],3e-6));
});

test('Cyrus-Beck rejects concave and self-intersecting clippers', () => {
  assert.throws(() => convexOrientation(points([[0,0],[5,0],[2,2],[5,5],[0,5]])));
  assert.throws(() => convexOrientation(points([[0,0],[5,5],[0,5],[5,0]])));
  assert.throws(() => convexOrientation(points([[0,0],[1,0],[0,0]])));
});

test('near-boundary adversarial cases agree, including formerly failing sample', () => {
  const cases = [
    [5.00000005,0,5.000001,-5],
    [5 + EPS * 1.5,0,5 + EPS * .7,0],
    [-5-EPS/2,-5-EPS/2,-5-3*EPS,-5-3*EPS],
    [-5-EPS*2,-5-EPS*2,5+EPS*2,5+EPS*2],
  ];
  for (const item of cases) assert.ok(equivalentSegments(clipCohen(...item,window),clipLiang(...item,window),2e-6));
  const rnd = seededRandom(802013);
  for(let i=0;i<50000;i++) {
    const s1 = rnd()>.5 ? 1 : -1, s2 = rnd()>.5 ? 1 : -1;
    const item=[s1*5+(rnd()-.5)*3e-6,(rnd()-.5)*12,s2*5+(rnd()-.5)*3e-6,(rnd()-.5)*12];
    const a=clipCohen(...item,window),b=clipLiang(...item,window);
    assert.ok(equivalentSegments(a,b,2e-6),`Mismatch ${i}: ${JSON.stringify({item,a,b})}`);
  }
});

test('thin polygon retains positive area well above EPS threshold', () => {
  for (const width of [1e-4,1e-5,1e-6,5e-7]) {
    const ring=points([[0,-3],[width,-3],[width,3],[0,3]]);
    const result=clipPolygon([ring],square);
    assert.equal(result.length,1,`Missing contour for width=${width}`);
    assert.ok(Math.abs(area(result)-6*width)<1e-10,`Wrong area for width=${width}`);
  }
});

test('holes, exact corners, disjoint components and self-crossing remain supported', () => {
  const outer=points([[-9,-9],[9,-9],[9,9],[-9,9]]);
  const hole=points([[-1,-1],[1,-1],[1,1],[-1,1]]);
  assert.ok(Math.abs(area(clipPolygon([outer,hole],square))-96)<1e-5);
  const bowtie=points([[-4,-4],[4,4],[-4,4],[4,-4]]);
  assert.equal(clipPolygon([bowtie],square).length,2);
  const u=points([[-8,-8],[-2,-8],[-2,7],[2,7],[2,-8],[8,-8],[8,9],[-8,9]]);
  assert.equal(clipPolygon([u],square).length,2);
});

test('text file roundtrip retains 1e-7 scale coordinates', () => {
  const lines=[[1e-7,-7.345678901,5+5e-8,9.0000001]];
  const result=parseSegments(serializeSegments(lines,window));
  assert.deepEqual(result.segments,lines);
});

test('all segments rendered in stress scan, not an artificial 12000 limit', () => {
  const data = new Float64Array(14000*4);
  for (let i = 0; i < 14000; i++) {
    const j = i*4;
    data[j] = -1; data[j+1]=i*1e-5; data[j+2]=1; data[j+3]=i*1e-5;
  }
  const full=scanSegments(data,window,'cohen',{renderMargin:10});
  assert.equal(full.visible,14000);
  assert.equal(full.stored,14000);
  assert.equal(full.output.length,14000*4);
});

test('quadtree preserves exact output for 64-bit data in many window positions', () => {
  const data=makeDataset(25000,1,336);
  assert.ok(data instanceof Float64Array);
  const tree = new Quadtree(data,DATA_BOUNDS,{maxDepth:8});
  for(let i=0;i<8;i++) {
    const r=rect(-220+i*55,-24, -190+i*55,24);
    assert.equal(scanSegments(data,r,'cohen',{tree,maxVisible:0}).visible,
      scanSegments(data,r,'cohen',{maxVisible:0}).visible);
  }
});
