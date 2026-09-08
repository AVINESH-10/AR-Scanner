/**
 * Procedural 3D GLB Model Definitions
 * Uses GlbBuilder to construct rich, detailed 3D models with PBR materials.
 */

import { GlbBuilder } from './glb-builder.js';

export function buildHelicopterGlb() {
  const b = new GlbBuilder();
  const matBody = b.addMaterial("BodyBlue", [0.12, 0.23, 0.54, 1.0], 0.25, 0.8);
  const matGlass = b.addMaterial("CockpitGlass", [0.22, 0.74, 0.97, 0.9], 0.1, 0.9);
  const matDark = b.addMaterial("DarkMetal", [0.08, 0.12, 0.2, 1.0], 0.2, 0.9);
  const matRotor = b.addMaterial("RotorBlade", [0.01, 0.52, 0.78, 1.0], 0.3, 0.7);
  const matFin = b.addMaterial("TailFinRed", [0.93, 0.27, 0.27, 1.0], 0.3, 0.4);
  const matSkid = b.addMaterial("SkidMetal", [0.3, 0.35, 0.45, 1.0], 0.4, 0.8);

  // Fuselage Body
  b.addBox([0, 0.55, 0], [1.6, 0.7, 0.8], matBody);
  // Cockpit Nose / Glass
  b.addBox([0.7, 0.6, 0], [0.6, 0.5, 0.7], matGlass);
  // Engine Housing
  b.addBox([-0.1, 0.95, 0], [0.9, 0.25, 0.5], matDark);
  // Rotor Mast
  b.addCylinder([0, 1.15, 0], 0.05, 0.3, 12, matDark, 'Y');
  // Main Rotor Blades (Cross)
  b.addBox([0, 1.3, 0], [2.6, 0.02, 0.14], matRotor);
  b.addBox([0, 1.3, 0], [0.14, 0.02, 2.6], matRotor);

  // Tail Boom
  b.addBox([-1.4, 0.62, 0], [1.4, 0.25, 0.25], matBody);
  // Tail Fin (Vertical)
  b.addBox([-2.0, 0.9, 0], [0.3, 0.55, 0.04], matFin);
  // Tail Rotor
  b.addBox([-2.05, 0.9, 0.06], [0.02, 0.55, 0.06], matDark);

  // Landing Skids
  b.addCylinder([0, 0.08, 0.45], 0.03, 1.5, 12, matSkid, 'X');
  b.addCylinder([0, 0.08, -0.45], 0.03, 1.5, 12, matSkid, 'X');
  // Skid Struts
  b.addBox([0.35, 0.3, 0.38], [0.05, 0.45, 0.05], matSkid);
  b.addBox([0.35, 0.3, -0.38], [0.05, 0.45, 0.05], matSkid);
  b.addBox([-0.35, 0.3, 0.38], [0.05, 0.45, 0.05], matSkid);
  b.addBox([-0.35, 0.3, -0.38], [0.05, 0.45, 0.05], matSkid);

  return b.buildGlbArrayBuffer();
}

export function buildDroneGlb() {
  const b = new GlbBuilder();
  const matBody = b.addMaterial("CarbonBody", [0.06, 0.09, 0.16, 1.0], 0.2, 0.9);
  const matDome = b.addMaterial("CyanDome", [0.02, 0.71, 0.83, 1.0], 0.2, 0.6, [0.03, 0.57, 0.7]);
  const matArm = b.addMaterial("CarbonArm", [0.12, 0.16, 0.23, 1.0], 0.3, 0.8);
  const matMotor = b.addMaterial("MotorSilver", [0.4, 0.45, 0.55, 1.0], 0.2, 0.9);
  const matProp = b.addMaterial("PropCyan", [0.22, 0.74, 0.97, 1.0], 0.3, 0.7);
  const matGimbal = b.addMaterial("GimbalCam", [0.01, 0.52, 0.78, 1.0], 0.2, 0.8);
  const matLens = b.addMaterial("DarkLens", [0.02, 0.02, 0.05, 1.0], 0.1, 0.95);

  // Central Body Pod
  b.addBox([0, 0.25, 0], [0.65, 0.18, 0.65], matBody);
  // Glowing Top Dome
  b.addBox([0, 0.36, 0], [0.4, 0.08, 0.4], matDome);

  // 4 Diagonal Arms + Motors + Propellers
  const armCoords = [
    [0.55, 0.24, 0.55],
    [-0.55, 0.24, 0.55],
    [0.55, 0.24, -0.55],
    [-0.55, 0.24, -0.55]
  ];

  armCoords.forEach(([ax, ay, az]) => {
    // Arm
    b.addBox([ax / 2, ay, az / 2], [0.45, 0.04, 0.45], matArm);
    // Motor
    b.addCylinder([ax, ay + 0.04, az], 0.09, 0.1, 12, matMotor, 'Y');
    // Propeller
    b.addBox([ax, ay + 0.1, az], [0.75, 0.015, 0.08], matProp);
    b.addBox([ax, ay + 0.1, az], [0.08, 0.015, 0.75], matProp);
  });

  // Gimbal Camera underneath
  b.addBox([0, 0.1, 0.1], [0.2, 0.16, 0.2], matGimbal);
  b.addCylinder([0, 0.08, 0.22], 0.06, 0.08, 12, matLens, 'Z');

  // 4 Landing Feet
  const legCoords = [[0.2, 0.08, 0.2], [-0.2, 0.08, 0.2], [0.2, 0.08, -0.2], [-0.2, 0.08, -0.2]];
  legCoords.forEach(([lx, ly, lz]) => {
    b.addBox([lx, ly, lz], [0.04, 0.22, 0.04], matArm);
  });

  return b.buildGlbArrayBuffer();
}

