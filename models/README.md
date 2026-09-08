# 3D Models Directory (`models/`)

This directory stores `.glb` and `.gltf` 3D model files (supports files from **0 – 50 MB**) for the WebAR application.

## 🏛️ Included 3D Model Assets
- `taj_mahal.glb` (11.6 MB) - Architectural model of the Taj Mahal
- `eiffel_tower.glb` (17.4 MB) - Architectural model of the Eiffel Tower
- `tower_house_design.glb` (18.0 MB) - Modern architectural building
- `spider.glb` (3.0 MB) - Articulated 3D spider model
- `the_amazing_spiderman.glb` (0.8 MB) - 3D character asset
- `earth.glb` (0.6 MB) - Planet Earth globe
- `animated_butterfly.glb` - Animated 3D butterfly with flapping wings
- `blue_butterfly.glb` - Realistic blue butterfly model
- `spooky_skeleton_dance_2.glb` - Animated dancing skeleton character

## 📦 How to Add New 3D Models (0 – 50 MB)

1. Place your `.glb` or `.gltf` file directly inside this `models/` directory:
   ```text
   models/
   ├── taj_mahal.glb
   ├── eiffel_tower.glb
   ├── your-custom-model.glb
   ```

2. Register your model in `js/config.js` under `AR_CONFIG.models`.

3. Push the files to your GitHub repository:
   ```bash
   git add models/
   git commit -m "Add new 3D model"
   git push origin main
   ```

4. In the AR Generator Studio (`generator.html`), you can now load your model, configure spatial offsets, and generate the physical AR tracking QR marker!
