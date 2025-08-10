import { Suspense, forwardRef, memo, useImperativeHandle, useRef } from "react";

import { useAvatarChatState } from "@/contexts/AvatarChatContext";
import { Avatar } from "@/pages/call/components/Avatar";
import type { VisemeData } from "@/services/AvatarChatService";
import { Environment, useTexture } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";

interface ThreeCanvasProps {
  avatarId: string;
  modelUrl?: string; // Optional direct model URL from database
  className?: string;
  onAvatarLoaded?: () => void;
}

export interface ThreeCanvasRef {
  getCanvas: () => HTMLCanvasElement | null;
}

// Ready Player Me avatar URLs - shared with old AvatarScene
const AVATAR_URLS: Record<string, string> = {
  "jesse-pollak":
    "https://models.readyplayer.me/68508b34a2d74017fd5c7979.glb?morphTargets=Oculus%20Visemes",
  "creator-mentor":
    "https://models.readyplayer.me/68508b34a2d74017fd5c7979.glb?morphTargets=Oculus%20Visemes",
  "startup-advisor":
    "https://models.readyplayer.me/68508b34a2d74017fd5c7979.glb?morphTargets=Oculus%20Visemes",
  default:
    "https://models.readyplayer.me/68508b34a2d74017fd5c7979.glb?morphTargets=Oculus%20Visemes",
};

const backgroundPath = `/textures/background.png`;

interface SceneContentProps {
  modelUrl: string;
  audio: string | null;
  visemes: VisemeData | null;
  onAvatarLoaded?: () => void;
}

const SceneContent = ({
  modelUrl,
  audio,
  visemes,
  onAvatarLoaded,
}: SceneContentProps) => {
  const texture = useTexture(backgroundPath);
  const { viewport } = useThree();

  return (
    <>
      <Avatar
        model={modelUrl}
        audioUrl={audio}
        visemesData={visemes}
        setAnimationCallback={() => {}}
        position={[0, -5.6, 5]}
        scale={3.5}
        onAvatarLoaded={onAvatarLoaded}
      />
      <Environment preset="sunset" />
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <meshBasicMaterial map={texture} />
      </mesh>
      
      {/* Shadow ground */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -5.7, 0]} 
        receiveShadow
      >
        <planeGeometry args={[50, 50]} />
        <shadowMaterial opacity={0.3} />
      </mesh>
    </>
  );
};

const ThreeCanvas = memo(
  forwardRef<ThreeCanvasRef, ThreeCanvasProps>(
    (
      { avatarId, modelUrl: providedModelUrl, className = "", onAvatarLoaded },
      ref,
    ) => {
      const canvasRef = useRef<HTMLCanvasElement>(null);

      // Use provided modelUrl if available, otherwise fallback to hardcoded URLs
      let modelUrl =
        providedModelUrl ||
        AVATAR_URLS[avatarId as keyof typeof AVATAR_URLS] ||
        AVATAR_URLS.default;

      // Add morphTargets parameter for Ready Player Me URLs if not present
      if (
        modelUrl &&
        modelUrl.includes("readyplayer.me") &&
        !modelUrl.includes("morphTargets")
      ) {
        modelUrl += "?morphTargets=Oculus%20Visemes";
      }

      const { audioUrl: audio, visemes } = useAvatarChatState();

      useImperativeHandle(ref, () => ({
        getCanvas: () => canvasRef.current,
      }));

      return (
        <Canvas
          ref={canvasRef}
          className={className}
          camera={{ position: [0, 0, 8], fov: 42 }}
          shadows
        >
          <ambientLight intensity={0.35} />
          <directionalLight 
            castShadow 
            intensity={0.6} 
            position={[5, 5, 5]}
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-far={50}
            shadow-camera-left={-10}
            shadow-camera-right={10}
            shadow-camera-top={10}
            shadow-camera-bottom={-10}
          />
          <directionalLight intensity={0.3} position={[-5, 3, -5]} />
          <directionalLight intensity={0.15} position={[3, 8, -2]} />
          <directionalLight intensity={0.1} position={[-3, 6, 3]} />
          <directionalLight intensity={0.1} position={[0, -3, 2]} />

          <Suspense fallback={null}>
            <SceneContent
              modelUrl={modelUrl}
              audio={audio}
              visemes={visemes}
              onAvatarLoaded={onAvatarLoaded}
            />
          </Suspense>
        </Canvas>
      );
    },
  ),
);

export default ThreeCanvas;
