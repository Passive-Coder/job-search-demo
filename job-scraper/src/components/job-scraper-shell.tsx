"use client";

/* eslint-disable @next/next/no-img-element */

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import * as THREE from "three";
import { type FormEvent, useEffect, useRef, useState } from "react";

import {
  ALL_ROLE_VALUE,
  SOFTWARE_ROLES,
  type RoleFilterValue,
} from "@/lib/jobs/roles";
import type { JobCard, ScrapeSummary } from "@/lib/jobs/types";

gsap.registerPlugin(ScrollTrigger);

type JobsResponse = {
  items: JobCard[];
  meta: {
    total: number;
    lastSeenAt: string | null;
    scrape: ScrapeSummary | null;
  };
};

type ThreeSceneState = {
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  suitcaseGroup: THREE.Group;
  lidPivot: THREE.Group;
  dispose: () => void;
};

const RESULT_LIMIT = 100;
const CASE_RATIO = 1.2;

function formatRelative(value: string | null) {
  if (!value) {
    return "freshly indexed";
  }

  const date = new Date(value);
  const diffMs = date.getTime() - Date.now();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const formatter = new Intl.RelativeTimeFormat("en", {
    numeric: "auto",
  });

  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour");
  }

  return formatter.format(Math.round(diffHours / 24), "day");
}

function formatDuration(value: number) {
  if (value < 1000) {
    return `${value}ms`;
  }

  return `${(value / 1000).toFixed(1)}s`;
}

function getInitials(value: string) {
  return value
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function humanizeError(message: string) {
  if (/vector|index|chroma/i.test(message)) {
    return "The Chroma job index is unavailable. Check the Chroma env vars and retry.";
  }

  if (/timed out|timeout/i.test(message)) {
    return "Live scraping took too long. Retry the search or use the scrape button again.";
  }

  return message;
}

function createRoundedRectShape(width: number, height: number, radius: number) {
  const x = -width / 2;
  const y = -height / 2;
  const shape = new THREE.Shape();

  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);

  return shape;
}

function createRoundedCaseGeometry(
  width: number,
  height: number,
  depth: number,
  radius: number,
) {
  const geometry = new THREE.ExtrudeGeometry(createRoundedRectShape(width, height, radius), {
    depth,
    bevelEnabled: false,
    curveSegments: 18,
    steps: 1,
  });

  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();

  return geometry;
}

function createLeatherTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;

  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  const gradient = context.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, "#6d2b1d");
  gradient.addColorStop(0.35, "#4f1b12");
  gradient.addColorStop(0.7, "#34100b");
  gradient.addColorStop(1, "#240907");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);

  for (let index = 0; index < 5000; index += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const radius = 0.6 + Math.random() * 2.4;
    const alpha = 0.04 + Math.random() * 0.08;

    context.fillStyle = `rgba(255,235,208,${alpha})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  for (let index = 0; index < 7000; index += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const width = 2 + Math.random() * 6;
    const height = 1 + Math.random() * 3;
    const alpha = 0.02 + Math.random() * 0.05;

    context.fillStyle = `rgba(20,8,5,${alpha})`;
    context.beginPath();
    context.ellipse(x, y, width, height, Math.random() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.4, 2.4);

  return texture;
}

function disposeThreeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;

    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    if (!mesh.material) {
      return;
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    for (const material of materials) {
      const texturedMaterial = material as THREE.Material & {
        map?: THREE.Texture | null;
      };

      if (texturedMaterial.map) {
        texturedMaterial.map.dispose();
      }

      material.dispose();
    }
  });
}

function buildSuitcaseScene(mountNode: HTMLDivElement, hostNode: HTMLDivElement): ThreeSceneState {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(0, 0.45, 11.8);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  mountNode.appendChild(renderer.domElement);

  const suitcaseGroup = new THREE.Group();
  suitcaseGroup.rotation.x = -0.08;
  scene.add(suitcaseGroup);

  const leatherTexture = createLeatherTexture();
  const leatherMaterial = new THREE.MeshPhysicalMaterial({
    color: "#4e1a12",
    map: leatherTexture,
    roughness: 0.95,
    metalness: 0.08,
    clearcoat: 0.18,
    clearcoatRoughness: 0.82,
  });
  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: "#2a0c08",
    roughness: 0.82,
    metalness: 0.16,
  });
  const brassMaterial = new THREE.MeshStandardMaterial({
    color: "#c7a15c",
    roughness: 0.34,
    metalness: 0.88,
  });
  const liningMaterial = new THREE.MeshStandardMaterial({
    color: "#17110f",
    roughness: 1,
    metalness: 0.04,
  });

  const caseWidth = 9.6;
  const caseHeight = 7.8;
  const caseDepth = 1.08;
  const caseRadius = 0.38;
  const lidDepth = 0.46;

  const bodyGeometry = createRoundedCaseGeometry(
    caseWidth,
    caseHeight,
    caseDepth,
    caseRadius,
  );
  const lidGeometry = createRoundedCaseGeometry(
    caseWidth,
    caseHeight,
    lidDepth,
    caseRadius,
  );
  const interiorPanelGeometry = createRoundedCaseGeometry(
    caseWidth - 0.85,
    caseHeight - 0.85,
    0.14,
    0.28,
  );

  const bodyMesh = new THREE.Mesh(bodyGeometry, leatherMaterial);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.position.z = -0.12;
  suitcaseGroup.add(bodyMesh);

  const bodyLip = new THREE.Mesh(
    createRoundedCaseGeometry(caseWidth - 0.35, caseHeight - 0.35, 0.12, 0.32),
    edgeMaterial,
  );
  bodyLip.castShadow = true;
  bodyLip.position.z = caseDepth / 2 - 0.08;
  suitcaseGroup.add(bodyLip);

  const interiorPanel = new THREE.Mesh(interiorPanelGeometry, liningMaterial);
  interiorPanel.receiveShadow = true;
  interiorPanel.position.z = caseDepth / 2 - 0.03;
  suitcaseGroup.add(interiorPanel);

  const innerFrame = new THREE.Mesh(
    createRoundedCaseGeometry(caseWidth - 0.95, caseHeight - 0.95, 0.06, 0.26),
    new THREE.MeshStandardMaterial({
      color: "#2b201c",
      roughness: 0.96,
      metalness: 0.03,
    }),
  );
  innerFrame.position.z = caseDepth / 2 + 0.03;
  suitcaseGroup.add(innerFrame);

  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, -caseHeight / 2 + 0.12, caseDepth / 2 + lidDepth / 2 - 0.05);
  suitcaseGroup.add(lidPivot);

  const lidMesh = new THREE.Mesh(lidGeometry, leatherMaterial.clone());
  lidMesh.castShadow = true;
  lidMesh.receiveShadow = true;
  lidMesh.position.y = caseHeight / 2 - 0.12;
  lidPivot.add(lidMesh);

  const lidInnerPanel = new THREE.Mesh(
    createRoundedCaseGeometry(caseWidth - 0.85, caseHeight - 0.85, 0.08, 0.28),
    new THREE.MeshStandardMaterial({
      color: "#211613",
      roughness: 1,
      metalness: 0.04,
    }),
  );
  lidInnerPanel.position.set(0, caseHeight / 2 - 0.12, -lidDepth / 2 + 0.07);
  lidPivot.add(lidInnerPanel);

  const handleGroup = new THREE.Group();
  handleGroup.position.set(0, caseHeight / 2 - 0.08, lidDepth / 2 + 0.16);
  lidPivot.add(handleGroup);

  const handleSupportGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.42, 18);
  const leftSupport = new THREE.Mesh(handleSupportGeometry, brassMaterial);
  leftSupport.position.set(-1.45, 0.08, 0);
  leftSupport.castShadow = true;
  handleGroup.add(leftSupport);

  const rightSupport = leftSupport.clone();
  rightSupport.position.x = 1.45;
  handleGroup.add(rightSupport);

  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.6, 0.12, 0),
    new THREE.Vector3(-1.2, 0.92, 0.02),
    new THREE.Vector3(0, 1.3, 0.04),
    new THREE.Vector3(1.2, 0.92, 0.02),
    new THREE.Vector3(1.6, 0.12, 0),
  ]);
  const handleTube = new THREE.Mesh(
    new THREE.TubeGeometry(handleCurve, 36, 0.18, 18, false),
    new THREE.MeshStandardMaterial({
      color: "#522017",
      roughness: 0.88,
      metalness: 0.08,
    }),
  );
  handleTube.castShadow = true;
  handleGroup.add(handleTube);

  const hingePrototype = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.28, 0.24),
    brassMaterial,
  );
  hingePrototype.castShadow = true;
  hingePrototype.receiveShadow = true;

  for (const x of [-2.5, 0, 2.5]) {
    const hinge = hingePrototype.clone();
    hinge.position.set(x, -caseHeight / 2 + 0.12, caseDepth / 2 + 0.1);
    suitcaseGroup.add(hinge);
  }

  const footGeometry = new THREE.SphereGeometry(0.09, 20, 20);
  const leftFoot = new THREE.Mesh(footGeometry, brassMaterial);
  leftFoot.position.set(-caseWidth / 2 + 0.45, -caseHeight / 2 - 0.08, -0.2);
  suitcaseGroup.add(leftFoot);

  const rightFoot = leftFoot.clone();
  rightFoot.position.x = caseWidth / 2 - 0.45;
  suitcaseGroup.add(rightFoot);

  const ambientLight = new THREE.AmbientLight("#f7e4c7", 1.4);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight("#ffe7bd", 1.75);
  keyLight.position.set(-5, 5, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 1024;
  keyLight.shadow.mapSize.height = 1024;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight("#b57d5b", 0.8);
  fillLight.position.set(5, 1.5, 5);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight("#ffcf8f", 2.3, 26, 2);
  rimLight.position.set(0, 2.5, 3.5);
  scene.add(rimLight);

  let width = 0;
  let height = 0;
  let frameId = 0;

  const render = () => {
    const nextWidth = Math.max(hostNode.clientWidth, 1);
    const nextHeight = Math.max(hostNode.clientHeight, 1);

    if (nextWidth !== width || nextHeight !== height) {
      width = nextWidth;
      height = nextHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    camera.lookAt(0, 0.15, 0);
    renderer.render(scene, camera);
    frameId = window.requestAnimationFrame(render);
  };

  render();

  return {
    camera,
    renderer,
    suitcaseGroup,
    lidPivot,
    dispose: () => {
      window.cancelAnimationFrame(frameId);
      disposeThreeObject(scene);
      renderer.dispose();

      if (leatherTexture) {
        leatherTexture.dispose();
      }

      mountNode.replaceChildren();
    },
  };
}

export function JobScraperShell() {
  const [query, setQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [submittedLocation, setSubmittedLocation] = useState("");
  const [selectedRole, setSelectedRole] = useState<RoleFilterValue>(ALL_ROLE_VALUE);
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [total, setTotal] = useState(0);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [scrapeSummary, setScrapeSummary] = useState<ScrapeSummary | null>(null);
  const [requestNonce, setRequestNonce] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isScraping, setIsScraping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shellRef = useRef<HTMLDivElement | null>(null);
  const scrollSceneRef = useRef<HTMLDivElement | null>(null);
  const pinStageRef = useRef<HTMLDivElement | null>(null);
  const suitcaseFrameRef = useRef<HTMLDivElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const contentDeckRef = useRef<HTMLDivElement | null>(null);
  const searchClusterRef = useRef<HTMLDivElement | null>(null);
  const trayRef = useRef<HTMLDivElement | null>(null);
  const caseShadowRef = useRef<HTMLDivElement | null>(null);
  const scrollHintRef = useRef<HTMLDivElement | null>(null);
  const forceScrapeRef = useRef(false);
  const threeSceneRef = useRef<ThreeSceneState | null>(null);

  const executeSearch = (nextRole = selectedRole, nextForceScrape = true) => {
    setSelectedRole(nextRole);
    setSubmittedQuery(query.trim());
    setSubmittedLocation(locationQuery.trim());
    forceScrapeRef.current = nextForceScrape;
    setRequestNonce((value) => value + 1);
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    executeSearch();
  };

  useEffect(() => {
    if (!canvasHostRef.current || !suitcaseFrameRef.current) {
      return;
    }

    const threeScene = buildSuitcaseScene(canvasHostRef.current, suitcaseFrameRef.current);
    threeSceneRef.current = threeScene;

    return () => {
      threeSceneRef.current = null;
      threeScene.dispose();
    };
  }, []);

  useEffect(() => {
    if (!threeSceneRef.current) {
      return;
    }

    const context = gsap.context(() => {
      const threeScene = threeSceneRef.current;

      if (!threeScene) {
        return;
      }

      gsap.set(suitcaseFrameRef.current, {
        top: "50%",
        left: "50%",
        width: `min(90vw, calc(90vh * ${CASE_RATIO}))`,
        height: `min(90vh, calc(90vw / ${CASE_RATIO}))`,
        xPercent: -50,
        yPercent: -50,
        borderRadius: 44,
      });
      gsap.set(contentDeckRef.current, {
        top: 28,
        right: 28,
        bottom: 28,
        left: 28,
        borderRadius: 32,
        autoAlpha: 0,
        scale: 0.95,
      });
      gsap.set(searchClusterRef.current, {
        autoAlpha: 0,
        y: 22,
      });
      gsap.set(trayRef.current, {
        autoAlpha: 0,
        y: 34,
      });
      gsap.set(scrollHintRef.current, {
        autoAlpha: 1,
        y: 0,
      });
      gsap.set(caseShadowRef.current, {
        scale: 0.86,
        autoAlpha: 0.58,
      });
      gsap.set(threeScene.lidPivot.rotation, {
        x: 0,
      });
      gsap.set(threeScene.suitcaseGroup.rotation, {
        x: -0.08,
        y: 0,
        z: 0,
      });
      gsap.set(threeScene.camera.position, {
        x: 0,
        y: 0.45,
        z: 11.8,
      });

      const timeline = gsap.timeline({
        defaults: {
          ease: "none",
        },
        scrollTrigger: {
          trigger: scrollSceneRef.current,
          pin: pinStageRef.current,
          start: "top top",
          end: "+=235%",
          scrub: 1,
          anticipatePin: 1,
        },
      });

      timeline
        .to(
          ".scene-orb",
          {
            yPercent: -10,
            scale: 1.04,
            stagger: 0.08,
            duration: 0.18,
          },
          0,
        )
        .to(
          caseShadowRef.current,
          {
            scale: 1.08,
            autoAlpha: 0.92,
            duration: 0.2,
          },
          0,
        )
        .to(
          scrollHintRef.current,
          {
            autoAlpha: 0,
            y: -14,
            duration: 0.12,
          },
          0.06,
        )
        .to(
          threeScene.lidPivot.rotation,
          {
            x: -Math.PI / 2,
            duration: 0.36,
          },
          0.08,
        )
        .to(
          threeScene.suitcaseGroup.rotation,
          {
            x: -0.02,
            duration: 0.32,
          },
          0.1,
        )
        .to(
          threeScene.camera.position,
          {
            y: 1.1,
            z: 9.1,
            duration: 0.28,
          },
          0.24,
        )
        .to(
          suitcaseFrameRef.current,
          {
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            xPercent: 0,
            yPercent: 0,
            borderRadius: 0,
            duration: 0.42,
            ease: "power3.inOut",
          },
          0.34,
        )
        .to(
          threeScene.camera.position,
          {
            y: 1.95,
            z: 6.55,
            duration: 0.4,
          },
          0.38,
        )
        .to(
          contentDeckRef.current,
          {
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            borderRadius: 0,
            duration: 0.32,
          },
          0.48,
        )
        .to(
          contentDeckRef.current,
          {
            autoAlpha: 1,
            scale: 1,
            duration: 0.16,
          },
          0.56,
        )
        .to(
          searchClusterRef.current,
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.14,
          },
          0.64,
        )
        .to(
          trayRef.current,
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.18,
          },
          0.7,
        );
    }, shellRef);

    return () => context.revert();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      limit: String(RESULT_LIMIT),
    });
    const shouldScrape =
      forceScrapeRef.current ||
      Boolean(submittedQuery) ||
      Boolean(submittedLocation) ||
      selectedRole !== ALL_ROLE_VALUE ||
      requestNonce > 1;

    if (submittedQuery) {
      params.set("query", submittedQuery);
    }

    if (submittedLocation) {
      params.set("location", submittedLocation);
    }

    if (selectedRole !== ALL_ROLE_VALUE) {
      params.set("role", selectedRole);
    }

    if (shouldScrape) {
      params.set("scrape", "1");
    }

    queueMicrotask(() => {
      if (controller.signal.aborted) {
        return;
      }

      setIsLoading(true);
      setIsScraping(shouldScrape);
      setError(null);
    });

    fetch(`/api/jobs?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Unable to load jobs.");
        }

        return (await response.json()) as JobsResponse;
      })
      .then((payload) => {
        setJobs(payload.items);
        setTotal(payload.meta.total);
        setLastSeenAt(payload.meta.lastSeenAt);
        setScrapeSummary(payload.meta.scrape);
      })
      .catch((requestError: Error) => {
        if (controller.signal.aborted) {
          return;
        }

        setError(humanizeError(requestError.message));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsScraping(false);
          forceScrapeRef.current = false;
        }
      });

    return () => controller.abort();
  }, [requestNonce, selectedRole, submittedLocation, submittedQuery]);

  useEffect(() => {
    if (!trayRef.current) {
      return;
    }

    const cards = trayRef.current.querySelectorAll("[data-job-card]");

    if (!cards.length) {
      return;
    }

    gsap.fromTo(
      cards,
      {
        autoAlpha: 0,
        y: 42,
        rotateX: -12,
      },
      {
        autoAlpha: 1,
        y: 0,
        rotateX: 0,
        duration: 0.52,
        stagger: 0.03,
        ease: "power3.out",
      },
    );
  }, [jobs]);

  return (
    <div
      ref={shellRef}
      className="relative min-h-screen overflow-x-clip bg-[var(--background)]"
    >
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="scene-orb absolute left-[-12rem] top-[2%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,_rgba(240,190,107,0.34),_transparent_66%)] blur-3xl" />
        <div className="scene-orb absolute right-[-9rem] top-[14%] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,_rgba(255,234,196,0.58),_transparent_70%)] blur-3xl" />
        <div className="scene-orb absolute bottom-[10%] left-[8%] h-[22rem] w-[22rem] rounded-full bg-[radial-gradient(circle,_rgba(122,171,151,0.18),_transparent_72%)] blur-3xl" />
        <div className="scene-orb absolute bottom-[-5rem] right-[10%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,_rgba(240,174,91,0.24),_transparent_72%)] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(128,98,63,0.05)_1px,transparent_1px),linear-gradient(180deg,rgba(128,98,63,0.05)_1px,transparent_1px)] bg-[size:56px_56px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.92),_transparent_48%)]" />
      </div>

      <section
        ref={scrollSceneRef}
        className="relative h-[255vh]"
      >
        <div
          ref={pinStageRef}
          className="relative h-screen overflow-hidden"
        >
          <div className="absolute inset-0">
            <div className="relative h-full [perspective:3200px]">
              <div
                ref={caseShadowRef}
                className="pointer-events-none absolute left-1/2 top-[82%] h-36 w-[74vw] max-w-[62rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,_rgba(22,10,7,0.72),_rgba(22,10,7,0.38)_36%,_transparent_78%)] blur-3xl"
              />

              <div
                ref={suitcaseFrameRef}
                className="absolute overflow-hidden will-change-transform"
                style={{
                  top: "50%",
                  left: "50%",
                  width: `min(90vw, calc(90vh * ${CASE_RATIO}))`,
                  height: `min(90vh, calc(90vw / ${CASE_RATIO}))`,
                  borderRadius: 44,
                }}
              >
                <div
                  ref={canvasHostRef}
                  className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.1),_transparent_34%),linear-gradient(180deg,rgba(77,36,27,0.06),rgba(16,10,8,0.12))]"
                />

                <div
                  ref={scrollHintRef}
                  className="pointer-events-none absolute bottom-[7%] left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-3 rounded-full border border-[rgba(255,239,214,0.16)] bg-[rgba(24,14,12,0.28)] px-5 py-3 text-center text-[#f3dfc7] shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur-md"
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.34em]">
                    Scroll To Open The Suitcase
                  </span>
                  <span className="h-7 w-px bg-[linear-gradient(180deg,rgba(255,239,214,0.76),transparent)]" />
                </div>

                <div
                  ref={contentDeckRef}
                  className="absolute z-20 flex flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(18,13,12,0.72),rgba(8,6,6,0.96))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  style={{
                    top: 28,
                    right: 28,
                    bottom: 28,
                    left: 28,
                    borderRadius: 32,
                  }}
                >
                  <div className="flex h-full w-full flex-col">
                    <div
                      ref={searchClusterRef}
                      className="relative z-10 border-b border-[rgba(255,239,214,0.12)] bg-[rgba(20,15,13,0.58)] backdrop-blur-2xl"
                      style={{
                        paddingInline: "clamp(16px, 2.2vw, 34px)",
                        paddingBlock: "clamp(14px, 1.8vh, 24px)",
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3 text-[#d9c09d]">
                          <div className="rounded-full border border-[rgba(255,239,214,0.12)] bg-[rgba(255,248,235,0.06)] px-4 py-2 text-[11px] uppercase tracking-[0.28em]">
                            {total.toLocaleString()} indexed
                          </div>
                          <div className="rounded-full border border-[rgba(255,239,214,0.12)] bg-[rgba(255,248,235,0.06)] px-4 py-2 text-[11px] uppercase tracking-[0.28em]">
                            {formatRelative(lastSeenAt)}
                          </div>
                          {scrapeSummary ? (
                            <div className="rounded-full border border-[rgba(255,239,214,0.12)] bg-[rgba(255,248,235,0.06)] px-4 py-2 text-[11px] uppercase tracking-[0.28em]">
                              scraped {scrapeSummary.fetched.toLocaleString()} in {formatDuration(scrapeSummary.durationMs)}
                            </div>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => executeSearch(selectedRole, true)}
                          disabled={isLoading || isScraping}
                          className="rounded-full border border-[rgba(234,175,96,0.46)] bg-[rgba(225,161,76,0.14)] px-5 py-3 text-sm font-semibold text-[#f7d8a8] shadow-[0_16px_36px_rgba(0,0,0,0.22)] transition duration-300 hover:border-[rgba(245,190,112,0.7)] hover:bg-[rgba(225,161,76,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isScraping ? "Scraping LinkedIn + Unstop..." : "Scrape LinkedIn + Unstop"}
                        </button>
                      </div>

                      <form
                        onSubmit={handleSearchSubmit}
                        className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(240px,0.75fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.75fr)_auto]"
                      >
                        <label className="group relative block w-full">
                          <span className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-2xl text-[rgba(85,63,39,0.48)] transition-transform duration-300 group-focus-within:scale-110">
                            /
                          </span>
                          <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search role, stack, company, or keyword"
                            className="w-full rounded-full border border-[rgba(228,210,182,0.26)] bg-[rgba(255,251,245,0.96)] pl-16 pr-6 text-base font-medium text-[var(--ink)] shadow-[0_28px_70px_rgba(6,4,2,0.24)] outline-none transition duration-300 placeholder:text-[rgba(85,63,39,0.52)] focus:border-[rgba(234,175,96,0.62)] focus:shadow-[0_36px_90px_rgba(6,4,2,0.28)] sm:text-lg"
                            style={{
                              height: "clamp(58px, 7vh, 78px)",
                            }}
                          />
                        </label>

                        <label className="group relative block w-full">
                          <span className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-sm uppercase tracking-[0.24em] text-[rgba(85,63,39,0.56)]">
                            LOC
                          </span>
                          <input
                            value={locationQuery}
                            onChange={(event) => setLocationQuery(event.target.value)}
                            placeholder="Location or Remote"
                            className="w-full rounded-full border border-[rgba(228,210,182,0.26)] bg-[rgba(255,251,245,0.96)] pl-20 pr-6 text-base font-medium text-[var(--ink)] shadow-[0_28px_70px_rgba(6,4,2,0.24)] outline-none transition duration-300 placeholder:text-[rgba(85,63,39,0.52)] focus:border-[rgba(234,175,96,0.62)] focus:shadow-[0_36px_90px_rgba(6,4,2,0.28)] sm:text-lg"
                            style={{
                              height: "clamp(58px, 7vh, 78px)",
                            }}
                          />
                        </label>

                        <button
                          type="submit"
                          className="flex h-[clamp(58px,7vh,78px)] items-center justify-center rounded-full border border-[rgba(234,175,96,0.46)] bg-[linear-gradient(180deg,#d59a4e,#b5722c)] px-8 text-base font-semibold text-white shadow-[0_24px_48px_rgba(0,0,0,0.22)] transition duration-300 hover:translate-y-[-1px] hover:shadow-[0_30px_56px_rgba(0,0,0,0.28)] md:col-span-2 xl:col-span-1"
                        >
                          Search
                        </button>
                      </form>

                      <div
                        className="mt-4 flex flex-wrap"
                        style={{
                          gap: "clamp(10px, 0.9vw, 16px)",
                        }}
                      >
                        {SOFTWARE_ROLES.map((role) => {
                          const active = selectedRole === role.id;

                          return (
                            <button
                              key={role.id}
                              type="button"
                              onClick={() => {
                                const nextRole =
                                  selectedRole === role.id ? ALL_ROLE_VALUE : role.id;
                                executeSearch(nextRole, true);
                              }}
                              className={`rounded-full border px-4 py-2.5 text-sm font-medium transition duration-300 ${
                                active
                                  ? "border-transparent bg-[var(--accent)] text-white shadow-[0_18px_40px_rgba(201,138,58,0.34)]"
                                  : "border-[rgba(255,236,208,0.16)] bg-[rgba(255,247,233,0.96)] text-[var(--ink)] shadow-[0_12px_28px_rgba(6,4,2,0.16)] hover:-translate-y-0.5 hover:border-[rgba(201,138,58,0.55)]"
                              }`}
                            >
                              {role.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div
                      ref={trayRef}
                      className="min-h-0 flex-1 overflow-y-auto"
                      style={{
                        paddingInline: "clamp(16px, 2.2vw, 34px)",
                        paddingTop: "clamp(18px, 2vh, 26px)",
                        paddingBottom: "clamp(22px, 2.8vh, 34px)",
                      }}
                    >
                      {error ? (
                        <div className="mb-5 rounded-[22px] border border-[rgba(255,170,144,0.26)] bg-[rgba(122,40,23,0.24)] px-4 py-3 text-sm text-[#ffd6c9]">
                          {error}
                        </div>
                      ) : null}

                      {isLoading && jobs.length === 0 ? (
                        <div
                          className="grid"
                          style={{
                            gap: "clamp(14px, 1.2vw, 22px)",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
                          }}
                        >
                          {Array.from({ length: 9 }, (_, index) => (
                            <div
                              key={index}
                              className="h-56 animate-pulse rounded-[24px] border border-[rgba(255,239,214,0.1)] bg-[rgba(255,251,245,0.08)]"
                            />
                          ))}
                        </div>
                      ) : jobs.length > 0 ? (
                        <div
                          className="grid content-start"
                          style={{
                            gap: "clamp(14px, 1.2vw, 22px)",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
                          }}
                        >
                          {jobs.map((job) => (
                            <a
                              key={job.id}
                              href={job.link}
                              target="_blank"
                              rel="noreferrer"
                              data-job-card
                              className="group rounded-[24px] border border-[rgba(255,239,214,0.1)] bg-[rgba(255,251,245,0.96)] p-5 text-[var(--ink)] shadow-[0_20px_58px_rgba(0,0,0,0.22)] transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_34px_80px_rgba(0,0,0,0.24)]"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  {job.pictureUrl ? (
                                    <img
                                      src={job.pictureUrl}
                                      alt={job.companyName}
                                      className="h-14 w-14 rounded-2xl border border-[rgba(113,90,61,0.12)] bg-[#fff7ea] object-cover shadow-sm"
                                    />
                                  ) : (
                                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[rgba(113,90,61,0.12)] bg-[linear-gradient(180deg,#fff5dc,#f6d699)] font-semibold text-[var(--ink)] shadow-sm">
                                      {getInitials(job.companyName)}
                                    </div>
                                  )}

                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.26em] text-[var(--muted)]">
                                      {job.providerLabel}
                                    </p>
                                    <p className="mt-1 text-lg font-semibold leading-tight text-[var(--ink)]">
                                      {job.companyName}
                                    </p>
                                  </div>
                                </div>

                                <span className="rounded-full border border-[var(--line)] bg-[rgba(247,239,226,0.84)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                                  {job.remote ? "Remote" : "On-site"}
                                </span>
                              </div>

                              <div className="mt-5 space-y-3">
                                <h3 className="text-2xl font-semibold leading-tight text-[var(--ink)] transition-colors duration-300 group-hover:text-[var(--accent-deep)]">
                                  {job.title}
                                </h3>
                                <p className="line-clamp-3 text-sm leading-6 text-[var(--muted)]">
                                  {job.shortDescription}
                                </p>
                              </div>

                              <div className="mt-5 flex flex-wrap gap-2">
                                <span className="rounded-full bg-[rgba(201,138,58,0.12)] px-3 py-1 text-xs font-medium text-[var(--accent-deep)]">
                                  {SOFTWARE_ROLES.find((role) => role.id === job.primaryRole)?.label}
                                </span>
                                {job.employmentType ? (
                                  <span className="rounded-full bg-[rgba(93,125,116,0.12)] px-3 py-1 text-xs font-medium text-[#35574e]">
                                    {job.employmentType}
                                  </span>
                                ) : null}
                                <span className="rounded-full bg-[rgba(122,106,90,0.09)] px-3 py-1 text-xs font-medium text-[var(--muted)]">
                                  {job.location}
                                </span>
                              </div>

                              <div className="mt-6 flex items-center justify-between text-sm text-[var(--muted)]">
                                <span>seen {formatRelative(job.lastSeenAt)}</span>
                                <span className="font-semibold text-[var(--accent-deep)]">
                                  Open role
                                </span>
                              </div>
                            </a>
                          ))}
                        </div>
                      ) : (
                        <div className="flex min-h-[42vh] items-center justify-center rounded-[26px] border border-dashed border-[rgba(255,239,214,0.12)] px-6 text-center text-sm text-[#d9c09d]">
                          No roles match the current search yet. Change the role, keyword, or location and scrape again.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
