import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import * as THREE from "three";
import { useSharedAvatarChat } from "@/contexts/AvatarChatContext";
import { VisemeData } from "@/services/AvatarChatService";
import { useSelector } from "@/store";
import { useAnimations, useFBX, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";

const corresponding: Record<string, string> = {
  A: "viseme_PP", // bilabial (p, b, m)
  B: "viseme_kk", // velar (k, g)
  C: "viseme_DD", // alveolar (t, d, n, l, s, z)
  D: "viseme_aa", // open vowel (a, e, i) - was viseme_AA
  E: "viseme_O", // back vowel (o, w)
  F: "viseme_U", // close back vowel (u)
  G: "viseme_FF", // labiodental (f, v)
  H: "viseme_TH", // dental (th)
  X: "viseme_sil", // silence/pause - was viseme_PP
};

interface AvatarProps {
  model: string;
  audioUrl: string | null;
  visemesData: VisemeData | null;
  setAnimationCallback: (fn: (animation?: string) => void) => void;
  position?: [number, number, number];
  scale?: number;
  onAvatarLoaded?: () => void;
  [key: string]: unknown; // For any additional props
}

function AvatarComponent({
  model,
  audioUrl,
  visemesData,
  setAnimationCallback,
  position = [0, 0, 0],
  scale = 1,
  onAvatarLoaded,
  ...props
}: AvatarProps) {
  const [headFollow] = useState(false);
  const [morphTargetSmoothing] = useState(0.5);
  const [playingAdditionalAnimation, setPlayingAdditionalAnimation] =
    useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (!audioRef.current) {
    audioRef.current = new Audio();
  }
  const lipsync = useMemo(() => visemesData || null, [visemesData]);
  const isAvatarMuted = useSelector((state) => state.session.isAvatarMuted);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { nodes, materials } = useGLTF(model) as any;

  // Call onAvatarLoaded when the model is loaded
  useEffect(() => {
    if (nodes && materials && onAvatarLoaded) {
      onAvatarLoaded();
    }
  }, [nodes, materials, onAvatarLoaded]);

  const { animations: idleFbx } = useFBX("/animations/Idle.fbx");
  const { animations: talkingFbx } = useFBX("/animations/talking.fbx");
  const { animations: greetingFbx } = useFBX("/animations/Greeting.fbx");
  const { animations: danceFbx } = useFBX("/animations/dance.fbx");

  // Function to fix track names by removing mixamorig prefix
  const fixTrackNames = (clip: THREE.AnimationClip) => {
    const fixedClip = clip.clone();
    fixedClip.tracks.forEach(track => {
      // Remove mixamorig prefix from track names
      if (track.name.startsWith('mixamorig')) {
        track.name = track.name.replace('mixamorig', '');
      }
    });
    return fixedClip;
  };

  // Fix the dance animation track names
  const fixedDanceFbx = useMemo(() => fixTrackNames(danceFbx[0]), [danceFbx]);

  // Ensure clip names set only once.
  idleFbx[0].name = "Idle";
  talkingFbx[0].name = "Talking";
  greetingFbx[0].name = "Greeting";
  fixedDanceFbx.name = "Dance";


  const animationClips = useMemo(
    () => [idleFbx[0], talkingFbx[0], greetingFbx[0], fixedDanceFbx],
    [idleFbx, talkingFbx, greetingFbx, fixedDanceFbx],
  );

  const [animation, setAnimation] = useState("Idle");

  const group = useRef<THREE.Group<THREE.Object3DEventMap> | null>(null);
  const { actions } = useAnimations(animationClips, group);

  const { service } = useSharedAvatarChat();

  useFrame(() => {
    const currentAudioTime = service?.getUtterancePlaybackTime() ?? 0;

    const isStreamingAudioPlaying = service?.getState().audioPlaying;
    const isHtmlAudioPlaying =
      audioRef.current && !audioRef.current.paused && !audioRef.current.ended;
    const isAnyAudioPlaying = isStreamingAudioPlaying || isHtmlAudioPlaying;

    // Debug logging for timing issues
    if (isAnyAudioPlaying && lipsync && lipsync.mouthCues.length > 0) {
      const lastCue = lipsync.mouthCues[lipsync.mouthCues.length - 1];
      if (currentAudioTime > lastCue.end + 0.5) {
        // console.warn("[AVATAR] Audio still playing but past last viseme:", {
        //   currentTime: currentAudioTime,
        //   lastVisemeEnd: lastCue.end,
        //   audioPlaying: isAnyAudioPlaying,
        //   visemeCount: lipsync.mouthCues.length,
        // });
      }
    }

    // Default action: smoothly close the mouth on every frame.
    Object.values(corresponding).forEach((value) => {
      const headIdx = nodes.Wolf3D_Head?.morphTargetDictionary?.[value];
      if (headIdx !== undefined && nodes.Wolf3D_Head.morphTargetInfluences) {
        nodes.Wolf3D_Head.morphTargetInfluences[headIdx] = THREE.MathUtils.lerp(
          nodes.Wolf3D_Head.morphTargetInfluences[headIdx],
          0,
          morphTargetSmoothing,
        );
      }

      const teethIdx = nodes.Wolf3D_Teeth?.morphTargetDictionary?.[value];
      if (teethIdx !== undefined && nodes.Wolf3D_Teeth.morphTargetInfluences) {
        nodes.Wolf3D_Teeth.morphTargetInfluences[teethIdx] =
          THREE.MathUtils.lerp(
            nodes.Wolf3D_Teeth.morphTargetInfluences[teethIdx],
            0,
            morphTargetSmoothing,
          );
      }
    });

    if (!isAnyAudioPlaying) {
      if (!playingAdditionalAnimation) {
        setAnimation("Idle");
      }
      return; // Return after the mouth-closing logic has run.
    }

    if (!lipsync) return;

    // If audio is playing, find the correct viseme and override the closing behavior.
    let foundViseme = false;
    for (let i = 0; i < lipsync.mouthCues.length; i++) {
      const mouthCue = lipsync.mouthCues[i];
      if (
        currentAudioTime >= mouthCue.start &&
        currentAudioTime <= mouthCue.end
      ) {
        const targetName = corresponding[mouthCue.value];
        const headIdx = nodes.Wolf3D_Head?.morphTargetDictionary?.[targetName];
        const teethIdx =
          nodes.Wolf3D_Teeth?.morphTargetDictionary?.[targetName];

        if (headIdx !== undefined && nodes.Wolf3D_Head.morphTargetInfluences) {
          nodes.Wolf3D_Head.morphTargetInfluences[headIdx] =
            THREE.MathUtils.lerp(
              nodes.Wolf3D_Head.morphTargetInfluences[headIdx],
              1,
              morphTargetSmoothing,
            );
        }

        if (
          teethIdx !== undefined &&
          nodes.Wolf3D_Teeth.morphTargetInfluences
        ) {
          nodes.Wolf3D_Teeth.morphTargetInfluences[teethIdx] =
            THREE.MathUtils.lerp(
              nodes.Wolf3D_Teeth.morphTargetInfluences[teethIdx],
              1,
              morphTargetSmoothing,
            );
        }

        // Log if morph targets are missing
        if (headIdx === undefined || teethIdx === undefined) {
          console.warn("[AVATAR] Missing morph target for viseme:", {
            targetName,
            headExists: headIdx !== undefined,
            teethExists: teethIdx !== undefined,
            viseme: mouthCue.value,
          });
        }
        foundViseme = true;
        break; // Found the right viseme, exit the loop for this frame.
      }
    }

    // If no viseme found but audio is still playing, use the last viseme
    // This prevents the mouth from closing prematurely
    if (!foundViseme && isAnyAudioPlaying && lipsync.mouthCues.length > 0) {
      const lastCue = lipsync.mouthCues[lipsync.mouthCues.length - 1];
      if (
        currentAudioTime > lastCue.end &&
        currentAudioTime <= lastCue.end + 0.5
      ) {
        // Extend the last viseme for a short period to prevent abrupt closing
        const targetName = corresponding[lastCue.value];
        const headIdx = nodes.Wolf3D_Head?.morphTargetDictionary?.[targetName];
        const teethIdx =
          nodes.Wolf3D_Teeth?.morphTargetDictionary?.[targetName];

        if (headIdx !== undefined && nodes.Wolf3D_Head.morphTargetInfluences) {
          nodes.Wolf3D_Head.morphTargetInfluences[headIdx] =
            THREE.MathUtils.lerp(
              nodes.Wolf3D_Head.morphTargetInfluences[headIdx],
              0.5, // Reduced intensity for extended viseme
              morphTargetSmoothing,
            );
        }

        if (
          teethIdx !== undefined &&
          nodes.Wolf3D_Teeth.morphTargetInfluences
        ) {
          nodes.Wolf3D_Teeth.morphTargetInfluences[teethIdx] =
            THREE.MathUtils.lerp(
              nodes.Wolf3D_Teeth.morphTargetInfluences[teethIdx],
              0.5, // Reduced intensity for extended viseme
              morphTargetSmoothing,
            );
        }
      }
    }
  });

  // Audio + animation lifecycle
  useEffect(() => {
    const audioEl = audioRef.current!;
    const isStreamingAudioPlaying = service?.getState().audioPlaying;
    const isPlayingMusic = service?.getState().isPlayingMusic;

    // Check if music is playing - prioritize dance animation
    if (isPlayingMusic) {
      setAnimation("Dance");
      return;
    }

    // For streaming audio, we don't use the HTML audio element
    if (isStreamingAudioPlaying) {
      setAnimation("Talking");
      return;
    }

    // Legacy path for non-streaming audio
    if (!audioUrl || !visemesData) {
      setAnimation("Idle");
      audioEl.pause();
      return;
    }

    if (audioEl.src !== audioUrl) {
      audioEl.src = audioUrl;
      audioEl.muted = true;
      audioEl.currentTime = 0;
      audioEl.play();
      setAnimation("Talking");
    }

    return () => {
      audioEl.pause();
    };
  }, [audioUrl, visemesData, service?.getState().audioPlaying, service?.getState().isPlayingMusic]);

  // Keep audio element mute state in sync with global setting
  useEffect(() => {
    audioRef.current!.muted = isAvatarMuted;
  }, [isAvatarMuted]);

  const playAnimation = useCallback((anim = "Greeting") => {
    setAnimation("Idle");
    setAnimation(anim);
    setPlayingAdditionalAnimation(true);
    setTimeout(() => {
      setPlayingAdditionalAnimation(false);
      if (
        !audioRef.current ||
        audioRef.current.paused ||
        audioRef.current.ended
      ) {
        setAnimation("Idle");
      } else {
        setAnimation("Talking");
      }
    }, 3000);
  }, []);

  useEffect(() => {
    setAnimationCallback(playAnimation);
  }, [playAnimation, setAnimationCallback]);

  useEffect(() => {
    if (actions && actions[animation]) {
      actions[animation].reset().fadeIn(0.5).play();
    }
    return () => {
      if (actions && actions[animation]) {
        actions[animation].fadeOut(0.5);
      }
    };
  }, [animation, actions]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useFrame((state: any) => {
    if (headFollow && group.current) {
      const head = group.current.getObjectByName("Head");
      head?.lookAt(state.camera.position);
    }
  });

  return (
    <group
      {...props}
      dispose={null}
      ref={group}
      position={position}
      scale={scale}
    >
      {nodes.Hips && <primitive object={nodes.Hips} />}
      {nodes.Wolf3D_Body && (
        <skinnedMesh
          geometry={nodes.Wolf3D_Body.geometry}
          material={materials.Wolf3D_Body}
          skeleton={nodes.Wolf3D_Body.skeleton}
        />
      )}
      {nodes.Wolf3D_Outfit_Bottom && (
        <skinnedMesh
          geometry={nodes.Wolf3D_Outfit_Bottom.geometry}
          material={materials.Wolf3D_Outfit_Bottom}
          skeleton={nodes.Wolf3D_Outfit_Bottom.skeleton}
        />
      )}
      {nodes.Wolf3D_Outfit_Footwear && (
        <skinnedMesh
          geometry={nodes.Wolf3D_Outfit_Footwear.geometry}
          material={materials.Wolf3D_Outfit_Footwear}
          skeleton={nodes.Wolf3D_Outfit_Footwear.skeleton}
        />
      )}
      {nodes.Wolf3D_Outfit_Top && (
        <skinnedMesh
          geometry={nodes.Wolf3D_Outfit_Top.geometry}
          material={materials.Wolf3D_Outfit_Top}
          skeleton={nodes.Wolf3D_Outfit_Top.skeleton}
        />
      )}
      {nodes.Wolf3D_Hair && (
        <skinnedMesh
          geometry={nodes.Wolf3D_Hair.geometry}
          material={materials.Wolf3D_Hair}
          skeleton={nodes.Wolf3D_Hair.skeleton}
        />
      )}
      {nodes.EyeLeft && (
        <skinnedMesh
          name="EyeLeft"
          geometry={nodes.EyeLeft.geometry}
          material={materials.Wolf3D_Eye}
          skeleton={nodes.EyeLeft.skeleton}
          morphTargetDictionary={nodes.EyeLeft.morphTargetDictionary}
          morphTargetInfluences={nodes.EyeLeft.morphTargetInfluences}
        />
      )}
      {nodes.EyeRight && (
        <skinnedMesh
          name="EyeRight"
          geometry={nodes.EyeRight.geometry}
          material={materials.Wolf3D_Eye}
          skeleton={nodes.EyeRight.skeleton}
          morphTargetDictionary={nodes.EyeRight.morphTargetDictionary}
          morphTargetInfluences={nodes.EyeRight.morphTargetInfluences}
        />
      )}
      {nodes.Wolf3D_Head && (
        <skinnedMesh
          name="Wolf3D_Head"
          geometry={nodes.Wolf3D_Head.geometry}
          material={materials.Wolf3D_Skin}
          skeleton={nodes.Wolf3D_Head.skeleton}
          morphTargetDictionary={nodes.Wolf3D_Head.morphTargetDictionary}
          morphTargetInfluences={nodes.Wolf3D_Head.morphTargetInfluences}
        />
      )}
      {nodes.Wolf3D_Teeth && (
        <skinnedMesh
          name="Wolf3D_Teeth"
          geometry={nodes.Wolf3D_Teeth.geometry}
          material={materials.Wolf3D_Teeth}
          skeleton={nodes.Wolf3D_Teeth.skeleton}
          morphTargetDictionary={nodes.Wolf3D_Teeth.morphTargetDictionary}
          morphTargetInfluences={nodes.Wolf3D_Teeth.morphTargetInfluences}
        />
      )}

      {nodes.Wolf3D_Headwear && (
        <skinnedMesh
          name="Wolf3D_Headwear"
          geometry={nodes.Wolf3D_Headwear.geometry}
          material={materials.Wolf3D_Headwear}
          skeleton={nodes.Wolf3D_Headwear.skeleton}
          morphTargetDictionary={nodes.Wolf3D_Headwear.morphTargetDictionary}
          morphTargetInfluences={nodes.Wolf3D_Headwear.morphTargetInfluences}
        />
      )}
      {nodes.Wolf3D_Glasses && (
        <skinnedMesh
          name="Wolf3D_Glasses"
          geometry={nodes.Wolf3D_Glasses.geometry}
          material={materials.Wolf3D_Glasses}
          skeleton={nodes.Wolf3D_Glasses.skeleton}
          morphTargetDictionary={nodes.Wolf3D_Glasses.morphTargetDictionary}
          morphTargetInfluences={nodes.Wolf3D_Glasses.morphTargetInfluences}
        />
      )}
    </group>
  );
}

// silence unused param lint
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
(useGLTF as any).preload = (_model: string) => {};

export const Avatar = memo(
  AvatarComponent,
  (prev, next) =>
    prev.model === next.model &&
    prev.audioUrl === next.audioUrl &&
    prev.visemesData === next.visemesData,
);
