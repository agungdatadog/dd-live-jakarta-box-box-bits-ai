'use client';

import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { MotionValue } from 'motion/react';

const wireMaterial = new THREE.MeshStandardMaterial({ 
  color: '#a855f7', // purple-500
  wireframe: true,
  emissive: '#a855f7',
  emissiveIntensity: 0.8,
  transparent: true,
  opacity: 0.8
});

const solidMaterial = new THREE.MeshStandardMaterial({
  color: '#18181b', // zinc-900
  roughness: 0.7,
  metalness: 0.8
});

const tireMaterial = new THREE.MeshStandardMaterial({
  color: '#09090b', // zinc-950
  roughness: 0.9,
  metalness: 0.1
});

const SolidWireBox = ({ args, position, rotation, scale }: any) => (
  <mesh position={position} rotation={rotation} scale={scale} material={solidMaterial}>
    <boxGeometry args={args} />
    <mesh material={wireMaterial}>
      <boxGeometry args={[args[0]+0.01, args[1]+0.01, args[2]+0.01]} />
    </mesh>
  </mesh>
);

const SolidWireCylinder = ({ args, position, rotation, scale, useTireMaterial = false }: any) => (
  <mesh position={position} rotation={rotation} scale={scale} material={useTireMaterial ? tireMaterial : solidMaterial}>
    <cylinderGeometry args={args} />
    <mesh material={wireMaterial}>
      <cylinderGeometry args={[args[0]+0.01, args[1]+0.01, args[2]+0.01, args[3]]} />
    </mesh>
  </mesh>
);

const SolidWireTorus = ({ args, position, rotation, scale }: any) => (
  <mesh position={position} rotation={rotation} scale={scale} material={solidMaterial}>
    <torusGeometry args={args} />
    <mesh material={wireMaterial}>
      <torusGeometry args={[args[0], args[1]+0.01, args[2], args[3], args[4]]} />
    </mesh>
  </mesh>
);

const SolidWireSphere = ({ args, position, rotation, scale }: any) => (
  <mesh position={position} rotation={rotation} scale={scale} material={solidMaterial}>
    <sphereGeometry args={args} />
    <mesh material={wireMaterial}>
      <sphereGeometry args={[args[0]+0.01, args[1], args[2]]} />
    </mesh>
  </mesh>
);

const SolidWireCone = ({ args, position, rotation, scale }: any) => (
  <mesh position={position} rotation={rotation} scale={scale} material={solidMaterial}>
    <coneGeometry args={args} />
    <mesh material={wireMaterial}>
      <coneGeometry args={[args[0]+0.01, args[1]+0.01, args[2]]} />
    </mesh>
  </mesh>
);

const DogDriver = ({ position }: { position: [number, number, number] }) => (
  <group position={position}>
    {/* Shoulders / Suit */}
    <SolidWireSphere args={[1, 16, 16]} scale={[0.18, 0.15, 0.12]} position={[0, 0.1, -0.05]} />
    {/* Head */}
    <SolidWireSphere args={[0.11, 16, 16]} position={[0, 0.25, 0]} />
    {/* Snout */}
    <SolidWireSphere args={[0.05, 16, 16]} scale={[1, 0.8, 1.5]} position={[0, 0.22, 0.1]} />
    {/* Nose tip */}
    <mesh position={[0, 0.23, 0.18]}>
      <sphereGeometry args={[0.015, 8, 8]} />
      <meshStandardMaterial color="#000" />
    </mesh>
    {/* Ears */}
    <SolidWireCone args={[0.03, 0.12, 16]} position={[0.08, 0.32, -0.02]} rotation={[-0.2, 0, -0.4]} />
    <SolidWireCone args={[0.03, 0.12, 16]} position={[-0.08, 0.32, -0.02]} rotation={[-0.2, 0, 0.4]} />
    {/* Goggles */}
    <mesh position={[0.04, 0.28, 0.09]} rotation={[Math.PI/2, 0, 0.2]}>
      <cylinderGeometry args={[0.03, 0.03, 0.02, 16]} />
      <meshStandardMaterial color="#222" metalness={0.9} roughness={0.1} />
    </mesh>
    <mesh position={[-0.04, 0.28, 0.09]} rotation={[Math.PI/2, 0, -0.2]}>
      <cylinderGeometry args={[0.03, 0.03, 0.02, 16]} />
      <meshStandardMaterial color="#222" metalness={0.9} roughness={0.1} />
    </mesh>
  </group>
);

