"use client";

import { ContactShadows, Float, MeshDistortMaterial, PointMaterial, Points, Sparkles, Sphere, Torus } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const fallbackParticles = Array.from({ length: 42 }, (_, index) => ({
  left: `${9 + ((index * 31) % 82)}%`,
  top: `${8 + ((index * 47) % 78)}%`,
  size: `${2 + (index % 4)}px`,
  delay: `${index * -0.18}s`,
}));

const neuralNodes = [
  { position: [2.45, 0.12, 0.25], color: "#38BDF8", scale: 0.07 },
  { position: [-1.9, -0.48, 0.4], color: "#EC4899", scale: 0.052 },
  { position: [0.62, 1.16, -0.34], color: "#ffffff", scale: 0.04 },
  { position: [-2.46, 0.72, -0.18], color: "#8B5CF6", scale: 0.058 },
  { position: [1.72, -1.04, 0.36], color: "#38BDF8", scale: 0.046 },
] as const;

function canCreateWebGLContext() {
  if (typeof window === "undefined") return false;

  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl")),
    );
  } catch {
    return false;
  }
}

function ParticleField() {
  const pointsRef = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const count = 1250;
    const data = new Float32Array(count * 3);

    for (let index = 0; index < count; index += 1) {
      const radius = 2.2 + Math.random() * 6.8;
      const angle = Math.random() * Math.PI * 2;
      const depth = (Math.random() - 0.5) * 7.2;

      data[index * 3] = Math.cos(angle) * radius;
      data[index * 3 + 1] = (Math.random() - 0.5) * 4.8;
      data[index * 3 + 2] = Math.sin(angle) * radius + depth;
    }

    return data;
  }, []);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    pointsRef.current.rotation.y = clock.elapsedTime * 0.028;
    pointsRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.18) * 0.035;
  });

  return (
    <Points ref={pointsRef} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#dff7ff"
        size={0.018}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

function NeuralOrbit() {
  const orbitRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!orbitRef.current) return;
    orbitRef.current.rotation.y = clock.elapsedTime * 0.12;
    orbitRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.22) * 0.16;
  });

  return (
    <group ref={orbitRef}>
      <Torus args={[2.82, 0.006, 12, 240]} rotation={[Math.PI / 2.16, 0.2, -0.42]}>
        <meshBasicMaterial color="#ffffff" transparent opacity={0.18} blending={THREE.AdditiveBlending} />
      </Torus>
      {neuralNodes.map((node, index) => (
        <Sphere key={`neural-node-${index}`} args={[node.scale, 28, 28]} position={node.position}>
          <meshBasicMaterial color={node.color} transparent opacity={0.86} blending={THREE.AdditiveBlending} />
        </Sphere>
      ))}
    </group>
  );
}

function LanayaCore() {
  const group = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.rotation.y = clock.elapsedTime * 0.18;
    group.current.rotation.z = Math.sin(clock.elapsedTime * 0.36) * 0.08;
  });

  return (
    <group ref={group}>
      <Float speed={1.45} rotationIntensity={0.25} floatIntensity={0.42}>
        <Sphere args={[1.02, 96, 96]}>
          <MeshDistortMaterial
            color="#8B5CF6"
            emissive="#8B5CF6"
            emissiveIntensity={1.42}
            metalness={0.28}
            roughness={0.18}
            clearcoat={0.62}
            clearcoatRoughness={0.18}
            distort={0.18}
            speed={1.65}
          />
        </Sphere>
        <Sphere args={[1.08, 96, 96]}>
          <meshBasicMaterial
            transparent
            color="#38BDF8"
            opacity={0.12}
            blending={THREE.AdditiveBlending}
          />
        </Sphere>
        <Torus args={[1.66, 0.018, 24, 180]} rotation={[Math.PI / 2.28, 0.16, 0]}>
          <meshBasicMaterial color="#38BDF8" transparent opacity={0.9} blending={THREE.AdditiveBlending} />
        </Torus>
        <Torus args={[2.08, 0.012, 24, 180]} rotation={[Math.PI / 2.9, -0.24, 0.72]}>
          <meshBasicMaterial color="#EC4899" transparent opacity={0.68} blending={THREE.AdditiveBlending} />
        </Torus>
        <Torus args={[2.44, 0.009, 16, 180]} rotation={[Math.PI / 2.04, 0.42, -0.5]}>
          <meshBasicMaterial color="#8B5CF6" transparent opacity={0.5} blending={THREE.AdditiveBlending} />
        </Torus>
        <Torus args={[2.96, 0.006, 12, 220]} rotation={[Math.PI / 1.86, -0.58, 0.18]}>
          <meshBasicMaterial color="#ffffff" transparent opacity={0.22} blending={THREE.AdditiveBlending} />
        </Torus>
      </Float>
      <NeuralOrbit />
    </group>
  );
}

