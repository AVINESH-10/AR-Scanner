import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';

// Ensure models directory exists
const modelsDir = path.resolve('models');
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

const exporter = new GLTFExporter();

function saveGlb(scene, filename) {
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (glb) => {
        const buffer = Buffer.from(glb);
        const filePath = path.join(modelsDir, filename);
        fs.writeFileSync(filePath, buffer);
        console.log(`Generated GLB: ${filePath} (${(buffer.length / 1024).toFixed(1)} KB)`);
        resolve();
      },
      (error) => {
        console.error(`Error generating ${filename}:`, error);
        reject(error);
      },
      { binary: true }
    );
  });
}

// 1. HELICOPTER GLB GENERATOR
function createHelicopter() {
  const root = new THREE.Group();
  root.name = 'Helicopter';

  // Fuselage (Body)
  const bodyGeo = new THREE.CylinderGeometry(0.35, 0.45, 1.8, 16);
  bodyGeo.rotateZ(Math.PI / 2);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a8a, // Deep military blue
    metalness: 0.8,
    roughness: 0.25
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 0.6, 0);
  root.add(body);

  // Cockpit Glass Canopy
  const glassGeo = new THREE.SphereGeometry(0.38, 16, 16);
  glassGeo.scale(1.4, 0.9, 0.9);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    metalness: 0.9,
    roughness: 0.1,
    transparent: true,
    opacity: 0.85
  });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.set(0.65, 0.65, 0);
  root.add(glass);

  // Turbine Engine Housing
  const engineGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.9, 12);
  engineGeo.rotateZ(Math.PI / 2);
  const engineMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.85,
    roughness: 0.3
  });
  const engine = new THREE.Mesh(engineGeo, engineMat);
  engine.position.set(0, 0.95, 0);
  root.add(engine);

  // Main Rotor Shaft
  const shaftGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8);
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });
  const shaft = new THREE.Mesh(shaftGeo, darkMetalMat);
  shaft.position.set(0, 1.15, 0);
  root.add(shaft);

  // Main Rotor Hub & Blades
  const rotorHubGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12);
  const rotorHub = new THREE.Mesh(rotorHubGeo, darkMetalMat);
  rotorHub.position.set(0, 1.3, 0);
  root.add(rotorHub);

  // 4 Rotor Blades
  const bladeGeo = new THREE.BoxGeometry(2.4, 0.015, 0.12);
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    metalness: 0.7,
    roughness: 0.3
  });
  const blade1 = new THREE.Mesh(bladeGeo, bladeMat);
  blade1.position.set(0, 1.32, 0);
  root.add(blade1);

  const blade2 = new THREE.Mesh(bladeGeo, bladeMat);
  blade2.position.set(0, 1.32, 0);
  blade2.rotation.y = Math.PI / 2;
  root.add(blade2);

  // Tail Boom
  const tailBoomGeo = new THREE.ConeGeometry(0.2, 1.6, 12);
  tailBoomGeo.rotateZ(-Math.PI / 2);
  const tailBoom = new THREE.Mesh(tailBoomGeo, bodyMat);
  tailBoom.position.set(-1.4, 0.68, 0);
  root.add(tailBoom);

  // Tail Fin (Vertical Stabilizer)
  const finGeo = new THREE.BoxGeometry(0.35, 0.6, 0.04);
  const finMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.5, roughness: 0.3 });
  const fin = new THREE.Mesh(finGeo, finMat);
  fin.position.set(-2.1, 0.95, 0);
  root.add(fin);

  // Tail Rotor
  const tailRotorGeo = new THREE.BoxGeometry(0.01, 0.6, 0.06);
  const tailRotor = new THREE.Mesh(tailRotorGeo, darkMetalMat);
  tailRotor.position.set(-2.15, 0.95, 0.06);
  root.add(tailRotor);

  // Landing Skids (Left & Right)
  const skidMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.3 });
  const skidGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.6, 8);
  skidGeo.rotateZ(Math.PI / 2);

  const skidL = new THREE.Mesh(skidGeo, skidMat);
  skidL.position.set(0, 0.08, 0.45);
  root.add(skidL);

  const skidR = new THREE.Mesh(skidGeo, skidMat);
  skidR.position.set(0, 0.08, -0.45);
  root.add(skidR);

  // Skid Struts
  const strutGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8);
  strutGeo.rotateZ(-0.25);

  const strutFL = new THREE.Mesh(strutGeo, skidMat);
  strutFL.position.set(0.35, 0.35, 0.35);
  strutFL.rotation.x = -0.3;
  root.add(strutFL);

  const strutFR = new THREE.Mesh(strutGeo, skidMat);
  strutFR.position.set(0.35, 0.35, -0.35);
  strutFR.rotation.x = 0.3;
  root.add(strutFR);

  const strutBL = new THREE.Mesh(strutGeo, skidMat);
  strutBL.position.set(-0.35, 0.35, 0.35);
  strutBL.rotation.x = -0.3;
  root.add(strutBL);

  const strutBR = new THREE.Mesh(strutGeo, skidMat);
  strutBR.position.set(-0.35, 0.35, -0.35);
  strutBR.rotation.x = 0.3;
  root.add(strutBR);

  return root;
}

