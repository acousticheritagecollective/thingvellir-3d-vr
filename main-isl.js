// IMPORTS GENERALES
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// LETS GENERALES
let xrSessionStartTime = 0;
let camera, scene, renderer, controls;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let terrain, listener;
let soundMeterBus;
let analyser;
let meterData;
let lastStepPos = new THREE.Vector3();
let birds1, birds2;
let balloonSource, balloonSound;
let speakerSource; // Modelo 3D del speaker
let riverSound, riverSource;
let modelSound, modelSource;
let balloonAudioPlayed = false;
let balloonInfoShown = false;
let speakerInfoShown = false;
let bookInfoShown = false; // ← NUEVA
let raycaster = new THREE.Raycaster();
let infoVisible = false;
let infoTextDiv;
let subtitleDiv;
let isXR = false;
let xrRig;

// Sistema de puntos narrativos
const pointPositions = [
  { id: 1, position: new THREE.Vector3(51.791, -13, -289.290) },
  { id: 2, position: new THREE.Vector3(47.404, -13, -306.952) },
  { id: 3, position: new THREE.Vector3(41.613, -13, -326.389) },
  { id: 4, position: new THREE.Vector3(80.512, -13, -298.700) },
  { id: 5, position: new THREE.Vector3(70.162, -13, -315.469) },
  { id: 6, position: new THREE.Vector3(58.547, -13, -338.697) },
];
const pointActivated = [false, false, false, false, false, false];
const pointSounds = [];
const speakerPosition = new THREE.Vector3(3, 1, -289); // Posición para audios narrativos

// CONSTANTES GLOBALES
const NOISE_FLOOR = -32;
const spectrumCanvas = document.getElementById('spectrum');
const spectrumCtx = spectrumCanvas ? spectrumCanvas.getContext('2d') : null;
const footstepBuffers = { grass: [], gravel: [], rock: [], water: [] };
const footRay = new THREE.Raycaster();
const downVector = new THREE.Vector3(0, -1, 0);
const STEP_DISTANCE = 2.25;
const DB_OFFSET = 84.5;
const SMOOTHING = 0.04;
let smoothedDb = NOISE_FLOOR;
let visualBoostDB = 0;
const clock = new THREE.Clock();
const loadingBarFill = document.getElementById('loadingBarFill');

// FUNCIONES GLOBALES
function removeLightsFromGLTF(scene) {
  scene.traverse((child) => {
    if (child.isLight) {
      child.visible = false;
      child.intensity = 0;
    }
  });
}

function attachToSoundMeter(sound) {
  if (!sound || !sound.getOutput) return;
  sound.getOutput().connect(soundMeterBus);
}

function updateLoadingBar(percent) {
  if (!loadingBarFill) return;
  loadingBarFill.style.width = `${percent}%`;
}

function playFootstep(surface) {
  const buffers = footstepBuffers[surface];
  if (!buffers || !buffers.length) return;
  const step = new THREE.Audio(listener);
  const buffer = buffers[Math.floor(Math.random() * buffers.length)];
  step.setBuffer(buffer);
  step.setVolume(0.013 + Math.random() * 0.03);
  step.setPlaybackRate(0.65 + Math.random() * 0.35);
  step.play();
}

function printToConsole(text) {
  console.log(text);
  const consolePrint = document.getElementById('consolePrint');
  if (!consolePrint) return;
  const line = document.createElement('div');
  line.className = 'consoleLine';
  line.textContent = text;
  consolePrint.appendChild(line);
  consolePrint.scrollTop = consolePrint.scrollHeight;
}

init(); 

