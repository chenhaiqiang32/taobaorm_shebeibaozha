import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { loadModel } from "./modelLoader.js";
import BoxModel from "./src/components/boxModel.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// 创建场景
const scene = new THREE.Scene();

// 创建渲染器
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
// 设置设备像素比，提高渲染质量
renderer.setPixelRatio(window.devicePixelRatio);
// 启用更高质量的阴影
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// 启用更高质量的纹理过滤
renderer.physicallyCorrectLights = true;
document.body.appendChild(renderer.domElement);

// 设置ROOM环境
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(
  new RoomEnvironment(),
  0.04
).texture;
pmremGenerator.dispose(); // 清理PMREMGenerator资源

// 加载HDR环境贴图作为背景
const textureLoader = new THREE.TextureLoader();
const backgroundTexture = textureLoader.load("./sunny2.jpg");
// 设置色彩空间为sRGB，降低饱和度和亮度
backgroundTexture.colorSpace = THREE.SRGBColorSpace;
backgroundTexture.generateMipmaps = false;
backgroundTexture.magFilter = THREE.LinearFilter;
backgroundTexture.minFilter = THREE.LinearFilter;

// 创建自定义着色器材质来精确控制背景色彩
const backgroundGeometry = new THREE.SphereGeometry(500, 32, 32);
const backgroundMaterial = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: backgroundTexture },
    brightness: { value: 1 }, // 降低亮度
    saturation: { value: 1 }, // 降低饱和度
    contrast: { value: 1 }, // 稍微降低对比度
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
    uniform float brightness;
    uniform float saturation;
    uniform float contrast;
    varying vec2 vUv;
    
    vec3 adjustSaturation(vec3 color, float saturation) {
      vec3 luminance = vec3(0.299, 0.587, 0.114);
      float grey = dot(color, luminance);
      return mix(vec3(grey), color, saturation);
    }
    
    void main() {
      vec4 texColor = texture2D(tDiffuse, vUv);
      
      // 调整亮度
      vec3 color = texColor.rgb * brightness;
      
      // 调整饱和度
      color = adjustSaturation(color, saturation);
      
      // 调整对比度
      color = (color - 0.5) * contrast + 0.5;
      
      gl_FragColor = vec4(color, 1.0);
    }
  `,
  side: THREE.BackSide,
  depthWrite: false,
  depthTest: false,
});
const backgroundSphere = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
backgroundSphere.renderOrder = -1; // 确保背景最先渲染
scene.add(backgroundSphere);

// 设置线性雾效
scene.fog = new THREE.Fog(
  new THREE.Color(207 / 255, 201 / 255, 201 / 255), // RGB颜色 (207, 201, 201)
  0.1, // near距离
  500 // far距离
);

// 创建相机
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

// 添加轨道控制器
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// 动画混合器变量
let mixer = null;
let animationActions = [];
let isAnimationPlaying = false;

// 创建地面效果实例
let groundEffect = null;

// 消息监听
window.addEventListener("message", (event) => {
  const { cmd, params } = event.data || {};
  if (cmd === "init" && params) {
    serviceName = params.serviceName || "";
    protectorData = params.protector || [];
    warmData = params.warm || [];
  }
});

// 加载模型并设置控制器
loadModel(scene)
  .then(
    ({
      model,
      boundingBox,
      center,
      size,
      radius,
      mixer: loadedMixer,
      animations,
    }) => {
      // 定义物体向右偏移量
      const sceneOffset = new THREE.Vector3(4, 0, 0); // 向右移动40个单位

      // 只移动模型，不改变中心点和包围盒
      model.position.add(sceneOffset);

      // 保持原始的中心点不变（用于相机和控制器）
      // center, boundingBox 保持原始值

      // 设置动画混合器
      mixer = loadedMixer;

      // 如果有动画，创建动画动作并默认停止播放
      if (mixer && animations && animations.length > 0) {
        // 为每个动画片段创建动作
        animations.forEach((clip) => {
          const action = mixer.clipAction(clip);
          animationActions.push(action);
        });

        isAnimationPlaying = false;
        console.log(
          `动画初始化完成，找到 ${animations.length} 个动画片段，默认停止播放`
        );
      }

      // 遍历模型，设置金属材质属性
      model.traverse((child) => {
        if (child.isMesh && child.material) {
          if (
            child.material.isMeshStandardMaterial ||
            child.material.isMeshPhysicalMaterial
          ) {
            // 设置金属属性
            child.material.envMapIntensity = 2.0; // 环境贴图强度
            child.material.needsUpdate = true;
          }
        }
      });

      // 根据模型包围盒设置相机位置
      // 计算合适的相机距离，确保模型完全可见
      const distance = radius * 6; // 调整倍数以控制相机距离

      // 设置相机位置和朝向（保持原始设置）
      camera.position.set(0, 14, 24);
      camera.lookAt(center); // 朝向原始中心点

      // 设置控制器目标为原始中心点（不跟随物体）
      controls.target.copy(center);
      controls.update();
      console.log(controls, "cameraPosition");

      // 更新相机参数，确保近远平面合适
      camera.near = distance * 0.01;
      camera.far = distance * 100;
      camera.updateProjectionMatrix();

      // 创建地面效果
      const core = { scene: scene };
      groundEffect = new BoxModel(core);

      // 计算地面位置（跟随移动后的物体位置）
      const groundCenter = new THREE.Vector3(
        center.x + sceneOffset.x, // 地面X位置跟随物体移动
        boundingBox.min.y - radius, // 使用包围盒的最低点作为地面Y坐标
        center.z
      );

      // 初始化地面效果
      groundEffect.initModel(groundCenter, radius);

      // 根据模型包围盒设置灯光
      // 环境光提供整体照明
      ambientLight = new THREE.AmbientLight(0xffffff, 1);
      scene.add(ambientLight);

      // 主要平行光
      directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
      // 将平行光放置在移动后的模型的右上前方
      const lightDistance = radius * 3;
      directionalLight.position.set(
        center.x + sceneOffset.x + lightDistance,
        center.y + lightDistance,
        center.z + lightDistance
      );
      // 灯光目标指向移动后的物体位置
      directionalLight.target.position.set(
        center.x + sceneOffset.x,
        center.y,
        center.z
      );

      // 启用阴影
      directionalLight.castShadow = true;
      directionalLight.shadow.mapSize.width = 2048;
      directionalLight.shadow.mapSize.height = 2048;
      directionalLight.shadow.camera.near = 0.5;
      directionalLight.shadow.camera.far = lightDistance * 3;

      // 设置阴影相机的覆盖范围
      const shadowSize = radius * 2;
      directionalLight.shadow.camera.left = -shadowSize;
      directionalLight.shadow.camera.right = shadowSize;
      directionalLight.shadow.camera.top = shadowSize;
      directionalLight.shadow.camera.bottom = -shadowSize;

      scene.add(directionalLight);
      scene.add(directionalLight.target);

      // 添加辅助填充光（跟随移动后的物体）
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
      fillLight.position.set(
        center.x + sceneOffset.x - lightDistance * 0.5,
        center.y + lightDistance * 0.5,
        center.z + lightDistance * 0.5
      );
      scene.add(fillLight);

      console.log("物体向右平移完成:", {
        物体偏移量: sceneOffset,
        物体新位置: model.position,
        原始中心保持: center,
        相机位置: camera.position,
        相机朝向: center,
        控制器目标: controls.target,
        地面位置: groundCenter,
      });
    }
  )
  .catch((error) => {
    console.error("Failed to setup model and controls:", error);
  });

// 创建灯光变量（将在模型加载后设置位置）
let ambientLight, directionalLight;

// 动画循环
function animate(time) {
  requestAnimationFrame(animate);
  controls.update();

  // 更新地面效果动画
  if (groundEffect) {
    groundEffect.update(time * 0.001); // 使用requestAnimationFrame提供的高精度时间戳
  }

  if (mixer && isAnimationPlaying) {
    mixer.update(0.016);
  }
  renderer.render(scene, camera);
}

// 添加点击事件监听器，打印相机位置
renderer.domElement.addEventListener("click", (event) => {
  console.log("=== 当前相机位置信息 ===");
  console.log("相机位置 (Position):", {
    x: camera.position.x.toFixed(3),
    y: camera.position.y.toFixed(3),
    z: camera.position.z.toFixed(3),
  });

  console.log("控制器目标 (Target):", {
    x: controls.target.x.toFixed(3),
    y: controls.target.y.toFixed(3),
    z: controls.target.z.toFixed(3),
  });

  console.log("相机旋转 (Rotation):", {
    x: camera.rotation.x.toFixed(3),
    y: camera.rotation.y.toFixed(3),
    z: camera.rotation.z.toFixed(3),
  });

  // 计算相机到目标的距离
  const distance = camera.position.distanceTo(controls.target);
  console.log("相机距离目标:", distance.toFixed(3));

  console.log("========================");
});

// 添加动画控制按钮事件监听器
document.addEventListener("DOMContentLoaded", () => {
  const playButton = document.getElementById("playButton");
  const resetButton = document.getElementById("resetButton");

  // 播放动画按钮
  if (playButton) {
    playButton.addEventListener("click", () => {
      if (mixer && animationActions.length > 0) {
        if (!isAnimationPlaying) {
          // 开始播放所有动画
          animationActions.forEach((action) => {
            action.play();
          });
          isAnimationPlaying = true;
          console.log("动画开始播放");
        } else {
          // 如果正在播放，则暂停/恢复
          animationActions.forEach((action) => {
            action.paused = !action.paused;
          });
          console.log("动画暂停/恢复");
        }
      } else {
        console.log("没有可播放的动画");
      }
    });
  }

  // 重置动画按钮
  if (resetButton) {
    resetButton.addEventListener("click", () => {
      if (mixer && animationActions.length > 0) {
        // 停止并重置所有动画到初始状态
        animationActions.forEach((action) => {
          action.stop();
          action.reset();
        });
        isAnimationPlaying = false;
        console.log("动画已重置");
      } else {
        console.log("没有可重置的动画");
      }
    });
  }
});

window.addEventListener("resize", () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});

animate();
