import test from 'node:test';
import assert from 'node:assert/strict';
import { clipPolygon, clipWeilerAthertonSimple, insideEvenOdd, parseRings, polygonArea, rectangleRing } from '../src/polygons.js';
import { rect } from '../src/geometry.js';
const clip = rectangleRing(rect(-5, -5, 5, 5));
const P = (pairs) => pairs.map(([x, y]) => ({ x, y }));
function area(rings) { return Math.abs(rings.reduce((sum, ring) => sum + polygonArea(ring), 0)); }
function close(actual, expected, tol = 1e-4) { assert.ok(Math.abs(actual - expected) < tol, `${actual} != ${expected}`); }

test('inside polygon', () => {
  assert.equal(area(clipPolygon([P([[-2,-2],[2,-2],[2,2],[-2,2]])], clip)), 16);
});
test('outside polygon', () => {
  assert.equal(clipPolygon([P([[9,9],[10,9],[10,10],[9,10]])], clip).length, 0);
});
test('containing window', () => {
  const result = clipPolygon([P([[-12,-12],[12,-12],[12,12],[-12,12]])], clip);
  close(area(result), 100);
});
test('concave U polygon gives two disjoint pieces', () => {
  const u = P([[-8,-8],[-2,-8],[-2,7],[2,7],[2,-8],[8,-8],[8,9],[-8,9]]);
  const result = clipPolygon([u], clip);
  assert.equal(result.length, 2);
  close(area(result), 60);
});
test('diamond crosses all corners of window edges', () => {
  const result = clipPolygon([P([[0,-9],[9,0],[0,9],[-9,0]])], clip);
  close(area(result), 98);
});
test('hole is retained as separate loop', () => {
  const outer = P([[-10,-10],[10,-10],[10,10],[-10,10]]);
  const hole = P([[-2,-2],[2,-2],[2,2],[-2,2]]);
  const result = clipPolygon([outer, hole], clip);
  close(area(result), 84);
  assert.equal(result.length, 2);
  assert.ok(result.some((ring) => polygonArea(ring) < 0));
});
test('bow-tie self intersection resolves even-odd area', () => {
  const bowtie = P([[-4,-4],[4,4],[-4,4],[4,-4]]);
  const result = clipPolygon([bowtie], clip);
  close(area(result), 32);
  assert.equal(result.length, 2);
});
test('shared edge preserves polygon', () => {
  close(area(clipPolygon([P([[-5,-5],[5,-5],[5,5],[-5,5]])], clip)), 100);
});
test('touching at corner produces empty area', () => {
  assert.equal(clipPolygon([P([[5,5],[7,5],[7,7],[5,7]])], clip).length, 0);
});
test('parse multiple rings', () => {
  const rings = parseRings('-8 -8\n8 -8\n8 8\n-8 8\n\n-2 -2\n2 -2\n2 2\n-2 2');
  assert.equal(rings.length, 2);
  assert.equal(insideEvenOdd({x:0,y:0}, rings), false);
  assert.equal(insideEvenOdd({x:4,y:0}, rings), true);
});

test('Weiler-Atherton linked lists clip a crossing rectangle', () => {
  const subject = P([[-8,-2],[8,-2],[8,2],[-8,2]]);
  const result = clipWeilerAthertonSimple(subject, clip);
  assert.notEqual(result, null);
  close(area(result), 40);
  assert.equal(result[0].length, 4);
});
test('Weiler-Atherton linked lists handle two separate regions', () => {
  const subject = P([[-8,-8],[-2,-8],[-2,7],[2,7],[2,-8],[8,-8],[8,9],[-8,9]]);
  const result = clipWeilerAthertonSimple(subject, clip);
  assert.equal(result?.length, 2);
  close(area(result), 60);
});
test('Weiler-Atherton accepts clockwise subject orientation', () => {
  const subject = P([[-8,-2],[8,-2],[8,2],[-8,2]]).reverse();
  const result = clipWeilerAthertonSimple(subject, clip);
  close(area(result), 40);
});
test('polygon crossing exact clipping-window corners', () => {
  const shape = P([[-5,-5],[8,-8],[8,8],[-5,5]]);
  const result = clipPolygon([shape], clip);
  close(area(result), 100);
});
test('hole opened by right clipping boundary becomes an indentation', () => {
  const outside = P([[-12,-12],[12,-12],[12,12],[-12,12]]);
  const hole = P([[3,-2],[7,-2],[7,2],[3,2]]);
  const result = clipPolygon([outside, hole], clip);
  close(area(result), 92);
  assert.equal(result.filter((ring) => polygonArea(ring) > 0).length, 1);
  assert.equal(result.filter((ring) => polygonArea(ring) < 0).length, 0);
});