function CarModel({ scrollProgress }: { scrollProgress: MotionValue<number> }) {
  const groupRef = useRef<THREE.Group>(null);
  const frontWingRef = useRef<THREE.Group>(null);
  const rearWingRef = useRef<THREE.Group>(null);
  const leftWheelsRef = useRef<THREE.Group>(null);
  const rightWheelsRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!scrollProgress) return;
    const offset = scrollProgress.get(); // 0 to 1
    
    // Explode distances based on scroll (reduced for mobile screens)
    const explode = offset * 2;

    if (frontWingRef.current) frontWingRef.current.position.z = explode;
    if (rearWingRef.current) {
        rearWingRef.current.position.z = -explode;
        rearWingRef.current.position.y = explode * 0.5;
    }
    if (leftWheelsRef.current) leftWheelsRef.current.position.x = explode * 0.8;
    if (rightWheelsRef.current) rightWheelsRef.current.position.x = -explode * 0.8;
    if (bodyRef.current) bodyRef.current.position.y = explode * 0.2;
    if (haloRef.current) haloRef.current.position.y = explode * 0.6;

    if (groupRef.current) {
        // Rotate to show off the dissection as user scrolls, plus a slow auto-idle rotation
        groupRef.current.rotation.y = offset * Math.PI * 2 + state.clock.elapsedTime * 0.2; 
        groupRef.current.rotation.x = 0.2 + offset * 0.5;
    }
  });

  return (
    <group ref={groupRef} scale={1.2}>
      {/* Main Body / Chassis */}
      <group ref={bodyRef}>
        {/* Stepped Floor */}
        <SolidWireBox args={[1.4, 0.02, 2.6]} position={[0, -0.15, -0.2]} />
        {/* Front Floor / T-Tray */}
        <SolidWireBox args={[0.6, 0.02, 0.8]} position={[0, -0.15, 1.5]} />
        {/* Rear Diffuser */}
        <SolidWireBox args={[1.0, 0.02, 0.6]} position={[0, -0.08, -1.7]} rotation={[0.15, 0, 0]} />
        
        {/* Nose - smooth cone */}
        <SolidWireCone args={[0.16, 1.4, 32]} position={[0, 0.05, 1.1]} rotation={[Math.PI/2, 0, 0]} />
        
        {/* Cockpit / Monocoque - smooth cylinder */}
        <SolidWireCylinder args={[0.18, 0.25, 1.2, 32]} position={[0, 0.15, -0.2]} rotation={[Math.PI/2, 0, 0]} />
        
        {/* Dog Driver */}
        <DogDriver position={[0, 0.1, 0.1]} />
        
        {/* Engine Cover - tapering smooth cone */}
        <SolidWireCone args={[0.25, 1.4, 32]} position={[0, 0.15, -1.3]} rotation={[-Math.PI/2, 0, 0]} />
        
        {/* Air Hood / Intake Scoop */}
        <SolidWireBox args={[0.18, 0.15, 0.15]} position={[0, 0.45, -0.1]} />
        {/* Airbox Body */}
        <SolidWireCone args={[0.12, 0.8, 32]} position={[0, 0.35, -0.6]} rotation={[-Math.PI/2.1, 0, 0]} />
        
        {/* Shark Fin - thin box */}
        <SolidWireBox args={[0.01, 0.35, 0.9]} position={[0, 0.4, -1.1]} />
        
        {/* Left Sidepod Intake */}
        <SolidWireBox args={[0.25, 0.18, 0.1]} position={[0.35, 0.08, 0.2]} />
        {/* Left Sidepod Body - smooth elongated sphere */}
        <SolidWireSphere args={[1, 32, 32]} scale={[0.35, 0.15, 0.7]} position={[0.35, 0.05, -0.4]} />
        
        {/* Right Sidepod Intake */}
        <SolidWireBox args={[0.25, 0.18, 0.1]} position={[-0.35, 0.08, 0.2]} />
        {/* Right Sidepod Body - smooth elongated sphere */}
        <SolidWireSphere args={[1, 32, 32]} scale={[0.35, 0.15, 0.7]} position={[-0.35, 0.05, -0.4]} />

        {/* Left Bargeboard Complex */}
        <group position={[0.45, 0.0, 0.3]}>
          <SolidWireBox args={[0.02, 0.3, 0.4]} rotation={[0, 0.2, 0]} />
          <SolidWireBox args={[0.02, 0.2, 0.2]} position={[0.1, -0.05, 0.1]} rotation={[0, 0.4, 0]} />
          <SolidWireBox args={[0.15, 0.02, 0.3]} position={[0.05, -0.1, 0]} />
        </group>
        
        {/* Right Bargeboard Complex */}
        <group position={[-0.45, 0.0, 0.3]}>
          <SolidWireBox args={[0.02, 0.3, 0.4]} rotation={[0, -0.2, 0]} />
          <SolidWireBox args={[0.02, 0.2, 0.2]} position={[-0.1, -0.05, 0.1]} rotation={[0, -0.4, 0]} />
          <SolidWireBox args={[0.15, 0.02, 0.3]} position={[-0.05, -0.1, 0]} />
        </group>

        {/* Floor Edge Wings */}
        <SolidWireBox args={[0.1, 0.02, 1.2]} position={[0.65, -0.14, -0.2]} />
        <SolidWireBox args={[0.1, 0.02, 1.2]} position={[-0.65, -0.14, -0.2]} />
      </group>

      {/* Halo / Cockpit */}
      <group ref={haloRef}>
        {/* Ring */}
        <SolidWireTorus args={[0.25, 0.03, 8, 24, Math.PI]} position={[0, 0.35, 0.2]} rotation={[Math.PI/2 - 0.2, 0, 0]} />
        {/* Center Pillar */}
        <SolidWireCylinder args={[0.02, 0.02, 0.2, 8]} position={[0, 0.25, 0.45]} rotation={[0.3, 0, 0]} />
      </group>
      
      {/* Front Wing */}
      <group ref={frontWingRef}>
        {/* Main Plane - smooth airfoil (flattened sphere) */}
        <SolidWireSphere args={[1, 32, 32]} scale={[0.8, 0.015, 0.15]} position={[0, -0.1, 2.0]} />
        {/* Upper Flap 1 */}
        <SolidWireSphere args={[1, 32, 32]} scale={[0.75, 0.01, 0.1]} position={[0, -0.05, 1.9]} rotation={[0.1, 0, 0]} />
        {/* Upper Flap 2 */}
        <SolidWireSphere args={[1, 32, 32]} scale={[0.7, 0.01, 0.08]} position={[0, 0.0, 1.82]} rotation={[0.2, 0, 0]} />
        {/* Left Endplate */}
        <SolidWireBox args={[0.02, 0.25, 0.4]} position={[0.8, 0.02, 1.95]} />
        {/* Right Endplate */}
        <SolidWireBox args={[0.02, 0.25, 0.4]} position={[-0.8, 0.02, 1.95]} />
        {/* Left Dive Plane */}
        <SolidWireSphere args={[1, 16, 16]} scale={[0.08, 0.01, 0.15]} position={[0.85, 0.05, 1.9]} rotation={[0.2, 0, 0.2]} />
        {/* Right Dive Plane */}
        <SolidWireSphere args={[1, 16, 16]} scale={[0.08, 0.01, 0.15]} position={[-0.85, 0.05, 1.9]} rotation={[0.2, 0, -0.2]} />
        {/* Nose Mounts */}
        <SolidWireBox args={[0.01, 0.1, 0.2]} position={[0.1, 0, 1.85]} />
        <SolidWireBox args={[0.01, 0.1, 0.2]} position={[-0.1, 0, 1.85]} />
      </group>

      {/* Rear Wing */}
      <group ref={rearWingRef}>
        {/* Main Plane */}
        <SolidWireSphere args={[1, 32, 32]} scale={[0.5, 0.02, 0.15]} position={[0, 0.5, -1.8]} />
        {/* Upper Flap (DRS) */}
        <SolidWireSphere args={[1, 32, 32]} scale={[0.5, 0.015, 0.1]} position={[0, 0.65, -1.75]} rotation={[0.2, 0, 0]} />
        {/* Left Endplate */}
        <SolidWireBox args={[0.02, 0.45, 0.4]} position={[0.5, 0.55, -1.8]} />
        {/* Right Endplate */}
        <SolidWireBox args={[0.02, 0.45, 0.4]} position={[-0.5, 0.55, -1.8]} />
        {/* Endplate Louvres */}
        {[0.4, 0.5, 0.6].map((y, i) => (
          <group key={i}>
            <SolidWireBox args={[0.03, 0.01, 0.15]} position={[0.5, y, -1.7]} rotation={[0.1, 0, 0]} />
            <SolidWireBox args={[0.03, 0.01, 0.15]} position={[-0.5, y, -1.7]} rotation={[0.1, 0, 0]} />
          </group>
        ))}
        {/* Pillar */}
        <SolidWireBox args={[0.02, 0.5, 0.1]} position={[0, 0.25, -1.7]} />
        {/* T-Wing */}
        <SolidWireSphere args={[1, 16, 16]} scale={[0.3, 0.01, 0.05]} position={[0, 0.35, -1.6]} />
      </group>

      {/* Left Wheels */}
      <group ref={leftWheelsRef}>
        {/* Front Left Tire */}
        <SolidWireCylinder args={[0.32, 0.32, 0.25, 32]} position={[0.8, 0.15, 1.3]} rotation={[0, 0, Math.PI/2]} useTireMaterial={true} />
        {/* Rear Left Tire */}
        <SolidWireCylinder args={[0.35, 0.35, 0.35, 32]} position={[0.8, 0.18, -1.4]} rotation={[0, 0, Math.PI/2]} useTireMaterial={true} />
        {/* Front Left Suspension */}
        <SolidWireCylinder args={[0.015, 0.015, 0.6, 8]} position={[0.4, 0.15, 1.3]} rotation={[0, 0, Math.PI/2]} />
        {/* Rear Left Suspension */}
        <SolidWireCylinder args={[0.015, 0.015, 0.6, 8]} position={[0.4, 0.18, -1.4]} rotation={[0, 0, Math.PI/2]} />
      </group>

      {/* Right Wheels */}
      <group ref={rightWheelsRef}>
        {/* Front Right Tire */}
        <SolidWireCylinder args={[0.32, 0.32, 0.25, 32]} position={[-0.8, 0.15, 1.3]} rotation={[0, 0, Math.PI/2]} useTireMaterial={true} />
        {/* Rear Right Tire */}
        <SolidWireCylinder args={[0.35, 0.35, 0.35, 32]} position={[-0.8, 0.18, -1.4]} rotation={[0, 0, Math.PI/2]} useTireMaterial={true} />
        {/* Front Right Suspension */}
        <SolidWireCylinder args={[0.015, 0.015, 0.6, 8]} position={[-0.4, 0.15, 1.3]} rotation={[0, 0, Math.PI/2]} />
        {/* Rear Right Suspension */}
        <SolidWireCylinder args={[0.015, 0.015, 0.6, 8]} position={[-0.4, 0.18, -1.4]} rotation={[0, 0, Math.PI/2]} />
      </group>
    </group>
  );
}

export default function F1Car3D({ scrollProgress }: { scrollProgress: MotionValue<number> }) {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none opacity-80">
      <Canvas camera={{ position: [0, 2, 12], fov: 45 }}>
        <ambientLight intensity={1} />
        <directionalLight position={[10, 10, 5]} intensity={2} />
        <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
          <CarModel scrollProgress={scrollProgress} />
        </Float>
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}
