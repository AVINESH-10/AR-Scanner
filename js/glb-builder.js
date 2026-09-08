/**
 * Pure JavaScript GLB (glTF 2.0 Binary) Generator
 * Constructs standards-compliant .glb binary files containing 3D meshes, PBR materials,
 * vertex positions, normals, and indices without external dependencies.
 */

export class GlbBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.indices = [];
    this.meshes = [];
    this.materials = [];
    this.nodes = [];
  }

  addMaterial(name, baseColor = [0.2, 0.5, 0.9, 1.0], roughness = 0.3, metallic = 0.7, emissive = [0, 0, 0]) {
    const matIndex = this.materials.length;
    this.materials.push({
      name,
      pbrMetallicRoughness: {
        baseColorFactor: baseColor,
        roughnessFactor: roughness,
        metallicFactor: metallic
      },
      emissiveFactor: emissive,
      doubleSided: true
    });
    return matIndex;
  }

  addBox(center, size, matIndex) {
    const [cx, cy, cz] = center;
    const [sx, sy, sz] = size;
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;

    const baseIndex = this.positions.length / 3;

    // 6 faces * 4 vertices = 24 vertices
    const rawVerts = [
      // Front face (+Z)
      cx - hx, cy - hy, cz + hz, 0, 0, 1,
      cx + hx, cy - hy, cz + hz, 0, 0, 1,
      cx + hx, cy + hy, cz + hz, 0, 0, 1,
      cx - hx, cy + hy, cz + hz, 0, 0, 1,
      // Back face (-Z)
      cx + hx, cy - hy, cz - hz, 0, 0, -1,
      cx - hx, cy - hy, cz - hz, 0, 0, -1,
      cx - hx, cy + hy, cz - hz, 0, 0, -1,
      cx + hx, cy + hy, cz - hz, 0, 0, -1,
      // Top face (+Y)
      cx - hx, cy + hy, cz + hz, 0, 1, 0,
      cx + hx, cy + hy, cz + hz, 0, 1, 0,
      cx + hx, cy + hy, cz - hz, 0, 1, 0,
      cx - hx, cy + hy, cz - hz, 0, 1, 0,
      // Bottom face (-Y)
      cx - hx, cy - hy, cz - hz, 0, -1, 0,
      cx + hx, cy - hy, cz - hz, 0, -1, 0,
      cx + hx, cy - hy, cz + hz, 0, -1, 0,
      cx - hx, cy - hy, cz + hz, 0, -1, 0,
      // Right face (+X)
      cx + hx, cy - hy, cz + hz, 1, 0, 0,
      cx + hx, cy - hy, cz - hz, 1, 0, 0,
      cx + hx, cy + hy, cz - hz, 1, 0, 0,
      cx + hx, cy + hy, cz + hz, 1, 0, 0,
      // Left face (-X)
      cx - hx, cy - hy, cz - hz, -1, 0, 0,
      cx - hx, cy - hy, cz + hz, -1, 0, 0,
      cx - hx, cy + hy, cz + hz, -1, 0, 0,
      cx - hx, cy + hy, cz - hz, -1, 0, 0
    ];

    for (let i = 0; i < rawVerts.length; i += 6) {
      this.positions.push(rawVerts[i], rawVerts[i + 1], rawVerts[i + 2]);
      this.normals.push(rawVerts[i + 3], rawVerts[i + 4], rawVerts[i + 5]);
    }

    const faceIndices = [];
    for (let f = 0; f < 6; f++) {
      const o = baseIndex + f * 4;
      faceIndices.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }

    const indexStart = this.indices.length;
    this.indices.push(...faceIndices);

    this.meshes.push({
      material: matIndex,
      indexStart,
      indexCount: faceIndices.length
    });
  }

  addCylinder(center, radius, height, segments = 12, matIndex, axis = 'Y') {
    const [cx, cy, cz] = center;
    const baseIndex = this.positions.length / 3;
    const halfH = height / 2;

    const angleStep = (Math.PI * 2) / segments;

    for (let i = 0; i <= segments; i++) {
      const angle = i * angleStep;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      let px1, py1, pz1, px2, py2, pz2, nx, ny, nz;
      if (axis === 'Y') {
        px1 = cx + cos * radius; py1 = cy - halfH; pz1 = cz + sin * radius;
        px2 = cx + cos * radius; py2 = cy + halfH; pz2 = cz + sin * radius;
        nx = cos; ny = 0; nz = sin;
      } else if (axis === 'X') {
        px1 = cx - halfH; py1 = cy + cos * radius; pz1 = cz + sin * radius;
        px2 = cx + halfH; py2 = cy + cos * radius; pz2 = cz + sin * radius;
        nx = 0; ny = cos; nz = sin;
      } else {
        px1 = cx + cos * radius; py1 = cy + sin * radius; pz1 = cz - halfH;
        px2 = cx + cos * radius; py2 = cy + sin * radius; pz2 = cz + halfH;
        nx = cos; ny = sin; nz = 0;
      }

      this.positions.push(px1, py1, pz1, px2, py2, pz2);
      this.normals.push(nx, ny, nz, nx, ny, nz);
    }

    const cylinderIndices = [];
    for (let i = 0; i < segments; i++) {
      const p1 = baseIndex + i * 2;
      const p2 = p1 + 1;
      const p3 = p1 + 2;
      const p4 = p1 + 3;
      cylinderIndices.push(p1, p3, p2, p2, p3, p4);
    }

    const indexStart = this.indices.length;
    this.indices.push(...cylinderIndices);

    this.meshes.push({
      material: matIndex,
      indexStart,
      indexCount: cylinderIndices.length
    });
  }

  buildGlbArrayBuffer() {
    // 1. Pack Binary Buffer (Indices: uint16, Positions: float32, Normals: float32)
    const indexBytes = new Uint16Array(this.indices).buffer;
    const posBytes = new Float32Array(this.positions).buffer;
    const normBytes = new Float32Array(this.normals).buffer;

    const pad4 = (len) => (len % 4 === 0 ? 0 : 4 - (len % 4));

    const indexPadding = pad4(indexBytes.byteLength);
    const posPadding = pad4(posBytes.byteLength);
    const normPadding = pad4(normBytes.byteLength);

    const totalBinLength = indexBytes.byteLength + indexPadding +
                           posBytes.byteLength + posPadding +
                           normBytes.byteLength + normPadding;

    const binBuffer = new Uint8Array(totalBinLength);
    let offset = 0;

    const indexOffset = offset;
    binBuffer.set(new Uint8Array(indexBytes), offset);
    offset += indexBytes.byteLength + indexPadding;

    const posOffset = offset;
    binBuffer.set(new Uint8Array(posBytes), offset);
    offset += posBytes.byteLength + posPadding;

    const normOffset = offset;
    binBuffer.set(new Uint8Array(normBytes), offset);
    offset += normBytes.byteLength + normPadding;

    // Calculate bounding box
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.positions.length; i += 3) {
      minX = Math.min(minX, this.positions[i]);
      minY = Math.min(minY, this.positions[i + 1]);
      minZ = Math.min(minZ, this.positions[i + 2]);
      maxX = Math.max(maxX, this.positions[i]);
      maxY = Math.max(maxY, this.positions[i + 1]);
      maxZ = Math.max(maxZ, this.positions[i + 2]);
    }

    // 2. Build glTF JSON metadata
    const bufferViews = [
      { buffer: 0, byteOffset: indexOffset, byteLength: indexBytes.byteLength, target: 34963 }, // ELEMENT_ARRAY_BUFFER
      { buffer: 0, byteOffset: posOffset, byteLength: posBytes.byteLength, byteStride: 12, target: 34962 }, // ARRAY_BUFFER
      { buffer: 0, byteOffset: normOffset, byteLength: normBytes.byteLength, byteStride: 12, target: 34962 }
    ];

    const accessors = [
      // 0: Position
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: this.positions.length / 3,
        type: "VEC3",
        max: [maxX, maxY, maxZ],
        min: [minX, minY, minZ]
      },
      // 1: Normal
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: 5126,
        count: this.normals.length / 3,
        type: "VEC3",
        max: [1, 1, 1],
        min: [-1, -1, -1]
      }
    ];

    // Primitive accessors for sub-mesh indices
    const primitives = this.meshes.map((m) => {
      const accIndex = accessors.length;
      accessors.push({
        bufferView: 0,
        byteOffset: m.indexStart * 2,
        componentType: 5123, // UNSIGNED_SHORT
        count: m.indexCount,
        type: "SCALAR",
        max: [this.positions.length / 3 - 1],
        min: [0]
      });

      return {
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: accIndex,
        material: m.material
      };
    });

    const gltf = {
      asset: { version: "2.0", generator: "CustomWebAR-GlbBuilder" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, name: "Root" }],
      meshes: [{ primitives, name: "ModelGeometry" }],
      materials: this.materials,
      accessors,
      bufferViews,
      buffers: [{ byteLength: totalBinLength }]
    };

    const jsonString = JSON.stringify(gltf);
    const jsonBytes = new TextEncoder().encode(jsonString);
    const jsonPadding = pad4(jsonBytes.byteLength);
    const totalJsonLength = jsonBytes.byteLength + jsonPadding;

    // Total GLB Header (12) + Chunk 0 Header (8) + JSON + Chunk 1 Header (8) + BIN
    const totalGlbLength = 12 + 8 + totalJsonLength + 8 + totalBinLength;
    const glbBuffer = new ArrayBuffer(totalGlbLength);
    const view = new DataView(glbBuffer);
    const outBytes = new Uint8Array(glbBuffer);

    // GLB Header
    view.setUint32(0, 0x46546C67, true); // "glTF"
    view.setUint32(4, 2, true);          // Version 2
    view.setUint32(8, totalGlbLength, true);

    // Chunk 0 (JSON)
    let glbOffset = 12;
    view.setUint32(glbOffset, totalJsonLength, true);
    view.setUint32(glbOffset + 4, 0x4E4F534A, true); // "JSON"
    glbOffset += 8;
    outBytes.set(jsonBytes, glbOffset);
    // Fill JSON padding with space (0x20)
    for (let p = 0; p < jsonPadding; p++) {
      outBytes[glbOffset + jsonBytes.byteLength + p] = 0x20;
    }
    glbOffset += totalJsonLength;

    // Chunk 1 (BIN)
    view.setUint32(glbOffset, totalBinLength, true);
    view.setUint32(glbOffset + 4, 0x004E4942, true); // "BIN\0"
    glbOffset += 8;
    outBytes.set(binBuffer, glbOffset);

    return glbBuffer;
  }
}
