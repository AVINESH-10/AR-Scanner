# Custom WebAR QR-Code 3D AR System — No Unity

A production-quality, browser-based **WebAR application** that allows users to upload/select 3D `.glb` models, preview and configure spatial parameters, generate high-contrast dual-purpose AR QR markers, scan them with any mobile smartphone camera, and view the 3D model **spatially anchored directly above the physical QR code** in full 6 Degrees of Freedom (6DOF).

> **Strict Web Standards**: Built with HTML5, CSS3, JavaScript (ES6+), Three.js, WebGL, and WebRTC. **Zero Unity. Zero Native App Installs.**

---

## 🚀 Key Features

- **Dual-Purpose QR Code**: The QR code encodes the experience URL (e.g. `ar.html?id=helicopter`) and simultaneously serves as the physical computer-vision tracking marker.
- **Physical 6DOF Pose Estimation**: Calculates real-time 3D camera-relative position $(X, Y, Z)$ and orientation $(\text{Roll}, \text{Pitch}, \text{Yaw})$ so you can walk around the physical marker in 360° to view the model from front, sides, top, and back.
- **One-Euro (1€) Jitter Filter**: Eliminates hand jitter while preserving zero-latency response during rapid camera movement.
- **Three.js PBR Pipeline**: ACES Filmic tone mapping, ambient hemisphere & directional key/fill lights, and shadow maps to ensure models render with vibrant fidelity.
- **Built-in 3D Assets**: Pre-loaded with procedural binary GLB models (Tactical Helicopter, Quadcopter Drone, Cyber Sentinel Robot, Hyper Cybercar).
- **Studio Configurator**: Real-time 3D OrbitControls preview, scale/height/offset tuning, custom `.glb` upload, and high-resolution printable QR generator.
- **Dark Glassmorphism HUD**: Responsive status indicators (`SEARCHING`, `QR DETECTED`, `TRACKING`, `QR LOST`), scale stepper, auto-rotation toggle, and fullscreen mode.
- **Zero-Build Deployment**: Works out of the box on GitHub Pages or any static HTTPS host.

---

## 📂 Project Structure

```text
custom-webar/
├── index.html                 # Modern landing page showcasing features & demo launchers
├── generator.html             # AR experience studio & QR code generator with 3D preview
├── ar.html                    # Fullscreen mobile-optimized AR camera tracking & 3D view
│
├── css/
│   ├── style.css              # Global dark futuristic theme & glassmorphic layout
│   ├── generator.css          # Creator/generator studio styling & range sliders
│   └── ar.css                 # Clean AR HUD overlay, tracking status pills & drawer
│
├── js/
│   ├── config.js              # AR config schema, model catalogue & default parameters
│   ├── tracker.js             # 6DOF Coplanar PnP / Homography pose solver & 1€ filter
│   ├── model-loader.js        # Three.js GLTFLoader manager with PBR lighting & animations
│   ├── generator.js           # 3D preview viewport, GLB upload handling, QR generator
│   ├── ar.js                  # AR camera loop, marker tracking pipeline & spatial anchor
│   ├── procedural-models.js   # Procedural GLB binary models (helicopter, drone, robot, car)
│   ├── glb-builder.js         # Pure JS glTF 2.0 binary builder
│   └── main.js                # Landing page interactivity & quick launch modal
│
├── package.json               # Node & Vite configuration
└── README.md                  # Complete documentation
```

---

## 🛠️ Installation & Local Development

### 1. Prerequisites
- Node.js (v18+) or any local static web server (e.g., Python `http.server`, VS Code Live Server).

### 2. Clone & Install Dependencies
```bash
# Navigate to project directory
cd "d:/project/AR final"

# Install dev dependencies (optional, for local Vite dev server)
npm install
```

### 3. Run Development Server
```bash
# Start local server with Vite
npm run dev
```

### 4. Testing Camera on Mobile via Local Network (HTTPS)
Camera access (`navigator.mediaDevices.getUserMedia`) requires a **secure context (HTTPS)** or `localhost`.

