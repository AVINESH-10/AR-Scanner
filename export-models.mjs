import fs from 'fs';
import path from 'path';
import { buildHelicopterGlb, buildDroneGlb, buildRobotGlb, buildCarGlb } from './js/procedural-models.js';

const modelsDir = path.resolve('models');
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

function writeGlb(filename, buffer) {
  const filePath = path.join(modelsDir, filename);
  fs.writeFileSync(filePath, Buffer.from(buffer));
  console.log(`Created: ${filePath} (${(buffer.byteLength / 1024).toFixed(1)} KB)`);
}

writeGlb('helicopter.glb', buildHelicopterGlb());
writeGlb('drone.glb', buildDroneGlb());
writeGlb('robot.glb', buildRobotGlb());
writeGlb('car.glb', buildCarGlb());

console.log("All GLB models exported to models/ directory successfully!");