function CameraRig() {
  const scrollProgress = useRef(0);

  useEffect(() => {
    const updateScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      scrollProgress.current = scrollable <= 0 ? 0 : window.scrollY / scrollable;
    };

    updateScroll();
    window.addEventListener("scroll", updateScroll, { passive: true });
    return () => window.removeEventListener("scroll", updateScroll);
  }, []);

  useFrame(({ camera, mouse, clock }) => {
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, mouse.x * 0.55, 0.035);
    camera.position.y = THREE.MathUtils.lerp(
      camera.position.y,
      0.08 + mouse.y * 0.25 - scrollProgress.current * 0.34 + Math.sin(clock.elapsedTime * 0.25) * 0.06,
      0.035,
    );
    camera.lookAt(0, 0, 0);
  });

  return null;
}

export default function CosmicScene() {
  const [canRenderWebGL, setCanRenderWebGL] = useState(false);

  useEffect(() => {
    setCanRenderWebGL(canCreateWebGLContext());
  }, []);

  return (
    <div className="cosmic-canvas">
      <div className="premium-scene-shell" aria-hidden="true">
        <span className="cosmic-lens-flare" />
        <span className="orbital-dust orbital-dust-a" />
        <span className="orbital-dust orbital-dust-b" />
        <span className="neural-orbit neural-orbit-a" />
        <span className="neural-orbit neural-orbit-b" />
      </div>
      {canRenderWebGL ? (
        <Canvas
          className="relative z-10"
          camera={{ position: [0, 0.15, 6.2], fov: 48 }}
          dpr={[1, 1.8]}
          gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        >
          <ambientLight intensity={0.35} />
          <pointLight position={[3, 2, 4]} color="#38BDF8" intensity={32} distance={8} />
          <pointLight position={[-4, -2, 3]} color="#EC4899" intensity={20} distance={8} />
          <spotLight position={[0.8, 4.6, 3.6]} angle={0.35} penumbra={0.75} color="#ffffff" intensity={18} distance={10} />
          <LanayaCore />
          <ParticleField />
          <Sparkles count={130} speed={0.18} size={1.45} scale={[7, 4.4, 6.6]} color="#ffffff" opacity={0.45} />
          <ContactShadows
            position={[0, -1.55, 0]}
            opacity={0.28}
            scale={5.2}
            blur={2.8}
            far={3.8}
            color="#38BDF8"
          />
          <CameraRig />
        </Canvas>
      ) : null}
      <div className="celestial-visual" aria-hidden="true">
        <span className="celestial-sphere" />
        <span className="celestial-ring celestial-ring-a" />
        <span className="celestial-ring celestial-ring-b" />
        <span className="celestial-ring celestial-ring-c" />
        <span className="celestial-ring celestial-ring-d" />
        {fallbackParticles.map((particle, index) => (
          <span
            key={`fallback-particle-${index}`}
            className="celestial-particle"
            style={
              {
                "--particle-left": particle.left,
                "--particle-top": particle.top,
                "--particle-size": particle.size,
                "--particle-delay": particle.delay,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,rgba(5,5,16,0.16)_48%,rgba(5,5,16,0.74)_100%)]" />
    </div>
  );
}
