import * as THREE from 'https://esm.sh/three@0.163.0';
import { PointerLockControls } from 'https://esm.sh/three@0.163.0/examples/jsm/controls/PointerLockControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 20, 120);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 12, 20);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const ambient = new THREE.HemisphereLight(0xffffff, 0x4f7942, 0.8);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 0.85);
sun.position.set(20, 40, 10);
sun.castShadow = true;
scene.add(sun);

const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

const blockGeo = new THREE.BoxGeometry(1, 1, 1);
const grassMat = new THREE.MeshLambertMaterial({ color: 0x57a639 });
const dirtMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
const stoneMat = new THREE.MeshLambertMaterial({ color: 0x7f7f7f });
const highlightMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  wireframe: true,
  transparent: true,
  opacity: 0.45,
});

const world = new Map();
const blocks = [];
const raycaster = new THREE.Raycaster();
const clock = new THREE.Clock();

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;

const playerHeight = 1.7;
const gravity = 30;
const speed = 12;

const selector = new THREE.Mesh(blockGeo, highlightMat);
selector.visible = false;
scene.add(selector);

function key(x, y, z) {
  return `${x},${y},${z}`;
}

function addBlock(x, y, z, material = grassMat) {
  const k = key(x, y, z);
  if (world.has(k)) return;

  const mesh = new THREE.Mesh(blockGeo, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.isBlock = true;
  scene.add(mesh);

  world.set(k, mesh);
  blocks.push(mesh);
}

function removeBlock(mesh) {
  const { x, y, z } = mesh.position;
  const k = key(x, y, z);
  world.delete(k);
  scene.remove(mesh);
  const index = blocks.indexOf(mesh);
  if (index >= 0) blocks.splice(index, 1);
}

function heightAt(x, z) {
  return Math.floor(5 + Math.sin(x * 0.25) * 2 + Math.cos(z * 0.25) * 2 + Math.sin((x + z) * 0.15));
}

function buildWorld() {
  const size = 40;
  for (let x = -size; x <= size; x++) {
    for (let z = -size; z <= size; z++) {
      const h = heightAt(x, z);
      for (let y = 0; y <= h; y++) {
        const material = y === h ? grassMat : y > h - 2 ? dirtMat : stoneMat;
        addBlock(x, y, z, material);
      }
    }
  }
}

buildWorld();

function getIntersections() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  return raycaster.intersectObjects(blocks, false);
}

function updateSelector() {
  const hits = getIntersections();
  if (hits.length === 0 || hits[0].distance > 8) {
    selector.visible = false;
    return;
  }

  selector.visible = true;
  selector.position.copy(hits[0].object.position);
}

function onKeyDown(event) {
  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW':
      moveForward = true;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      moveLeft = true;
      break;
    case 'ArrowDown':
    case 'KeyS':
      moveBackward = true;
      break;
    case 'ArrowRight':
    case 'KeyD':
      moveRight = true;
      break;
    case 'Space':
      if (canJump) {
        velocity.y += 10;
      }
      canJump = false;
      break;
  }
}

function onKeyUp(event) {
  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW':
      moveForward = false;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      moveLeft = false;
      break;
    case 'ArrowDown':
    case 'KeyS':
      moveBackward = false;
      break;
    case 'ArrowRight':
    case 'KeyD':
      moveRight = false;
      break;
  }
}

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

document.body.addEventListener('click', () => {
  controls.lock();
});

document.addEventListener('contextmenu', (event) => event.preventDefault());

document.addEventListener('mousedown', (event) => {
  if (!controls.isLocked) return;

  const hits = getIntersections();
  if (!hits.length || hits[0].distance > 8) return;

  const hit = hits[0];
  if (event.button === 0) {
    removeBlock(hit.object);
    return;
  }

  if (event.button === 2) {
    const p = hit.point.clone().add(hit.face.normal.clone().multiplyScalar(0.5));
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const z = Math.round(p.z);

    if (Math.abs(camera.position.x - x) < 1 && Math.abs(camera.position.y - y) < 2 && Math.abs(camera.position.z - z) < 1) {
      return;
    }

    addBlock(x, y, z, grassMat);
  }
});

function groundCollision(nextPos) {
  const feet = nextPos.clone();
  feet.y -= playerHeight;

  const x = Math.round(feet.x);
  const y = Math.floor(feet.y);
  const z = Math.round(feet.z);

  if (world.has(key(x, y, z))) {
    nextPos.y = y + 1 + playerHeight;
    velocity.y = 0;
    canJump = true;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);

  if (controls.isLocked) {
    velocity.x -= velocity.x * 12 * delta;
    velocity.z -= velocity.z * 12 * delta;
    velocity.y -= gravity * delta;

    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();

    if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

    controls.moveRight(-velocity.x * delta);
    controls.moveForward(-velocity.z * delta);
    camera.position.y += velocity.y * delta;

    groundCollision(camera.position);
    if (camera.position.y < 2) {
      camera.position.y = 8;
      velocity.y = 0;
    }
  }

  updateSelector();
  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
