const statsEndpoints = ["/api/public/stats", "https://lanaya.space/api/public/stats"];

const numberFormat = new Intl.NumberFormat("ru-RU");
const totalNodes = [
  document.getElementById("totalUsers"),
  document.getElementById("totalUsersBoard"),
].filter(Boolean);
const onlineNodes = [
  document.getElementById("onlineUsers"),
  document.getElementById("onlineUsersBoard"),
].filter(Boolean);
const statusNode = document.getElementById("statsStatus");
const updatedAtNode = document.getElementById("updatedAt");
const canvas = document.getElementById("motionCanvas");
const context = canvas?.getContext("2d");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let dots = [];
let animationFrame = 0;

function setStatsState(state) {
  document.body.dataset.statsState = state;
}

function setText(nodes, value) {
  nodes.forEach((node) => {
    node.textContent = value;
  });
}

function animateNumber(nodes, nextValue) {
  const startValues = nodes.map((node) => Number(node.dataset.value || 0));
  const start = performance.now();
  const duration = 900;

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    nodes.forEach((node, index) => {
      const current = Math.round(startValues[index] + (nextValue - startValues[index]) * eased);
      node.textContent = numberFormat.format(current);
      node.dataset.value = String(current);
    });

    if (progress < 1) {
      requestAnimationFrame(tick);
      return;
    }

    nodes.forEach((node) => {
      node.textContent = numberFormat.format(nextValue);
      node.dataset.value = String(nextValue);
    });
  }

  requestAnimationFrame(tick);
}

function formatTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function loadStats() {
  setStatsState("loading");

  try {
    let payload = null;

    for (const endpoint of statsEndpoints) {
      try {
        const response = await fetch(endpoint, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        if (!response.ok) {
          continue;
        }

        payload = await response.json();
        break;
      } catch (error) {
        if (endpoint === statsEndpoints.at(-1)) {
          throw error;
        }
      }
    }

    if (!payload) {
      throw new Error("Stats request failed");
    }

    const totalUsers = Number(payload.totalUsers ?? payload.TotalUsers ?? 0);
    const onlineUsers = Number(payload.onlineUsers ?? payload.OnlineUsers ?? 0);
    const updatedAt = payload.updatedAtUtc ?? payload.UpdatedAtUtc;

    animateNumber(totalNodes, Math.max(0, totalUsers));
    animateNumber(onlineNodes, Math.max(0, onlineUsers));

    if (statusNode) {
      statusNode.textContent = "в сети";
    }

    if (updatedAtNode) {
      updatedAtNode.textContent = formatTime(updatedAt);
    }

    setStatsState("success");
  } catch {
    setText(totalNodes, "-");
    setText(onlineNodes, "-");

    if (statusNode) {
      statusNode.textContent = "нет связи";
    }

    if (updatedAtNode) {
      updatedAtNode.textContent = "-";
    }

    setStatsState("error");
  }
}

function revealOnScroll() {
  const items = Array.from(document.querySelectorAll(".reveal"));
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.18,
      rootMargin: "0px 0px -8% 0px",
    }
  );

  items.forEach((item) => observer.observe(item));
}

function resizeCanvas() {
  if (!canvas || !context) return;

  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  const count = window.innerWidth < 760 ? 34 : 76;
  dots = Array.from({ length: count }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    vx: (Math.random() - 0.5) * 0.18,
    vy: (Math.random() - 0.5) * 0.16,
    size: 0.8 + Math.random() * 1.8,
    pulse: Math.random() * Math.PI * 2,
  }));
}

function drawCanvas() {
  if (!canvas || !context || prefersReducedMotion) return;

  context.clearRect(0, 0, window.innerWidth, window.innerHeight);

  dots.forEach((dot, index) => {
    dot.x += dot.vx;
    dot.y += dot.vy;
    dot.pulse += 0.012;

    if (dot.x < -20) dot.x = window.innerWidth + 20;
    if (dot.x > window.innerWidth + 20) dot.x = -20;
    if (dot.y < -20) dot.y = window.innerHeight + 20;
    if (dot.y > window.innerHeight + 20) dot.y = -20;

    for (let nextIndex = index + 1; nextIndex < dots.length; nextIndex += 1) {
      const next = dots[nextIndex];
      const dx = dot.x - next.x;
      const dy = dot.y - next.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 150) continue;

      context.beginPath();
      context.moveTo(dot.x, dot.y);
      context.lineTo(next.x, next.y);
      context.strokeStyle = `rgba(141, 243, 214, ${0.1 * (1 - distance / 150)})`;
      context.lineWidth = 1;
      context.stroke();
    }

    const alpha = 0.38 + Math.sin(dot.pulse) * 0.18;
    context.beginPath();
    context.arc(dot.x, dot.y, dot.size, 0, Math.PI * 2);
    context.fillStyle = `rgba(244, 247, 251, ${alpha})`;
    context.fill();
  });

  animationFrame = requestAnimationFrame(drawCanvas);
}

revealOnScroll();
loadStats();
window.setInterval(loadStats, 15000);

if (!prefersReducedMotion) {
  resizeCanvas();
  drawCanvas();
  window.addEventListener("resize", () => {
    cancelAnimationFrame(animationFrame);
    resizeCanvas();
    drawCanvas();
  });
}