function init() {
  scene = new THREE.Scene();

  const bgTexture = new THREE.TextureLoader().load('bgeq.jpg', () => {
    bgTexture.mapping = THREE.EquirectangularReflectionMapping;
    bgTexture.colorSpace = THREE.SRGBColorSpace;
    scene.background = bgTexture;
    scene.environment = bgTexture;
  });

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
  camera.position.set(0, 1.6, 0);

  xrRig = new THREE.Group();
  xrRig.position.set(0, 1.6, 0);
  const cameraGroup = new THREE.Group();
  cameraGroup.add(camera);
  xrRig.add(cameraGroup);
  scene.add(xrRig);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.xr.enabled = true;
  
  document.body.appendChild(renderer.domElement);
  document.body.appendChild(VRButton.createButton(renderer, { optionalFeatures: [] }));
  renderer.setAnimationLoop(animate);

  const xrController = renderer.xr.getController(0);
  scene.add(xrController);

  renderer.xr.addEventListener('sessionstart', () => {
    console.log('🚀 VR SESSION STARTING...');
    xrSessionStartTime = Date.now();
    isXR = true;

    camera.remove(listener);
    xrRig.add(listener);
    console.log('🎧 Listener moved to xrRig');

    const ctx = listener.context;
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      console.log('⚠️ AudioContext state:', ctx.state);
      ctx.resume().then(() => {
        console.log('🔊 AudioContext resumed, state:', ctx.state);
      }).catch(err => console.error('❌ Audio resume error:', err));
    } else {
      console.log('✅ AudioContext already running, state:', ctx.state);
    }

    const instructions = document.getElementById('instructions');
    if (instructions) instructions.style.display = 'none';

    if (controls && controls.isLocked) {
      console.log('🔓 Unlocking PointerLock...');
      controls.unlock();
    }

    lastStepPos.copy(xrRig.position);
    
    setTimeout(() => {
      try {
        console.log('🎵 Starting audio playback...');
        if (riverSound && riverSound.buffer && !riverSound.isPlaying) {
          riverSound.play();
          console.log('🌊 River sound started');
        }
        if (birds1 && birds1.buffer && !birds1.isPlaying) {
          birds1.play();
          console.log('🐦 Birds1 started');
        }
        if (birds2 && birds2.buffer && !birds2.isPlaying) {
          birds2.play();
          console.log('🐦 Birds2 started');
        }
      } catch (err) {
        console.error('❌ Audio playback error:', err);
      }
    }, 1000);

    console.log('✅ XR SESSION ACTIVE');
  });

  renderer.xr.addEventListener('sessionend', () => {
    const duration = ((Date.now() - xrSessionStartTime) / 1000).toFixed(2);
    isXR = false;
    
    xrRig.remove(listener);
    camera.add(listener);
    console.log('🎧 Listener returned to camera');
    
    console.log(`❌ XR session ended after ${duration} seconds`);
    if (riverSound && riverSound.isPlaying) riverSound.pause();
    if (modelSound && modelSound.isPlaying) modelSound.pause();
    if (birds1 && birds1.isPlaying) birds1.pause();
    if (birds2 && birds2.isPlaying) birds2.pause();
  });

  listener = new THREE.AudioListener();
  camera.add(listener);

  const stepLoader = new THREE.AudioLoader();
  function loadSteps(type) {
    for (let i = 1; i <= 6; i++) {
      const index = String(i).padStart(2, '0');
      stepLoader.load(`steps/${type}_${index}.mp3`, (buffer) => {
        footstepBuffers[type].push(buffer);
      });
    }
  }
  loadSteps('grass');
  loadSteps('gravel');
  loadSteps('rock');
  loadSteps('water');

  soundMeterBus = listener.context.createGain();
  soundMeterBus.gain.value = 1.0;
  analyser = listener.context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.7;
  soundMeterBus.connect(analyser);
  meterData = new Uint8Array(analyser.frequencyBinCount);

  const loader = new GLTFLoader();
  loader.load(
    'https://acousticheritagecollective.org/thingvellir/3d/thingvellir.glb',
    (gltf) => {
      terrain = gltf.scene;
      terrain.traverse((child) => {
        if (child.isMesh) {
          child.receiveShadow = true;
          child.castShadow = false;
          console.log(child.name);
        }
      });
      scene.add(terrain);
      updateLoadingBar(100);
      printToConsole('[terrain] Thingvellir terrain loaded');
    },
    (xhr) => {
      if (xhr.total) {
        const percent = (xhr.loaded / xhr.total) * 100;
        updateLoadingBar(percent);
        printToConsole(`[loading] terrain ${percent.toFixed(0)}%`);
      }
    },
    (error) => {
      printToConsole('[error] terrain could not be loaded');
      console.error(error);
    }
  );

  const pointLoader = new GLTFLoader();
  const pointFiles = [
    { file: 'point1.glb', position: [51.791, -13, -289.290], id: 1 },
    { file: 'point2.glb', position: [47.404, -13, -306.952], id: 2 },
    { file: 'point3.glb', position: [41.613, -13, -326.389], id: 3 },
    { file: 'point4.glb', position: [80.512, -13, -298.700], id: 4 },
    { file: 'point5.glb', position: [70.162, -13, -315.469], id: 5 },
    { file: 'point6.glb', position: [58.547, -13, -338.697], id: 6 },
  ];
  pointFiles.forEach(({ file, position, id }) => {
    pointLoader.load(file, (gltf) => {
      removeLightsFromGLTF(gltf.scene);
      const model = gltf.scene;
      model.position.set(...position);
      model.scale.set(1, 1, 1);
      model.userData.pointId = id;
      scene.add(model);
      
      const labelCanvas = document.createElement('canvas');
      const ctx = labelCanvas.getContext('2d');
      labelCanvas.width = 256;
      labelCanvas.height = 256;
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 120px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(id.toString(), 128, 128);
      
      const labelTexture = new THREE.CanvasTexture(labelCanvas);
      const labelMaterial = new THREE.SpriteMaterial({ map: labelTexture, transparent: true });
      const labelSprite = new THREE.Sprite(labelMaterial);
      labelSprite.position.set(position[0], position[1] + 5, position[2]);
      labelSprite.scale.set(3, 3, 1);
      scene.add(labelSprite);
      
      console.log(`${file} loaded at`, position);
    }, undefined, (error) => console.error(`Error loading ${file}:`, error));
  }); 

  const loader2 = new GLTFLoader();
  loader2.load('model.glb', (gltf) => {
    removeLightsFromGLTF(gltf.scene);
    modelSource = gltf.scene;
    modelSource.position.set(0, 1.5, -39.642);
    modelSource.scale.set(4, 4, 4);
    scene.add(modelSource);
    modelSound = new THREE.PositionalAudio(listener);
    const audioLoader = new THREE.AudioLoader();
    audioLoader.load('geisir.mp3', (buffer) => {
      modelSound.setBuffer(buffer);
      modelSound.setRefDistance(1);
      modelSound.setLoop(true);
      modelSound.setVolume(4);
      attachToSoundMeter(modelSound);
      modelSource.add(modelSound);
    });
  });

  const loader4 = new GLTFLoader();
  loader4.load('balloon.glb', (gltf) => {
    removeLightsFromGLTF(gltf.scene);
    balloonSource = gltf.scene;
    balloonSource.position.set(4, -3.5, -120);
    balloonSource.scale.set(2, 2, 2);
    scene.add(balloonSource);
    console.log('balloon.glb loaded and added to scene');
    balloonSound = new THREE.PositionalAudio(listener);
    const audioLoader4 = new THREE.AudioLoader();
    audioLoader4.load('ir.wav', (buffer) => {
      balloonSound.setBuffer(buffer);
      balloonSound.setRefDistance(20);
      balloonSound.setLoop(false);
      balloonSound.setVolume(4);
      attachToSoundMeter(balloonSound);
      balloonSource.add(balloonSound);
      console.log('Balloon sound loaded and ready.');
    }, undefined, (err) => console.error('Error loading ir.wav for balloon:', err));
  }, undefined, (err) => console.error('Error loading balloon.glb:', err));

  const loader3 = new GLTFLoader();
  loader3.load('iceland2.glb', (gltf) => {
    removeLightsFromGLTF(gltf.scene);
    const icelandModel = gltf.scene;
    icelandModel.position.set(-1, 5.5, -289);
    icelandModel.scale.set(1.3, 1.5, 1.3);
    scene.add(icelandModel);
    console.log('iceland2.glb loaded and positioned.');
  }, undefined, (error) => console.error('Error loading iceland2.glb:', error));

  // === SPEAKER MODEL (para mostrar info) ===
  const loaderSpeaker = new GLTFLoader();
  loaderSpeaker.load('speaker.glb', (gltf) => {
    removeLightsFromGLTF(gltf.scene);
    speakerSource = gltf.scene;
    speakerSource.position.set(3, 1, -289);
    speakerSource.scale.set(1, 1.2, 1);
    scene.add(speakerSource);
    console.log('✅ Speaker model loaded at Lögberg');
  });

  loader.load('book.glb', (book) => {
    removeLightsFromGLTF(book.scene);
    book.scene.position.set(66.861, -11, -275.059);
    book.scene.scale.set(3, 3, 3);
    scene.add(book.scene);
  }, (xhr) => {
    console.log(`Book model ${(xhr.loaded / xhr.total * 100).toFixed(1)}% loaded`);
  }, (error) => console.error('Error loading book model:', error));

  // === CARGAR AUDIOS NARRATIVOS ===
  console.log('🎵 Starting to load narrative audios...');
  
  const narrativeSpeakerSource = new THREE.Object3D(); // ✅ Nombre diferente
  narrativeSpeakerSource.position.copy(speakerPosition);
  scene.add(narrativeSpeakerSource);
  console.log('📍 Narrative audio source positioned at:', speakerPosition);
  
  const narrativeAudioLoader = new THREE.AudioLoader();
  for (let i = 1; i <= 6; i++) {
    const paddedId = i.toString().padStart(2, '0');
    const speakerSound = new THREE.PositionalAudio(listener);
    
    narrativeAudioLoader.load(
      `speaker${paddedId}.mp3`, 
      (buffer) => {
        speakerSound.setBuffer(buffer);
        speakerSound.setRefDistance(10);
        speakerSound.setLoop(false);
        speakerSound.setVolume(2);
        attachToSoundMeter(speakerSound);
        narrativeSpeakerSource.add(speakerSound);
        console.log(`✅ speaker${paddedId}.mp3 loaded successfully`);
      },
      (xhr) => {
        if (xhr.lengthComputable) {
          const percent = (xhr.loaded / xhr.total * 100).toFixed(0);
          console.log(`📥 speaker${paddedId}.mp3 loading: ${percent}%`);
        }
      },
      (error) => {
        console.error(`❌ Error loading speaker${paddedId}.mp3:`, error);
      }
    );
    pointSounds.push(speakerSound);
  }

  riverSource = new THREE.Object3D();
  riverSource.position.set(-45.811, 0.614, -490.949);
  scene.add(riverSource);
  riverSound = new THREE.PositionalAudio(listener);
  const audioLoader2 = new THREE.AudioLoader();
  audioLoader2.load('river.mp3', (buffer) => {
    riverSound.setBuffer(buffer);
    riverSound.setRefDistance(50);
    riverSound.setMaxDistance(700);
    riverSound.setLoop(true);
    const lowpassFilter = listener.context.createBiquadFilter();
    lowpassFilter.type = 'lowpass';
    lowpassFilter.frequency.value = 210;
    lowpassFilter.Q.value = 0.3;
    riverSound.setFilter(lowpassFilter);
    riverSound.userData.filter = lowpassFilter;
    attachToSoundMeter(riverSound);
    riverSource.add(riverSound);
  });

  birds1 = new THREE.PositionalAudio(listener);
  const audioLoaderB1 = new THREE.AudioLoader();
  audioLoaderB1.load('birds.mp3', (buffer) => {
    birds1.setBuffer(buffer);
    birds1.setRefDistance(100);
    birds1.setMaxDistance(1000);
    birds1.setRolloffFactor(2);
    birds1.setDistanceModel('inverse');
    birds1.setLoop(true);
    birds1.setVolume(0.3);
    attachToSoundMeter(birds1);
  });
  const birds1Pos = new THREE.Object3D();
  birds1Pos.position.set(283, 10, 75);
  birds1Pos.add(birds1);
  scene.add(birds1Pos);

  birds2 = new THREE.PositionalAudio(listener);
  const audioLoaderB2 = new THREE.AudioLoader();
  audioLoaderB2.load('birds2.mp3', (buffer) => {
    birds2.setBuffer(buffer);
    birds2.setRefDistance(5);
    birds2.setMaxDistance(400);
    birds2.setRolloffFactor(2.5);
    birds2.setDistanceModel('inverse');
    birds2.setLoop(true);
    birds2.setVolume(0.3);
    attachToSoundMeter(birds2);
  });
  const birds2Pos = new THREE.Object3D();
  birds2Pos.position.set(411, 10, -384);
  birds2Pos.add(birds2);
  scene.add(birds2Pos);

  const labels = [];
  function createLabel(text, position) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontSize = 64;
    canvas.width = 2048;
    canvas.height = 512;
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    wrapText(ctx, text, canvas.width / 2, canvas.height / 2, 1800, fontSize * 1.2);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(60, 20, 1);
    scene.add(sprite);
    labels.push(sprite);
    return sprite;
  }
  
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let lines = [];
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        lines.push(line);
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line);
    const totalHeight = lines.length * lineHeight;
    y -= totalHeight / 4;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, y + i * lineHeight);
    }
  }
  
  createLabel("Almannagjá Rift: Basalt, low acoustic absorption (α 1KHz: 0.03) — acts not only a reflective surface but also as an acoustic diffusor.", new THREE.Vector3(10, 30, -116));
  createLabel("Öxarárfoss: Waterfall and river, high SPL white-noise source type — the most dominant sound of the site reduces speech intelligibility as you get closer", new THREE.Vector3(0, 10, -440));
  createLabel("Lögberg: Sheltered by rifts and rock formations in an amphitheater-like setting, the Lawspeaker's position ensures direct sound projection and visibility. The porous surface improves speech clarity.", new THREE.Vector3(15, 20, -284.800));
  createLabel("Audience Area: it is believe that near 4500 listeners were located in this area. Low Background-Noise Noise is a key element for good speech intelligibility (NC:35-40)", new THREE.Vector3(70, -2, -310));
  createLabel("Saga Listening: Follow the six pink diamonds (1→6). Hear how Chapter 141 sounds from different positions across the assembly grounds", new THREE.Vector3(67.861, 3, -262.059));
  createLabel("Sounds of Birds: 52 bird species live by the lake Þingvallavatn, while 30 others come and go. The most famous bird is the great northern diver. Other migrant birds are barrow's goldeneye and the harlequin duck", new THREE.Vector3(15, 17, -195));
  createLabel("Listen to the ECHO: Pass through the balloon!", new THREE.Vector3(8, 15, -110));

  controls = new PointerLockControls(camera, document.body);

  const instructions = document.getElementById('instructions');
  if (instructions) {
    instructions.addEventListener('click', () => {
      if (!renderer.xr.isPresenting && !isXR && controls) {
        controls.lock();
      }
    });

    controls.addEventListener('lock', () => {
      instructions.style.display = 'none';
      lastStepPos.copy(controls.getObject().position);
      if (riverSound && !riverSound.isPlaying) riverSound.play();
      if (birds1 && birds1.buffer && !birds1.isPlaying) birds1.play();
      if (birds2 && birds2.buffer && !birds2.isPlaying) birds2.play();
    });

    controls.addEventListener('unlock', () => {
      if (!isXR) instructions.style.display = '';
      if (riverSound && riverSound.isPlaying) riverSound.pause();
      if (modelSound && modelSound.isPlaying) modelSound.pause();
      if (birds1 && birds1.isPlaying) birds1.pause();
      if (birds2 && birds2.isPlaying) birds2.pause();
    });
  }

  infoTextDiv = document.createElement('div');
  infoTextDiv.id = 'infoText';
  infoTextDiv.style.position = 'absolute';
  infoTextDiv.style.bottom = '10%';
  infoTextDiv.style.left = '5%';
  infoTextDiv.style.width = '40%';
  infoTextDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
  infoTextDiv.style.color = 'white';
  infoTextDiv.style.padding = '25px 30px';
  infoTextDiv.style.borderRadius = '12px';
  infoTextDiv.style.fontSize = '16px';
  infoTextDiv.style.lineHeight = '1.6';
  infoTextDiv.style.textAlign = 'left';
  infoTextDiv.style.display = 'none';
  infoTextDiv.style.transition = 'opacity 1s ease';
  infoTextDiv.innerHTML = '';
  document.body.appendChild(infoTextDiv);

  subtitleDiv = document.createElement('div');
  subtitleDiv.id = 'subtitleText';
  subtitleDiv.style.position = 'absolute';
  subtitleDiv.style.bottom = '15%';
  subtitleDiv.style.left = '50%';
  subtitleDiv.style.transform = 'translateX(-50%)';
  subtitleDiv.style.width = '70%';
  subtitleDiv.style.maxWidth = '800px';
  subtitleDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  subtitleDiv.style.color = 'white';
  subtitleDiv.style.padding = '20px 30px';
  subtitleDiv.style.borderRadius = '8px';
  subtitleDiv.style.fontSize = '18px';
  subtitleDiv.style.lineHeight = '1.5';
  subtitleDiv.style.textAlign = 'center';
  subtitleDiv.style.display = 'none';
  subtitleDiv.style.transition = 'opacity 0.5s ease';
  subtitleDiv.style.fontFamily = 'Saga, serif';
  subtitleDiv.innerHTML = '';
  document.body.appendChild(subtitleDiv);

  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: 'Saga';
      src: url('https://acousticheritagecollective.org/thingvellir/3d-vr/Saga-Regular.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }
  `;
  document.head.appendChild(style);
  console.log('✅ Saga font CSS added');

  const onKeyDown = (event) => {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp': moveForward = true; break;
      case 'KeyA':
      case 'ArrowLeft': moveLeft = true; break;
      case 'KeyS':
      case 'ArrowDown': moveBackward = true; break;
      case 'KeyD':
      case 'ArrowRight': moveRight = true; break;
      case 'Space': if (infoVisible) hideInfoText(); break;
    }
  };
  
  const onKeyUp = (event) => {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp': moveForward = false; break;
      case 'KeyA':
      case 'ArrowLeft': moveLeft = false; break;
      case 'KeyS':
      case 'ArrowDown': moveBackward = false; break;
      case 'KeyD':
      case 'ArrowRight': moveRight = false; break;
    }
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', onWindowResize);

  const logo = document.createElement('img');
  logo.src = 'Logo.png';
  logo.style.position = 'fixed';
  logo.style.top = '20px';
  logo.style.right = '20px';
  logo.style.opacity = '0.9';
  logo.style.zIndex = '10';
  logo.style.pointerEvents = 'none';
  logo.style.transition = 'width 0.3s ease';

  function resizeLogo() {
    const w = window.innerWidth;
    if (w < 600) logo.style.width = '70px';
    else if (w < 1024) logo.style.width = '100px';
    else logo.style.width = '140px';
    logo.style.height = 'auto';
  }

  resizeLogo();
  window.addEventListener('resize', resizeLogo);
  document.body.appendChild(logo);
}

function showInfoText(title, text, imagePath = null) {
  let imageHTML = '';
  if (imagePath) {
    imageHTML = `<img src="${imagePath}" style="width:100%; max-height:250px; object-fit:cover; border-radius:8px; margin-bottom:15px;" alt="${title}">`;
  }
  infoTextDiv.innerHTML = `<h2 style="color:#ffd700; margin-top:0;">${title}</h2>${imageHTML}<p>${text}</p><p style="opacity:0.7;font-size:14px;">Press SPACE to close</p>`;
  infoTextDiv.style.display = 'block';
  infoTextDiv.style.opacity = '1';
  infoVisible = true;
}

function hideInfoText() {
  infoTextDiv.style.opacity = '0';
  setTimeout(() => {
    infoTextDiv.style.display = 'none';
    infoVisible = false;
  }, 1000);
}

function showSubtitle(pointId) {
  const subtitles = {
    1: "One day, people went to the Lögberg, and the chieftains were arranged so that Ásgrímur Elliða-Grímsson and Gissur the White, Guðmundur the Powerful and Snorri goði were up at the Lögberg, while the Easterners stood below in front of them. Mörður Valgarðsson stood beside his brother-in-law Gissur the White. Mörður was the most eloquent of all men. Then Gissur said he should proclaim the manslaughter charge and asked him to speak loud enough so that everyone could hear well. Mörður called witnesses.",
    2: "I call witnesses,-he said-, that I proclaim a legal charge of assault against Flosi Þórðarson because he attacked Helgi Njálsson at that place where Flosi Þórðarson attacked Helgi Njálsson and inflicted upon him a brain wound or a body wound or a marrow wound that became a fatal wound, and Helgi died from it. I declare that for this cause he must be found guilty, an outlaw without right to shelter, without right to transport, without right to aid in any form of rescue. I declare all his property forfeited, half to me and half to the quarter men who have the right to take the fine according to law. I proclaim this manslaughter charge to the Quarter Court where the case must be brought according to law. I proclaim a lawful proclamation. I proclaim this in audible voice at the Lögberg. I proclaim this for prosecution this summer and for full conviction against Flosi Þórðarson. I proclaim the case entrusted to Þorgeir Þórisson.",
    3: "At the Lögberg there was great commotion because he had spoken well and boldly. Mörður spoke a second time.",
    4: "I call you as witnesses,-he said-, that I proclaim a charge against Flosi Þórðarson because he wounded Helgi Njálsson with a brain wound or a body wound or a marrow wound, that wound which became fatal, and Helgi died from it, at that place where Flosi Þórðarson attacked Helgi Njálsson in a lawful first assault. I declare you, Flosi, must be found guilty for this cause, an outlaw without right to shelter, without right to transport, without right to aid in any form of rescue. I declare all your property forfeited, half to me and half to the quarter men who have the right to take the fine according to law. I proclaim this charge to the Quarter Court where the case must be brought according to law. I proclaim a lawful proclamation. I proclaim this in audible voice at the Lögberg. I proclaim this for prosecution this summer and for full conviction against Flosi Þórðarson. I proclaim the case entrusted to Þorgeir Þórisson.",
    5: "Then Mörður sat down. Flosi listened carefully and said not a word. Þorgeir skorargeir stood up and called witnesses: I call witnesses that I proclaim a charge against Glúmur Hildisson because he took fire and kindled it and carried it into the house at Bergþórshvoll when they burned inside Njál Þorgeirsson and Bergþóra Skarphéðinsdóttir and all the men who burned inside there. I declare that for this cause he must be found guilty, an outlaw without right to shelter, without right to transport, without right to aid in any form of rescue. I declare all his property forfeited, half to me and half to the quarter men who have the right to take the fine according to law. I proclaim this charge to the Quarter Court where the case must be brought according to law. I proclaim a lawful proclamation. I proclaim this in audible voice at the Lögberg. I proclaim this for prosecution this summer and for full conviction against Glúmur Hildisson.",
    6: "Kári Sölmundarson prosecuted Kol Þorsteinsson and Gunnar Lambason and Grani Gunnarsson, and people said he spoke extraordinarily well. Þorleifur krákur prosecuted all of Sigfús's sons, and his brother Þorgrímur the Great prosecuted Móðólfur Ketilsson and Lambi Sigurðarson and Hróar Hámundarson, brother of Leiðólfur the Strong. Ásgrímur Elliða-Grímsson prosecuted Leiðólfur and Þorsteinn Geirleifsson, Arni Kolsson and Grímur the Red, and they all spoke well. Then other men proclaimed their charges and this went on late into the day. Then people went home to their booths."
  };
  
  const subtitleText = subtitles[pointId] || "Subtitle text not available";
  
  subtitleDiv.innerHTML = `
    <div style="color:#FFD700; font-weight:bold; margin-bottom:10px;">Point ${pointId} - Brennu-Njáls Saga</div>
    <div style="font-style:italic;">${subtitleText}</div>
  `;
  subtitleDiv.style.display = 'block';
  subtitleDiv.style.opacity = '1';
}

function hideSubtitle() {
  subtitleDiv.style.opacity = '0';
  setTimeout(() => {
    subtitleDiv.style.display = 'none';
  }, 500);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function getSurfaceUnderPlayer() {
  if (!terrain) return null;
  const origin = isXR ? xrRig.position : camera.position;
  footRay.set(origin, downVector);
  const hits = footRay.intersectObject(terrain, true);
  if (!hits.length) return null;
  const name = hits[0].object.name.toLowerCase();
  if (name.includes('grass')) return 'grass';
  if (name.includes('gravel')) return 'gravel';
  if (name.includes('rock')) return 'rock';
  if (name.includes('water')) return 'water';
  return null;
}

function animate() {
  const delta = clock.getDelta();

  if (isXR) {
    moveForward = false;
    moveBackward = false;
    moveLeft = false;
    moveRight = false;

    try {
      const session = renderer.xr.getSession();
      if (session && session.inputSources) {
        for (const source of session.inputSources) {
          if (!source.gamepad || !source.gamepad.axes) continue;
          const axes = source.gamepad.axes;
          if (axes.length < 2) continue;
          let x = 0, z = 0;
          if (axes.length >= 4) {
            x = axes[2];
            z = axes[3];
          } else {
            x = axes[0];
            z = axes[1];
          }
          const dead = 0.15;
          if (z < -dead) moveForward  = true;
          if (z >  dead) moveBackward = true;
          if (x < -dead) moveLeft     = true;
          if (x >  dead) moveRight    = true;
          break;
        }
      }
    } catch (error) {}
  }

  const speed = isXR ? 25.0 : 40.0;
  velocity.x -= velocity.x * 10.0 * delta;
  velocity.z -= velocity.z * 10.0 * delta;
  direction.z = Number(moveForward) - Number(moveBackward);
  direction.x = Number(moveRight) - Number(moveLeft);
  direction.normalize();
  if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
  if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

  if (isXR) {
    try {
      if (!renderer.xr.isPresenting) return;
      const xrCamera = renderer.xr.getCamera();
      if (!xrCamera || !xrCamera.quaternion) return;
      
      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyQuaternion(xrCamera.quaternion);
      forward.y = 0;
      forward.normalize();

      const right = new THREE.Vector3(1, 0, 0);
      right.applyQuaternion(xrCamera.quaternion);
      right.y = 0;
      right.normalize();

      xrRig.position.addScaledVector(forward, -velocity.z * delta);
      xrRig.position.addScaledVector(right, -velocity.x * delta);
    } catch (error) {
      console.error('XR movement error:', error);
    }
  } else {
    if (controls && controls.isLocked) {
      controls.moveRight(-velocity.x * delta);
      controls.moveForward(-velocity.z * delta);
    }
  }

  if (terrain) {
    try {
      const rayOrigin = isXR ? xrRig.position.clone().add(new THREE.Vector3(0, 1.6, 0)) : (controls ? controls.getObject().position : camera.position);
      raycaster.set(rayOrigin, new THREE.Vector3(0, -1, 0));
      const intersects = raycaster.intersectObject(terrain, true);
      if (intersects.length > 0) {
        if (isXR) {
          const targetY = intersects[0].point.y;
          xrRig.position.y += (targetY - xrRig.position.y) * 0.1;
        } else if (controls) {
          const targetY = intersects[0].point.y + 2.2;
          const object = controls.getObject();
          const currentY = object.position.y;
          object.position.y += (targetY - currentY) * 0.1;
        }
      }
    } catch (error) {}
  }

  const listenerPos = isXR 
    ? xrRig.position.clone().add(new THREE.Vector3(0, 1.6, 0))
    : (controls && controls.getObject() ? controls.getObject().position : camera.position);

  if (riverSound && riverSound.buffer) {
    const dist = listenerPos.distanceTo(riverSource.position);
    const minDist = 20, maxDist = 210;
    const t = THREE.MathUtils.clamp((dist - minDist) / (maxDist - minDist), 0, 1);
    const perceptual = t * t;
    const minFreq = 210, maxFreq = 16000;
    const cutoff = minFreq * Math.pow(maxFreq / minFreq, 1 - perceptual);
    const filter = riverSound.userData.filter;
    if (filter) {
      const now = listener.context.currentTime;
      filter.frequency.setTargetAtTime(cutoff, now, 0.15);
      const minQ = 0.3, maxQ = 1.2;
      const qValue = THREE.MathUtils.lerp(minQ, maxQ, perceptual);
      filter.Q.setTargetAtTime(qValue, now, 0.2);
    }
    
    const minDistVisual = 170;
    const maxDistVisual = 215;
    
    if (dist >= minDistVisual && dist <= maxDistVisual) {
      const v = (dist - minDistVisual) / (maxDistVisual - minDistVisual);
      visualBoostDB = 4 * (1 - v);
    } else if (dist < minDistVisual) {
      visualBoostDB = 4;
    } else {
      visualBoostDB = 0;
    }
  }

  if (modelSound && modelSound.buffer && modelSource) {
    const dist = listenerPos.distanceTo(modelSource.position);
    if (dist < 9 && !modelSound.isPlaying) {
      modelSound.play();
      console.log('🔥 Geisir sound started');
      if (!infoVisible && !isXR) {
        showInfoText("FACT #1: The Geological Nature of Þingvellir", "Þingvellir is today a National Park and a UNESCO World Heritage Site. But beyond its beauty, this place quite literally lies on a fracture — the Mid-Atlantic Ridge. Here, it is one of the few places on Earth where you can walk between the North American and Eurasian tectonic plates, which drift apart by only a few millimeters each year. The landscape we see — the rift, and the cliffs of Almannagjá and Heiðargjá — is the result of millennia of tectonic movements, eruptions, and collapses that shape its ACOUSTIC IDENTITY.", "images/fact1.jpg");
      }
    } else if (dist >= 10 && modelSound.isPlaying) {
      modelSound.stop();
      console.log('🔥 Geisir sound stopped');
    }
  }

  // === BOOK INFO (PROXIMIDAD + TEXTO) ===
  if (!isXR && controls && controls.isLocked) {
    const bookPosition = new THREE.Vector3(66.861, -11, -275.059);
    const distbook = listenerPos.distanceTo(bookPosition);
    
    if (distbook < 10 && !bookInfoShown) {
      showInfoText("STAÐREYND #4: Íslendingasögurnar á Þingvöllum", "Miðaldasögur sem varðveittu minninguna um þennan stað og fólk hans. Skrifaðar öldum eftir atburðina sem þær lýsa, bjóða þær upp á innsýn í hvernig Alþingi virkaði — og hversu miðlægt hljóð og tal voru í íslenskri menningu. Í Brennu-Njáls sögu kemur ein setning fram aftur og aftur — meira en 14 sinnum: Lýsi ek í heyranda hljóði að Lögbergi. Þetta var ekki bara formsatriði. Það var lagaleg krafa. Til að gera eitthvað opinbert þurfti að lýsa því upphátt, á Lögbergi, þar sem allir gátu heyrt. Sögurnar mundu ekki bara hvað var sagt, heldur hvar og hvernig það var sagt. Hljóðið skipti máli. Að vera heyrður skipti máli.", "images/book.jpeg");
      bookInfoShown = true;
      console.log('✅ Book info shown');
    } else if (distbook >= 10) {
      bookInfoShown = false;
    }
  }

  if (balloonSource && balloonSound && balloonSound.buffer) {
    const dist = listenerPos.distanceTo(balloonSource.position);
    if (dist < 10 && !balloonInfoShown) {
      showInfoText("FACT #2: Þingvellir distinctive echo", "Due to its very distinctive geographical landscape, Thingvellir has a highly recognizable acoustic footprint. No matter where you are, you can always perceive a characteristic echo caused by the geological formations that shape the acoustics and auditory perception of this place.", "images/fact2.jpg");
      balloonInfoShown = true;
    } else if (dist >= 10) {
      balloonInfoShown = false;
    }
    if (dist < 7 && !balloonAudioPlayed) {
      balloonSound.play();
      balloonAudioPlayed = true;
    } else if (dist >= 7 && balloonAudioPlayed) {
      balloonSound.stop();
      balloonAudioPlayed = false;
    }
  }

  if (!isXR && controls && controls.isLocked && speakerSource) {
    const distspeaker = listenerPos.distanceTo(speakerSource.position);
    if (distspeaker < 7 && !speakerInfoShown) {
      showInfoText("FACT #3: Orality at Lögberg (Law Rock) 930-1262", "At the Lögberg (Law Rock) and the nearby plains, Icelanders gathered to proclaim laws and deliver judgments. The central figure of the assembly was the Law Speaker, who recited aloud the laws of the Commonwealth. He memorized the entire body of laws and had three years to recite them in full, in regular increments each summer, when he was also required to review the procedural rules. The exceptionally low ambient noise, the acoustic absorption of the moss-covered surface and the audience, together with the elevated position of the Law Speaker — which allowed unobstructed direct sound rays to reach all listeners — made Lögberg an ideal setting for speech intelligibility.", "images/fact3.jpg");
      speakerInfoShown = true;
      console.log('✅ Speaker info shown');
    } else if (distspeaker >= 7) {
      speakerInfoShown = false;
    }
  }

  pointPositions.forEach((point, index) => {
    const dist = listenerPos.distanceTo(point.position);
    const sound = pointSounds[index];
    
    if (!pointActivated[index] && dist < 7) {
      pointActivated[index] = true;
      console.log(`🎯 Point ${point.id} triggered!`);
      
      if (sound && sound.buffer && !sound.isPlaying) {
        sound.play();
        showSubtitle(point.id);
        console.log(`✅ Point ${point.id} activated`);
        
        sound.onEnded = () => {
          hideSubtitle();
          console.log(`🎵 Point ${point.id} audio finished`);
        };
      } else if (sound && !sound.buffer) {
        console.warn(`⚠️ Point ${point.id} sound not loaded yet`);
      }
    }
    
    if (pointActivated[index] && dist > 7) {
      if (sound && sound.isPlaying) {
        sound.stop();
        hideSubtitle();
        console.log(`❌ Point ${point.id} deactivated`);
      }
      pointActivated[index] = false;
    }
  });

  if (analyser && meterData) {
    analyser.getByteTimeDomainData(meterData);
    let sum = 0;
    for (let i = 0; i < meterData.length; i++) {
      const v = (meterData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / meterData.length);
    analyser.getByteFrequencyData(meterData);
    if (spectrumCtx) {
      spectrumCtx.clearRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);
      const barCount = meterData.length;
      const barWidth = spectrumCanvas.width / barCount;
      for (let i = 0; i < barCount; i++) {
        const value = meterData[i] / 255;
        const barHeight = value * spectrumCanvas.height;
        spectrumCtx.fillStyle = 'rgb(100, 200, 255)';
        spectrumCtx.fillRect(i * barWidth, spectrumCanvas.height - barHeight, barWidth, barHeight);
      }
    }
    let db = rms > 0 ? 20 * Math.log10(rms) : -100;
    const METER_GAIN_DB = 2.0;
    if (db > NOISE_FLOOR) db = NOISE_FLOOR + (db - NOISE_FLOOR) * METER_GAIN_DB;
    
    db += visualBoostDB;
    
    smoothedDb += (db - smoothedDb) * SMOOTHING;
    const dbDisplay = smoothedDb + DB_OFFSET;
    const fill = document.getElementById('soundMeterFill');
    const value = document.getElementById('soundMeterValue');
    if (fill && value) {
      const percent = THREE.MathUtils.clamp(((dbDisplay - (NOISE_FLOOR + DB_OFFSET)) / Math.abs(NOISE_FLOOR)) * 100, 0, 100);
      fill.style.width = `${percent}%`;
      value.textContent = `${dbDisplay.toFixed(1)} dB`;
    }
  }

  const playerPos = isXR ? xrRig.position : (controls ? controls.getObject().position : camera.position);
  const moved = playerPos.distanceTo(lastStepPos);
  if (moved > STEP_DISTANCE) {
    const surface = getSurfaceUnderPlayer();
    if (surface) playFootstep(surface);
    lastStepPos.copy(playerPos);
  }

  renderer.render(scene, camera);
}