To test on a physical smartphone on your local Wi-Fi:
1. Run Vite with basic SSL or use [ngrok](https://ngrok.com/):
   ```bash
   npx ngrok http 5173
   ```
2. Open the generated `https://xxxx.ngrok-free.app` URL on your phone.

---

## 🌐 Live Production Deployment (GitHub Pages)

Your WebAR application is hosted live at:
```text
https://nithish-cmd-afk.github.io/AR-overview/
```

- **Landing Page**: `https://nithish-cmd-afk.github.io/AR-overview/`
- **AR Generator Studio**: `https://nithish-cmd-afk.github.io/AR-overview/generator.html`
- **AR Camera Viewer**: `https://nithish-cmd-afk.github.io/AR-overview/ar.html?id=helicopter`

---

## 📦 How to Add Custom 3D Models

### Step 1: Add your `.glb` file
Place your binary GLB file in the `models/` folder:
```text
models/my-spacecraft.glb
```

### Step 2: Register in `js/config.js`
Open `js/config.js` and add an entry under `AR_CONFIG.models`:
```javascript
spacecraft: {
  name: "Interstellar Spacecraft",
  category: "Sci-Fi",
  file: "models/my-spacecraft.glb",
  scale: 0.8,
  height: 0.20,
  offsetX: 0.0,
  offsetZ: 0.0,
  rotationY: 0,
  autoRotate: false,
  description: "Deep space explorer vessel."
}
```

### Step 3: Use in Generator / AR
- In the generator, select your model or navigate directly to `ar.html?id=spacecraft`.

---

## 🖨️ Physical QR Marker Printing & Setup Guide

For optimal 6DOF tracking performance:

1. Open `generator.html`, select your 3D model, and click **Download PNG**.
2. **Print Size**:
   - **Recommended**: $10\text{ cm} \times 10\text{ cm}$ (or $15\text{ cm} \times 15\text{ cm}$).
   - Larger printed markers provide higher tracking distance and stability.
3. **Physical Surface**:
   - Place the printed QR code on a flat table or floor.
   - Avoid glossy surfaces with strong glare or reflections.
   - Ensure even ambient lighting.

---

## 📱 How to Experience AR on Mobile

1. Open your phone's native Camera app or QR scanner.
2. Scan the printed QR code → Tap the URL prompt to open the webpage.
3. Tap **Allow Camera** when prompted by Safari / Chrome.
4. Point the camera at the physical QR code on your table.
5. The 3D model appears anchored directly on top of the QR code!
6. Move around the table to view the model from **front, left, back, and top**.

---

## 🔬 How the 6DOF QR Marker Tracking Works

```text
[ Physical QR Code ] ──> [ Mobile Camera (getUserMedia) ]
                                 │
                         (30-60 FPS Frame)
                                 │
                         [ jsQR Corner Finder ]
                         Top-Left, Top-Right,
                         Bottom-Right, Bottom-Left
                                 │
                   [ Perspective Camera Matrix K ]
                     fy = (H/2) / tan(FOV_y/2)
                     fx = fy,  cx = W/2, cy = H/2
                                 │
                 [ Coplanar Homography Decomposition ]
                   H = K · [ r1  r2  t ]
                   λ = 2 / (||K⁻¹ h1|| + ||K⁻¹ h2||)
                   r1 = λ K⁻¹ h1,  r2 = λ K⁻¹ h2
                   r3 = r1 × r2,   t = λ K⁻¹ h3
                                 │
                 [ SVD / Polar Orthonormalization ]
                   Guarantees pure SO(3) Rotation
                                 │
                 [ One-Euro (1€) Adaptive Filter ]
                   Stationary: Heavy low-pass cutoff (no jitter)
                   Moving: High dynamic cutoff (zero lag)
                                 │
               [ Three.js markerGroup Matrix Transform ]
               Position: (X, Y, Z)  Rotation: Quaternion
                                 │
                  [ 3D GLB Model Spatially Anchored ]
```

---

## 💡 Troubleshooting & FAQ

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **Camera won't open / Black screen** | Non-HTTPS connection or permissions blocked | Ensure site is running via `https://` or `localhost`. Check browser site settings to allow camera. |
| **Model appears upside down / tilted** | Marker plane orientation mismatch | The tracker includes automatic normal re-orientation (`-Math.PI / 2` around X) so standing models point upwards towards the ceiling. |
| **Jitter when holding phone still** | Optical sensor noise | The built-in One-Euro filter automatically suppresses high-frequency corner noise. |
| **Model looks dark/black** | Missing PBR lighting or tone mapping | The built-in `ModelLoader` configures ACES Filmic tone mapping and a 3-point hemisphere + directional light rig. |

---

## 📜 License

MIT License © 2026 Custom WebAR Project.