// 2. DRONE GLB GENERATOR
function createDrone() {
  const root = new THREE.Group();
  root.name = 'Drone';

  // Central Body Pod
  const bodyGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.18, 16);
  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.9,
    roughness: 0.2
  });
  const body = new THREE.Mesh(bodyGeo, carbonMat);
  body.position.set(0, 0.25, 0);
  root.add(body);

  // Top Dome with Glowing Ring
  const domeGeo = new THREE.SphereGeometry(0.28, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const cyanMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    metalness: 0.6,
    roughness: 0.2,
    emissive: 0x0891b2,
    emissiveIntensity: 0.4
  });
  const dome = new THREE.Mesh(domeGeo, cyanMat);
  dome.position.set(0, 0.34, 0);
  root.add(dome);

  // 4 Diagonal Carbon Arms
  const armMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });
  const propMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.7, roughness: 0.3 });
  const motorMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.9, roughness: 0.2 });
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 0.8 });

  const armLength = 0.9;
  const angles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];

  angles.forEach((angle) => {
    const armGeo = new THREE.BoxGeometry(armLength, 0.04, 0.08);
    const arm = new THREE.Mesh(armGeo, armMat);
    const dist = 0.55;
    arm.position.set(Math.cos(angle) * dist, 0.24, Math.sin(angle) * dist);
    arm.rotation.y = -angle;
    root.add(arm);

    // Motor Pod at Arm Tip
    const motorGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.12, 12);
    const motor = new THREE.Mesh(motorGeo, motorMat);
    const tipX = Math.cos(angle) * 0.95;
    const tipZ = Math.sin(angle) * 0.95;
    motor.position.set(tipX, 0.27, tipZ);
    root.add(motor);

    // Propeller Blade
    const propGeo = new THREE.BoxGeometry(0.7, 0.01, 0.07);
    const prop = new THREE.Mesh(propGeo, propMat);
    prop.position.set(tipX, 0.34, tipZ);
    prop.rotation.y = angle * 2;
    root.add(prop);

    // Status LED
    const ledGeo = new THREE.SphereGeometry(0.03, 8, 8);
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(tipX, 0.2, tipZ);
    root.add(led);
  });

  // Gimbal Camera Pod underneath
  const gimbalGeo = new THREE.SphereGeometry(0.12, 16, 16);
  const gimbalMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.2 });
  const gimbal = new THREE.Mesh(gimbalGeo, gimbalMat);
  gimbal.position.set(0, 0.1, 0.15);
  root.add(gimbal);

  const lensGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.08, 12);
  lensGeo.rotateX(Math.PI / 2);
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.95, roughness: 0.1 });
  const lens = new THREE.Mesh(lensGeo, lensMat);
  lens.position.set(0, 0.08, 0.25);
  root.add(lens);

  // Landing Legs
  const legMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.4 });
  const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8);
  [-0.3, 0.3].forEach((lx) => {
    [-0.3, 0.3].forEach((lz) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, 0.1, lz);
      root.add(leg);
    });
  });

  return root;
}

