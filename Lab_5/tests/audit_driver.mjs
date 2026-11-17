import {readFileSync} from 'node:fs';
import {clipPolygon, polygonArea, rectangleRing} from '../src/polygons.js';
import {rect} from '../src/geometry.js';
const batch = JSON.parse(readFileSync(0, 'utf8'));
const window = rectangleRing(rect(-5,-5,5,5));
const output = batch.map((rings) => {
  try {
    const poly = rings.map(r => r.map(([x,y]) => ({x,y})));
    const result = clipPolygon(poly, window);
    return {area: result.reduce((sum, ring) => sum+polygonArea(ring),0), rings: result.map((r) => r.map(({x,y})=>[x,y]))};
  } catch (error) {return {error: String(error)}}
});
process.stdout.write(JSON.stringify(output));
