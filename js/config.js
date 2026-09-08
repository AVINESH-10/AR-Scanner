/**
 * Custom WebAR Configuration & Model Catalogue
 * Provides configuration constants, default models, camera settings, and tracking tuning.
 */

export const AR_CONFIG = {
  // Physical marker size in arbitrary 3D units (equivalent to ~10cm)
  markerSize: 1.0,

  // Camera field of view assumption (degrees) for pose estimation
  cameraFov: 50.0,

  // High precision camera constraints
  camera: {
    idealWidth: 1920,
    idealHeight: 1080,
    minWidth: 1280,
    minHeight: 720,
    frameRate: 60
  },

  // High-performance CV and Tracking configuration (optimized for mobile camera detection)
  cv: {
    targetMinDimension: 480, // Optimal resolution for sub-pixel QR detection on mobile cameras
    trackingLostTimeoutMs: 750 // 750ms smooth hysteresis: holds through hand shakes/blurs without flickering
  },

  // Pose filter tuning (Optimized One-Euro Filter for rock-solid stability and zero-lag response)
  filter: {
    minCutoff: 0.70,   // Stable stationary pose (eliminates micro-jitter and hand shaking)
    beta: 0.20,        // Instantaneous dynamic response (zero lag when moving phone)
    dCutoff: 1.0       // Derivative cutoff for filtering velocity noise
  },

  // Tracking state decay timeout (ms) before marking as lost
  trackingLostTimeoutMs: 750,

  // Maximum allowed file upload size in MB (0 - 50 MB range)
  maxUploadSizeMb: 50,

  // Default hosted Base URL
  hostedBaseUrl: "https://avinesh-10.github.io/AR-Scanner/ar.html",

  // Default AR transformation offsets
  defaults: {
    scale: 1.0,
    height: 0.15,      // Height above QR code plane (Y-offset)
    offsetX: 0.0,
    offsetZ: 0.0,
    rotationX: 0.0,
    rotationY: 0.0,
    rotationZ: 0.0,
    autoRotate: false,
    autoRotateSpeed: 0.05
  },

  // Pre-configured built-in 3D models catalogue
  models: {
    helicopter: {
      name: "Tactical Helicopter",
      category: "Aviation",
      isProcedural: true,
      scale: 0.75,
      height: 0.12,
      offsetX: 0.0,
      offsetZ: 0.0,
      rotationY: 0,
      autoRotate: false,
      description: "Twin-rotor military transport helicopter with animated rotors and realistic PBR shading."
    },
    drone: {
      name: "Quadcopter Drone",
      category: "Robotics",
      isProcedural: true,
      scale: 0.85,
      height: 0.18,
      offsetX: 0.0,
      offsetZ: 0.0,
      rotationY: 0,
      autoRotate: false,
      description: "High-tech surveillance drone equipped with navigation LEDs and dual-blade propellers."
    },
    robot: {
      name: "Cyber Sentinel Robot",
      category: "Sci-Fi",
      isProcedural: true,
      scale: 0.65,
      height: 0.05,
      offsetX: 0.0,
      offsetZ: 0.0,
      rotationY: 0,
      autoRotate: false,
      description: "Futuristic humanoid android featuring metallic armor and glowing neon visor."
    },
    car: {
      name: "Hyper Cybercar",
      category: "Vehicles",
      isProcedural: true,
      scale: 0.70,
      height: 0.08,
      offsetX: 0.0,
      offsetZ: 0.0,
      rotationY: -Math.PI / 4,
      autoRotate: false,
      description: "Aerodynamic concept electric supercar with detailed wheel rims and aerodynamic diffuser."
    },
    taj_mahal: {
      name: "Taj Mahal",
      category: "Architecture",
      file: "models/taj_mahal.glb",
      scale: 0.80,
      height: 0.02,
      offsetX: 0.0,
      offsetZ: 0.0,
      rotationY: 0,
      autoRotate: false,
      description: "Detailed 3D architectural model of the world-famous Taj Mahal monument."
    },
    eiffel_tower: {
      name: "Eiffel Tower",
      category: "Landmarks",
      file: "models/eiffel_tower.glb",
      scale: 0.90,
      height: 0.02,
      offsetX: 0.0,
      offsetZ: 0.0,
      rotationY: 0,
      autoRotate: false,
      description: "High-fidelity architectural replica of Paris's iconic Eiffel Tower."
    },
    spider: {
      name: "3D Spider Creature",
      category: "Creatures",
      file: "models/spider.glb",
      scale: 0.60,
      height: 0.05,
      offsetX: 0.0,
      offsetZ: 0.0,
      rotationY: 0,
      autoRotate: false,
      description: "Realistic articulated 3D spider model with PBR texture maps."
    },
    the_amazing_spiderman: {
      name: "The Amazing Spider-Man",
      category: "Characters",
      file: "models/the_amazing_spiderman.glb",
      scale: 0.75,
      height: 0.05,
      offsetX: 0.0,
      offsetZ: 0.0,
      rotationY: 0,
      autoRotate: false,
      description: "Detailed heroic character model featuring stylized textures and pose."
    },
    earth: {
      name: "Earth Globe",
      category: "Astronomy",
      file: "models/earth.glb",
      scale: 0.80,
      height: 0.15,
      offsetX: 0.0,
      offsetZ: 0.0,
      rotationY: 0,
      autoRotate: true,
      description: "Photorealistic planet Earth globe with continents, oceans, and atmospheric glow."
    },
    tower_house_design: {
      name: "Modern Tower House",
      category: "Architecture",
      file: "models/tower_house_design.glb",
      scale: 0.75,
      height: 0.02,
      offsetX: 0.0,
      offsetZ: 0.0,
      rotationY: 0,
      autoRotate: false,
      description: "Architectural modern tower house design with realistic exterior facade."
    },
    animated_butterfly: {
      name: "Animated Butterfly",
      category: "Creatures",
      file: "models/animated_butterfly.glb",
      scale: 0.70,
      height: 0.10,
      offsetX: 0.0,
      offsetZ: 0.0,
      rotationY: 0,
      autoRotate: false,
      description: "Graceful animated 3D butterfly with flapping wings and detailed textures."
    },
    blue_butterfly: {
      name: "Blue Butterfly",
      category: "Nature",
      file: "models/blue_butterfly.glb",
      scale: 0.70,
      height: 0.10,
      offsetX: 0.0,
      offsetZ: 0.0,
      rotationY: 0,
      autoRotate: false,
      description: "Vibrant blue butterfly model with realistic iridescent wings."
    },
    spooky_skeleton_dance_2: {
      name: "Spooky Skeleton Dance",
      category: "Animations",
      file: "models/spooky_skeleton_dance_2.glb",
      scale: 0.70,
      height: 0.05,
      offsetX: 0.0,
      offsetZ: 0.0,
      rotationY: 0,
      autoRotate: false,
      description: "Animated dancing skeleton character with dynamic bone movements."
    }
  },

  // Color theme
  theme: {
    primary: "#38bdf8",
    accent: "#818cf8",
    success: "#34d399",
    warning: "#fbbf24",
    danger: "#f87171",
    bgDark: "#0b0f19"
  }
};