// 3. ROBOT GLB GENERATOR
function createRobot() {
  const root = new THREE.Group();
  root.name = 'CyberRobot';

  const armorMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
  const jointMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.9,
    metalness: 0.5,
    roughness: 0.1
  });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.2 });

  // Pelvis
  const pelvisGeo = new THREE.BoxGeometry(0.4, 0.2, 0.25);
  const pelvis = new THREE.Mesh(pelvisGeo, jointMat);
  pelvis.position.set(0, 0.7, 0);
  root.add(pelvis);

  // Torso / Chest Armor
  const chestGeo = new THREE.BoxGeometry(0.55, 0.6, 0.35);
  const chest = new THREE.Mesh(chestGeo, armorMat);
  chest.position.set(0, 1.1, 0);
  root.add(chest);

  // Core Arc Reactor
  const coreGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 16);
  coreGeo.rotateX(Math.PI / 2);
  const core = new THREE.Mesh(coreGeo, visorMat);
  core.position.set(0, 1.15, 0.18);
  root.add(core);

  // Neck
  const neckGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.12, 12);
  const neck = new THREE.Mesh(neckGeo, jointMat);
  neck.position.set(0, 1.45, 0);
  root.add(neck);

  // Head
  const headGeo = new THREE.BoxGeometry(0.3, 0.32, 0.3);
  const head = new THREE.Mesh(headGeo, armorMat);
  head.position.set(0, 1.62, 0);
  root.add(head);

  // Glowing Visor
  const visorGeo = new THREE.BoxGeometry(0.24, 0.08, 0.08);
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0, 1.63, 0.15);
  root.add(visor);

  // Shoulder Pauldrons & Arms
  [-1, 1].forEach((side) => {
    const pauldronGeo = new THREE.BoxGeometry(0.22, 0.2, 0.28);
    const pauldron = new THREE.Mesh(pauldronGeo, goldMat);
    pauldron.position.set(side * 0.4, 1.32, 0);
    root.add(pauldron);

    const bicepGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.35, 12);
    const bicep = new THREE.Mesh(bicepGeo, jointMat);
    bicep.position.set(side * 0.4, 1.1, 0);
    root.add(bicep);

    const forearmGeo = new THREE.BoxGeometry(0.14, 0.38, 0.16);
    const forearm = new THREE.Mesh(forearmGeo, armorMat);
    forearm.position.set(side * 0.4, 0.78, 0.05);
    root.add(forearm);

    // Legs: Thigh, Knee, Shin, Foot
    const thighGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.45, 12);
    const thigh = new THREE.Mesh(thighGeo, jointMat);
    thigh.position.set(side * 0.16, 0.45, 0);
    root.add(thigh);

    const shinGeo = new THREE.BoxGeometry(0.16, 0.45, 0.18);
    const shin = new THREE.Mesh(shinGeo, armorMat);
    shin.position.set(side * 0.16, 0.18, 0);
    root.add(shin);

    const footGeo = new THREE.BoxGeometry(0.18, 0.1, 0.3);
    const foot = new THREE.Mesh(footGeo, goldMat);
    foot.position.set(side * 0.16, -0.05, 0.05);
    root.add(foot);
  });

  return root;
}

// 4. CYBERCAR GLB GENERATOR
function createCar() {
  const root = new THREE.Group();
  root.name = 'Cybercar';

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6366f1, metalness: 0.9, roughness: 0.15 });
  const carbonMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.3 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.3, roughness: 0.8 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.9, roughness: 0.1 });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 1.0 });
  const tailLightMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.0 });

  // Chassis Body
  const chassisGeo = new THREE.BoxGeometry(1.2, 0.3, 2.4);
  const chassis = new THREE.Mesh(chassisGeo, bodyMat);
  chassis.position.set(0, 0.3, 0);
  root.add(chassis);

  // Aerodynamic Cockpit Canopy
  const canopyGeo = new THREE.BoxGeometry(0.9, 0.28, 1.2);
  const canopy = new THREE.Mesh(canopyGeo, carbonMat);
  canopy.position.set(0, 0.52, -0.1);
  root.add(canopy);

  // Front Hood Slant
  const hoodGeo = new THREE.BoxGeometry(1.1, 0.15, 0.8);
  const hood = new THREE.Mesh(hoodGeo, bodyMat);
  hood.position.set(0, 0.28, 0.8);
  hood.rotation.x = 0.2;
  root.add(hood);

  // Headlights
  const headLightGeo = new THREE.BoxGeometry(0.25, 0.05, 0.05);
  [-0.4, 0.4].forEach((hx) => {
    const hl = new THREE.Mesh(headLightGeo, lightMat);
    hl.position.set(hx, 0.32, 1.21);
    root.add(hl);
  });

  // Rear Tail Light Bar
  const tailBarGeo = new THREE.BoxGeometry(1.1, 0.06, 0.04);
  const tailBar = new THREE.Mesh(tailBarGeo, tailLightMat);
  tailBar.position.set(0, 0.35, -1.21);
  root.add(tailBar);

  // Rear Wing
  const wingGeo = new THREE.BoxGeometry(1.3, 0.04, 0.25);
  const wing = new THREE.Mesh(wingGeo, carbonMat);
  wing.position.set(0, 0.65, -1.05);
  root.add(wing);

  // 4 Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.18, 20);
  wheelGeo.rotateZ(Math.PI / 2);

  const rimGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.19, 12);
  rimGeo.rotateZ(Math.PI / 2);

  const wheelPositions = [
    [-0.62, 0.24, 0.75],
    [0.62, 0.24, 0.75],
    [-0.62, 0.24, -0.75],
    [0.62, 0.24, -0.75]
  ];

  wheelPositions.forEach(([wx, wy, wz]) => {
    const tire = new THREE.Mesh(wheelGeo, wheelMat);
    tire.position.set(wx, wy, wz);
    root.add(tire);

    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.set(wx, wy, wz);
    root.add(rim);
  });

  return root;
}

// Generate all models
async function run() {
  console.log("Generating 3D GLB models...");
  await saveGlb(createHelicopter(), 'helicopter.glb');
  await saveGlb(createDrone(), 'drone.glb');
  await saveGlb(createRobot(), 'robot.glb');
  await saveGlb(createCar(), 'car.glb');
  console.log("All 3D GLB models generated successfully!");
}

run().catch(console.error);
