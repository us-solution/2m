// ── 3D Scene (Three.js) ─────────────────────────
const canvas = document.getElementById('bg-3d-canvas');
const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 20;

// Renderer
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// ── 1. The Main Coffee Cup ──
const cupGroup = new THREE.Group();

// Cup body
const cupGeo = new THREE.CylinderGeometry(2.5, 1.8, 5, 32);
const cupMat = new THREE.MeshPhysicalMaterial({
  color: 0x1A1814,
  metalness: 0.1,
  roughness: 0.2,
  clearcoat: 1.0,
  clearcoatRoughness: 0.1
});
const cup = new THREE.Mesh(cupGeo, cupMat);
cupGroup.add(cup);

// Coffee inside
const coffeeGeo = new THREE.CylinderGeometry(2.35, 2.35, 0.1, 32);
const coffeeMat = new THREE.MeshStandardMaterial({
  color: 0x2A1100,
  roughness: 0.1,
  metalness: 0.1
});
const coffee = new THREE.Mesh(coffeeGeo, coffeeMat);
coffee.position.y = 2.4;
cupGroup.add(coffee);

// Gold Rim
const rimGeo = new THREE.TorusGeometry(2.5, 0.1, 16, 64);
const rimMat = new THREE.MeshStandardMaterial({
  color: 0xC9A84C,
  metalness: 1.0,
  roughness: 0.2
});
const rim = new THREE.Mesh(rimGeo, rimMat);
rim.position.y = 2.5;
rim.rotation.x = Math.PI / 2;
cupGroup.add(rim);

// Cup Handle
const handleGeo = new THREE.TorusGeometry(1.2, 0.3, 16, 32);
const handle = new THREE.Mesh(handleGeo, cupMat);
handle.position.set(2.5, 0, 0);
cupGroup.add(handle);

// Steam Particles
const steamGeo = new THREE.BufferGeometry();
const steamCount = 40;
const posArray = new Float32Array(steamCount * 3);
for(let i=0; i < steamCount * 3; i++) {
  posArray[i] = (Math.random() - 0.5) * 3;
}
steamGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const steamMat = new THREE.PointsMaterial({
  size: 0.4,
  color: 0xffffff,
  transparent: true,
  opacity: 0.3,
  blending: THREE.AdditiveBlending
});
const steamParticles = new THREE.Points(steamGeo, steamMat);
steamParticles.position.y = 3;
cupGroup.add(steamParticles);

// Position Cup for Hero Section
cupGroup.position.set(5, 0, 0); // slightly right
scene.add(cupGroup);

// ── 2. Floating Coffee Beans ──
const beans = [];
const beanGeo = new THREE.SphereGeometry(0.3, 16, 16); // basic bean shape
beanGeo.scale(1, 1.5, 0.8); // stretch to look like bean
const beanMat = new THREE.MeshStandardMaterial({
  color: 0x2b1b11,
  roughness: 0.7,
  metalness: 0.1
});

for (let i = 0; i < 40; i++) {
  const bean = new THREE.Mesh(beanGeo, beanMat);
  bean.position.set(
    (Math.random() - 0.5) * 40,
    (Math.random() - 0.5) * 40,
    (Math.random() - 0.5) * 20 - 10
  );
  bean.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  // random velocities
  bean.userData = {
    rx: (Math.random() - 0.5) * 0.02,
    ry: (Math.random() - 0.5) * 0.02,
    vy: (Math.random() - 0.5) * 0.05
  };
  scene.add(bean);
  beans.push(bean);
}

// ── Lighting ──
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const goldLight = new THREE.PointLight(0xC9A84C, 2, 50);
goldLight.position.set(10, 10, 10);
scene.add(goldLight);

const blueLight = new THREE.PointLight(0x2a4b7c, 1.5, 50);
blueLight.position.set(-10, -10, 10);
scene.add(blueLight);

// ── Animation Loop ──
let time = 0;
let scrollY = 0;
let targetScrollY = 0;

window.addEventListener('scroll', () => {
  targetScrollY = window.scrollY;
});

let mouseX = 0;
let mouseY = 0;
document.addEventListener('mousemove', (e) => {
  mouseX = (e.clientX / window.innerWidth) * 2 - 1;
  mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
});

function animate() {
  requestAnimationFrame(animate);
  time += 0.02;
  
  // Smooth scroll interpolation
  scrollY += (targetScrollY - scrollY) * 0.1;
  
  // Cup animation (rotates and floats)
  cupGroup.rotation.y = time * 0.2 + mouseX * 0.5;
  cupGroup.rotation.x = Math.sin(time * 0.5) * 0.1 - mouseY * 0.2;
  cupGroup.position.y = Math.sin(time) * 0.5 - (scrollY * 0.01); // moves up when scroll down
  
  // Mobile check for cup position
  if(window.innerWidth < 768) {
    cupGroup.position.x = 0;
    cupGroup.scale.set(0.7, 0.7, 0.7);
  } else {
    cupGroup.position.x = 5;
    cupGroup.scale.set(1, 1, 1);
  }

  // Animate steam
  const positions = steamParticles.geometry.attributes.position.array;
  for(let i=1; i < steamCount*3; i+=3) {
    positions[i] += 0.03; // move up
    if(positions[i] > 6) positions[i] = 0; // reset to surface
    positions[i-1] += Math.sin(time * 3 + i) * 0.01; // sway x
  }
  steamParticles.geometry.attributes.position.needsUpdate = true;
  
  // Animate beans
  beans.forEach(bean => {
    bean.rotation.x += bean.userData.rx;
    bean.rotation.y += bean.userData.ry;
    bean.position.y += bean.userData.vy + (scrollY * 0.005); // slightly move with scroll
    
    // Wrap beans around
    if(bean.position.y > 20) bean.position.y = -20;
    if(bean.position.y < -20) bean.position.y = 20;
  });

  // Camera subtle move based on mouse
  camera.position.x += (mouseX * 2 - camera.position.x) * 0.05;
  camera.position.y += (mouseY * 2 - camera.position.y) * 0.05;
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