export function buildRobotGlb() {
  const b = new GlbBuilder();
  const matArmor = b.addMaterial("ArmorSlate", [0.2, 0.25, 0.35, 1.0], 0.3, 0.8);
  const matJoint = b.addMaterial("JointDark", [0.06, 0.09, 0.16, 1.0], 0.2, 0.9);
  const matVisor = b.addMaterial("VisorCyan", [0.22, 0.74, 0.97, 1.0], 0.1, 0.5, [0.01, 0.52, 0.78]);
  const matGold = b.addMaterial("GoldAccent", [0.96, 0.62, 0.04, 1.0], 0.2, 0.9);

  // Pelvis
  b.addBox([0, 0.65, 0], [0.45, 0.18, 0.28], matJoint);
  // Torso / Chest Armor
  b.addBox([0, 1.05, 0], [0.55, 0.55, 0.35], matArmor);
  // Chest Arc Reactor Core
  b.addBox([0, 1.1, 0.18], [0.18, 0.18, 0.05], matVisor);

  // Neck
  b.addCylinder([0, 1.38, 0], 0.08, 0.12, 12, matJoint, 'Y');
  // Head
  b.addBox([0, 1.55, 0], [0.32, 0.3, 0.32], matArmor);
  // Glowing Visor Eye
  b.addBox([0, 1.56, 0.16], [0.24, 0.08, 0.04], matVisor);

  // Shoulders & Arms
  [-1, 1].forEach((side) => {
    // Shoulder pauldron
    b.addBox([side * 0.38, 1.25, 0], [0.2, 0.18, 0.26], matGold);
    // Bicep
    b.addBox([side * 0.38, 1.05, 0], [0.12, 0.26, 0.14], matJoint);
    // Forearm
    b.addBox([side * 0.38, 0.78, 0.05], [0.14, 0.32, 0.16], matArmor);

    // Thigh
    b.addBox([side * 0.16, 0.42, 0], [0.15, 0.36, 0.16], matJoint);
    // Shin
    b.addBox([side * 0.16, 0.16, 0], [0.16, 0.38, 0.18], matArmor);
    // Foot
    b.addBox([side * 0.16, -0.04, 0.06], [0.18, 0.09, 0.32], matGold);
  });

  return b.buildGlbArrayBuffer();
}

export function buildCarGlb() {
  const b = new GlbBuilder();
  const matBody = b.addMaterial("IndigoBody", [0.39, 0.4, 0.95, 1.0], 0.15, 0.9);
  const matCarbon = b.addMaterial("CarbonRoof", [0.06, 0.09, 0.16, 1.0], 0.3, 0.8);
  const matWheel = b.addMaterial("TireRubber", [0.12, 0.16, 0.23, 1.0], 0.8, 0.3);
  const matRim = b.addMaterial("CyanRim", [0.22, 0.74, 0.97, 1.0], 0.1, 0.9);
  const matHeadlight = b.addMaterial("Headlight", [0.22, 0.74, 0.97, 1.0], 0.1, 0.5, [0.22, 0.74, 0.97]);
  const matTaillight = b.addMaterial("Taillight", [0.93, 0.27, 0.27, 1.0], 0.1, 0.5, [0.93, 0.27, 0.27]);

  // Chassis Main Body
  b.addBox([0, 0.28, 0], [1.1, 0.24, 2.3], matBody);
  // Hood Slant
  b.addBox([0, 0.25, 0.85], [1.05, 0.18, 0.6], matBody);
  // Cockpit Canopy
  b.addBox([0, 0.48, -0.1], [0.85, 0.24, 1.1], matCarbon);
  // Rear Wing
  b.addBox([0, 0.6, -1.0], [1.2, 0.04, 0.22], matCarbon);

  // Headlights
  b.addBox([-0.38, 0.28, 1.15], [0.2, 0.05, 0.04], matHeadlight);
  b.addBox([0.38, 0.28, 1.15], [0.2, 0.05, 0.04], matHeadlight);
  // Taillight bar
  b.addBox([0, 0.3, -1.15], [1.0, 0.05, 0.04], matTaillight);

  // 4 Wheels + Rims
  const wheels = [
    [-0.58, 0.22, 0.7],
    [0.58, 0.22, 0.7],
    [-0.58, 0.22, -0.7],
    [0.58, 0.22, -0.7]
  ];

  wheels.forEach(([wx, wy, wz]) => {
    b.addCylinder([wx, wy, wz], 0.22, 0.16, 16, matWheel, 'X');
    b.addCylinder([wx + (wx > 0 ? 0.02 : -0.02), wy, wz], 0.13, 0.17, 12, matRim, 'X');
  });

  return b.buildGlbArrayBuffer();
}

/**
 * Get Model ArrayBuffer by ID
 */
export function getModelBuffer(modelId) {
  switch (modelId) {
    case 'drone':
      return buildDroneGlb();
    case 'robot':
      return buildRobotGlb();
    case 'car':
      return buildCarGlb();
    case 'helicopter':
    default:
      return buildHelicopterGlb();
  }
}

/**
 * Get Model Object URL (Blob URL) by ID for direct loading into Three.js GLTFLoader
 */
export function getModelBlobUrl(modelId) {
  const buffer = getModelBuffer(modelId);
  const blob = new Blob([buffer], { type: 'model/gltf-binary' });
  return URL.createObjectURL(blob);
}
