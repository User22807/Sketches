let scene,
  camera,
  renderer,
  effectComposer,
  controls,
  asciiPass,
  raycaster,
  model,
  circleModel,
  clock;
let enableAscii = true; // Boolean flag to control ASCII filter
let asciiSize = 0.1;
let mouse = new THREE.Vector2();
let mouseWorldPosition = new THREE.Vector3();
let head, leftFoot, rightFoot, centerBody;
let dampingFactor = 0.1; // Damping factor for smooth rotation
let rocks = {};
let activeRocks = [];
let initialCameraPosition = { x: -8, y: 6, z: -21 };
let targetCameraPosition = { x: 12, y: 6, z: -18 };

function init() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(
    initialCameraPosition.x,
    initialCameraPosition.y,
    initialCameraPosition.z
  );

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Add OrbitControls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.25;
  controls.screenSpacePanning = false;
  controls.maxPolarAngle = Math.PI / 2;

  // Add lighting
  const greenDirectionalLight = new THREE.DirectionalLight(0x55ff55, 5);
  const greenDirectionalLight2 = new THREE.DirectionalLight(0x00ff00, 0);
  greenDirectionalLight.position.set(0, 1, -2).normalize();
  greenDirectionalLight2.position.set(0, 1, -5).normalize();
  scene.add(greenDirectionalLight);
  scene.add(greenDirectionalLight2);

  const whiteSpotlight = new THREE.DirectionalLight(0xffffff, 0);
  whiteSpotlight.position.set(0, 5, 0).normalize();
  scene.add(whiteSpotlight);

  const ambientLight = new THREE.AmbientLight(0x000000);
  scene.add(ambientLight);

  // Load and add the GLTF model
  const loader = new THREE.GLTFLoader();
  loader.load(
    "https://github.com/User22807/Sketches/raw/main/original_golem_material.glb",
    function (gltf) {
      model = gltf.scene;
      model.position.set(3, 0, 0); // Move the character to the right to avoid overlap

      // Find specific bones for animation
      head = model.getObjectByName("head_bone");
      leftFoot = model.getObjectByName("shin.L");
      rightFoot = model.getObjectByName("shin.R");
      centerBody = model.getObjectByName("center_body_bone");

      scene.add(model);
    },
    undefined,
    function (error) {
      console.error(error);
    }
  );

  // Load and add the second GLTF model
  loader.load(
    "https://github.com/User22807/Sketches/raw/main/circles.glb",
    function (gltf) {
      circleModel = gltf.scene;
      circleModel.position.set(18, 0, 0); // Move the stones to the left
      scene.add(circleModel);

      // Hide all rocks initially
      ["Rock1", "Rock2", "Rock3", "Rock4", "Rock5"].forEach((name) => {
        const rock = circleModel.getObjectByName(name);
        if (rock) {
          rock.visible = false;
          rocks[name] = rock;
        }
      });
    },
    undefined,
    function (error) {
      console.error(error);
    }
  );

  // Initialize raycaster
  raycaster = new THREE.Raycaster();

  window.addEventListener("resize", onWindowResize, false);
  window.addEventListener("mousemove", onMouseMove, false);
  window.addEventListener("click", onDocumentClick, false);

  // Post-processing
  effectComposer = new THREE.EffectComposer(renderer);
  effectComposer.addPass(new THREE.RenderPass(scene, camera));

  // Bloom pass
  const bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5,
    0.4,
    0.85
  );
  bloomPass.threshold = 0;
  bloomPass.strength = 0.9;
  bloomPass.radius = 0.1;
  effectComposer.addPass(bloomPass);

  // ASCII pass
  asciiPass = new THREE.ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      iResolution: {
        value: new THREE.Vector2(window.innerWidth, window.innerHeight),
      },
      asciiSize: { value: asciiSize },
    },
    vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
    fragmentShader: `
                    uniform sampler2D tDiffuse;
                    uniform vec2 iResolution;
                    uniform float asciiSize;

                    float character(int n, vec2 p) {
                        p = floor(p * vec2(-4.0, 4.0) + 2.5);
                        if (clamp(p.x, 0.0, 4.0) == p.x) {
                            if (clamp(p.y, 0.0, 4.0) == p.y) {
                                int a = int(round(p.x) + 5.0 * round(p.y));
                                if (((n >> a) & 1) == 1) return 1.0;
                            }
                        }
                        return 0.0;
                    }

                    void mainImage(out vec4 fragColor, in vec2 fragCoord) {
                        vec2 pix = fragCoord.xy;
                        vec3 col = texture2D(tDiffuse, floor(pix / asciiSize) * asciiSize / iResolution.xy).rgb;

                        float gray = 0.3 * col.r + 0.59 * col.g + 0.11 * col.b;

                        int n = 4096;

                        if (gray > 0.2) n = 65600;
                        if (gray > 0.3) n = 163153;
                        if (gray > 0.4) n = 15255086;
                        if (gray > 0.5) n = 13121101;
                        if (gray > 0.6) n = 15252014;
                        if (gray > 0.7) n = 13195790;
                        if (gray > 0.8) n = 11512810;

                        vec2 p = mod(pix / 4.0, 2.0) - vec2(1.0);

                        col = col * character(n, p);

                        fragColor = vec4(col, 1.0);
                    }

                    varying vec2 vUv;
                    void main() {
                        mainImage(gl_FragColor, vUv * iResolution);
                    }
                `,
  });
  asciiPass.renderToScreen = true;
  effectComposer.addPass(asciiPass);

  clock = new THREE.Clock();

  animate();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (effectComposer) {
    effectComposer.setSize(window.innerWidth, window.innerHeight);
  }
}

