import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

export function loadModel(scene) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();

    // 创建 DRACOLoader 实例
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("./draco/");

    // 将 DRACOLoader 实例设置给 GLTFLoader
    loader.setDRACOLoader(dracoLoader);

    loader.load(
      "./baozha.glb", // 模型路径
      function (gltf) {
        const model = gltf.scene;

        // 计算模型的包围盒
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        const radius = Math.max(size.x, size.y, size.z);

        // 创建动画混合器但不自动播放
        let mixer = null;
        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(model);
          // 不自动播放动画，由外部控制
        }

        // 恢复原始材质，确保模型正常显示
        model.traverse((child) => {
          if (child.isMesh) {
            child.visible = true;
          }
        });

        // 将模型添加到场景
        scene.add(model);

        // 返回模型信息
        resolve({
          model: model,
          boundingBox: box,
          center: center, // 包围盒中心
          size: size, // 包围盒大小
          radius: radius, // 包围盒半径
          mixer: mixer, // 返回动画混合器
          animations: gltf.animations, // 返回动画数据
        });
      },
      function (xhr) {
        console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
      },
      function (error) {
        console.error("加载模型时出错:", error);
        reject(error);
      }
    );
  });
}
