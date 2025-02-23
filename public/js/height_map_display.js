import * as THREE from "three";
import { io } from 'socket.io-client';
import gsap from "gsap";
import { initScene, setupLighting, setupControls } from './sceneSetup.js';
import { createTerrainMesh, createTerrainGeometry, updateGeometryHeights, loadHeightData } from './terrain.js';

console.log('THREE version:', THREE.REVISION);

// Establish WebSocket connection
const socket = io();

// Log connection status
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

// Configuration
const config = {
    chunkSizes: [10, 20, 50, 100, 200, 500, 750, 1000, 1500],
    chunkSizeIndex: 4,
    chunkPosition: { x: 200.0, y: 200.0 },
    meshPosition: { x: 0, y: 0 , z: 0 },
    scale: { height: 20, plane: 10 },
    mapSize: { width: 10000, height: 10000 },     // to be updated after loading height data
    moveStepScale: 0.25,
    cameraPosition: { x: -5, y: 5, z: 0 }
};

let currentTerrainMesh = null;
let heightData = null;

// Main setup function
function createSingleChunkTerrain(scene, controls) {
    const geometry = createTerrainGeometry(config, 1, 1);

    updateGeometryHeights(geometry, config, heightData);
    const mesh = createTerrainMesh(geometry);
    if (currentTerrainMesh)  scene.remove(currentTerrainMesh);
    scene.add(mesh);
    currentTerrainMesh = mesh;

    controls.update();
}

function updateChunkLocationDisplay() {
    const chunkLocationElement = document.getElementById('chunk-location');
    chunkLocationElement.textContent = `Chunk: (${config.chunkPosition.x.toFixed(2)}, ${config.chunkPosition.y.toFixed(2)})`;
}

function moveChunkPosition(dx, dy = dx) {
    config.chunkPosition.x = THREE.MathUtils.clamp(config.chunkPosition.x + dx, 0, config.mapSize.width);
    config.chunkPosition.y = THREE.MathUtils.clamp(config.chunkPosition.y + dy, 0, config.mapSize.height);    
}

function moveMeshPosition(directionX, directionY = directionX) {
    const meshStepSize = config.scale.plane;
    const meshTargetX = THREE.MathUtils.clamp(config.meshPosition.x + directionY * meshStepSize, -meshStepSize, meshStepSize);
    const meshTargetZ = THREE.MathUtils.clamp(config.meshPosition.z + directionX * meshStepSize, -meshStepSize, meshStepSize);
    // Update the mesh position to target before moving
    config.meshPosition.x = meshTargetX;
    config.meshPosition.z = meshTargetZ;

    gsap.to(currentTerrainMesh.position, {
        duration: 1,
        x: meshTargetX,
        z: meshTargetZ,
        ease: "power4.out",
        onUpdate: () => {
            updateChunkLocationDisplay();
        }
    });
}

function moveChunk(directionX, directionY) {
    // Update the start position and move the terrain mesh
    const stepSize = config.moveStepScale * config.chunkSizes[config.chunkSizeIndex];
    
    moveMeshPosition(directionX, directionY);
    
    // moveChunkPosition(directionX * stepSize, directionY * stepSize);
}

function handleZoom(direction) {
    // Calculate center point of current chunk
    const oldChunkSize = config.chunkSizes[config.chunkSizeIndex];
    
    // Update chunk size index with bounds checking
    config.chunkSizeIndex = THREE.MathUtils.clamp(
        config.chunkSizeIndex + direction,
        0,
        config.chunkSizes.length - 1
    );
    
    // Recenter chunk position with new size
    const newChunkSize = config.chunkSizes[config.chunkSizeIndex];
    moveChunkPosition(  oldChunkSize / 2 - newChunkSize / 2);
    console.log(`Chunk size: ${newChunkSize}`);
}


// Event handlers
function handleWindowResize(camera, renderer) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

function handleMovement(key) {
    const movement = MOVEMENTS[key];
    
    // Handle directional movement
    if (Array.isArray(movement)) {
        moveChunk(...movement);
        return;
    }

    // Handle zoom operations
    else if (movement === 'zoomIn' || movement === 'zoomOut') {
        handleZoom(movement === 'zoomIn' ? -1 : 1);
        updateDisplay();
    }

    // Handle reset operation
    else if (movement === 'reset') {
        config.chunkPosition.x = 200.0;
        config.chunkPosition.y = 200.0;
        config.chunkSizeIndex = 4; // Reset to default chunk size
        updateDisplay();
    }
}

function updateDisplay() {
    createSingleChunkTerrain(scene, controls);
    updateChunkLocationDisplay();
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    controls.update();
}

// Initialize application
const { scene, camera, renderer } = initScene(config);
const controls = setupControls(camera, renderer);
setupLighting(scene);

// Show loading overlay
const loadingOverlay = document.getElementById('loading-overlay');
loadingOverlay.style.display = 'flex';

// Load height data and start application
loadHeightData('data/height_cache_H282.bin').then(({ heightData: data, rows, cols }) => {
    heightData = data;
    config.mapSize.width = rows;
    config.mapSize.height = cols;
    createSingleChunkTerrain(scene, controls);
    updateChunkLocationDisplay();
    // Hide loading overlay
    loadingOverlay.style.display = 'none';
    // Animation loop
    animate();
});

// Event listeners
window.addEventListener('resize', () => handleWindowResize(camera, renderer), false);
// Handle chunk movement with arrow keys and buttons
// Movement directions mapping
const MOVEMENTS = {
    'ArrowUp':    [0,  1],
    'ArrowDown':  [0, -1],
    'ArrowLeft':  [-1, 0],
    'ArrowRight': [ 1, 0],
    'z':          'zoomIn',
    'x':          'zoomOut',
    'w':          [0,  1],
    's':          [0, -1],
    'a':          [-1, 0],
    'd':          [ 1, 0],
    'r':          'reset',
};


// Handle keyboard movement
document.addEventListener('keydown', (event) => {
    handleMovement(event.key);
});

// Handle button movement
const buttonIds = ['up', 'down', 'left', 'right'];
buttonIds.forEach(direction => {
    document.getElementById(`move-${direction}`).addEventListener('click', () => {
        const movement = MOVEMENTS[`Arrow${direction.charAt(0).toUpperCase() + direction.slice(1)}`];
        moveChunk(...movement);
    });
});