function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onDocumentClick(event) {
  const isButtonClick = event.target.tagName === "BUTTON";
  if (!isButtonClick) {
    moveCamera(initialCameraPosition);
  }
}

function moveCamera(position) {
  new TWEEN.Tween(camera.position)
    .to(position, 2000) // Move to target position over 2 seconds
    .easing(TWEEN.Easing.Quadratic.InOut) // Ease-in-out effect
    .start();
}

function handleButtonClick(action) {
  action();
  moveCamera(targetCameraPosition);
}

function createRock() {
  const rockNames = ["Rock1", "Rock2", "Rock3", "Rock4"];
  const randomRockName =
    rockNames[Math.floor(Math.random() * rockNames.length)];
  const randomRock = rocks[randomRockName];

  if (randomRock && !randomRock.visible) {
    randomRock.visible = true;
    activeRocks.push(randomRock);
  }
}

function splitRocks() {
  if (rocks["Rock5"] && rocks["Rock5"].visible) {
    rocks["Rock5"].visible = false;
  }

  ["Rock1", "Rock2", "Rock3", "Rock4"].forEach((name) => {
    if (rocks[name]) {
      rocks[name].visible = true;
      if (!activeRocks.includes(rocks[name])) {
        activeRocks.push(rocks[name]);
      }
    }
  });
}

function mergeRocks() {
  activeRocks.forEach((rock) => {
    rock.visible = false;
  });
  activeRocks = [];

  if (rocks["Rock5"]) {
    rocks["Rock5"].visible = true;
    activeRocks.push(rocks["Rock5"]);
  }
}

function emitRocks() {
  activeRocks.forEach((rock) => {
    rock.visible = false;
  });
  activeRocks = [];
}

function toggleAsciiFilter() {
  enableAscii = !enableAscii;
}

function animate() {
  requestAnimationFrame(animate);

  controls.update();
  TWEEN.update();

  camera.lookAt(11, 8.2, 0); // Adjust camera look at to a higher point

  asciiPass.uniforms.asciiSize.value = asciiSize;

  // Idle animation logic
  const delta = clock.getDelta();
  const time = clock.getElapsedTime();

  if (centerBody) {
    centerBody.rotation.y = Math.sin(time * 0.5) * 0.1; // Sway left-right
  }
  if (leftFoot) {
    leftFoot.rotation.x = Math.sin(time * 0.5) * 0.1; // Move left foot
  }
  if (rightFoot) {
    rightFoot.rotation.x = Math.sin(time * 0.5 + Math.PI) * 0.1; // Move right foot
  }

  // Head pointing logic with damping
  if (head) {
    // Calculate direction to mouse in 2D space
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(scene, true);
    if (intersects.length > 0) {
      mouseWorldPosition.copy(intersects[0].point);

      // Constrain to 2D space (horizontal and vertical only)
      mouseWorldPosition.z = head.getWorldPosition(new THREE.Vector3()).z;

      // Calculate direction from head to mouse
      const direction = new THREE.Vector3()
        .subVectors(
          mouseWorldPosition,
          head.getWorldPosition(new THREE.Vector3())
        )
        .normalize();

      // Calculate target quaternion
      const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, -1),
        direction
      );

      // Apply damping
      head.quaternion.slerp(targetQuaternion, dampingFactor);

      // Constraints for realistic movement
      const euler = new THREE.Euler().setFromQuaternion(head.quaternion, "XYZ");
      euler.x = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, euler.x));
      euler.y = Math.max(-Math.PI / 6, Math.min(Math.PI / 6, euler.y));
      head.quaternion.setFromEuler(euler);
    }
  }

  if (enableAscii) {
    effectComposer.render();
  } else {
    renderer.render(scene, camera);
  }
}

init();
