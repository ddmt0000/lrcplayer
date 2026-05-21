import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";

// ─── Effect Modes ───
const EFFECT_MODES = {
  TILE: 'tile',
  WORDCLOUD: 'wordcloud',
  NEBULA: 'nebula',
  VERTICAL: 'vertical'
};
const EFFECT_LABELS = {
  [EFFECT_MODES.TILE]: '无序平铺',
  [EFFECT_MODES.WORDCLOUD]: '无序词云',
  [EFFECT_MODES.NEBULA]: '无序星云',
  [EFFECT_MODES.VERTICAL]: '纵向排列'
};

// ─── Fullscreen Helper ───
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

// ─── LRC Parser ───
const LINE_RE = /^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/;

function parseLrc(raw) {
  const result = [];
  for (const line of raw.split("\n")) {
    const m = line.match(LINE_RE);
    if (!m) continue;
    const min = parseInt(m[1], 10);
    const sec = parseInt(m[2], 10);
    const ms = parseInt(m[3].padEnd(3, "0"), 10);
    const text = m[4].trim();
    if (!text) continue;
    result.push({ time: min * 60 + sec + ms / 1000, text });
  }
  return result.sort((a, b) => a.time - b.time);
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ─── Tile Layout (无序平铺) ───
function useTileLayout(lyrics, currentIndex, fontSizeScale, stopSort) {
  const stablePositionsRef = useRef(null);
  const prevLyricsLenRef = useRef(0);

  // Compute fresh random positions
  const computePositions = useCallback((lyricsList, curIdx, scale) => {
    if (lyricsList.length === 0) return [];
    const positions = [];
    const placed = [];
    const baseSize = 24;

    for (let i = 0; i < lyricsList.length; i++) {
      const distance = Math.abs(i - curIdx);
      const sizeMultiplier = Math.max(0.3, 1 - distance * 0.03);
      const size = baseSize * sizeMultiplier * scale;
      const opacity = Math.max(0.15, 1 - distance * 0.03);
      const textLen = lyricsList[i].text.length;
      const boxH = size * 1.4;
      const boxW = textLen * size * 0.55;

      let x, y, attempts = 0;
      const padding = 8;
      do {
        x = (Math.random() - 0.5) * 2000;
        y = (Math.random() - 0.5) * 2000;
        attempts++;
      } while (
        attempts < 50 &&
        placed.some(p =>
          Math.abs(x - p.x) < (boxW + p.boxW) / 2 + padding &&
          Math.abs(y - p.y) < (boxH + p.boxH) / 2 + padding
        )
      );

      const blur = Math.max(0, distance * 0.3);
      positions[i] = { x, y, size, opacity, blur, isCurrent: i === curIdx, boxW, boxH };
      placed.push(positions[i]);
    }
    return positions;
  }, []);

  return useMemo(() => {
    if (lyrics.length === 0) {
      stablePositionsRef.current = null;
      return [];
    }

    // Invalidate stable positions when lyrics array changes
    if (lyrics.length !== prevLyricsLenRef.current) {
      stablePositionsRef.current = null;
      prevLyricsLenRef.current = lyrics.length;
    }

    if (stopSort) {
      // Only compute once, then reuse stable positions
      if (!stablePositionsRef.current) {
        stablePositionsRef.current = computePositions(lyrics, currentIndex, fontSizeScale);
      }
      // Update dynamic properties (size/opacity/blur/isCurrent) without changing x,y
      return stablePositionsRef.current.map((pos, i) => {
        const distance = Math.abs(i - currentIndex);
        const sizeMultiplier = Math.max(0.3, 1 - distance * 0.03);
        const size = 24 * sizeMultiplier * fontSizeScale;
        const opacity = Math.max(0.15, 1 - distance * 0.03);
        const blur = Math.max(0, distance * 0.3);
        return { ...pos, size, opacity, blur, isCurrent: i === currentIndex };
      });
    }

    // Normal mode: recompute positions every time
    stablePositionsRef.current = null;
    return computePositions(lyrics, currentIndex, fontSizeScale);
  }, [lyrics, currentIndex, fontSizeScale, stopSort, computePositions]);
}

// ─── Wordcloud Layout (无序词云) ───
function useWordcloudLayout(lyrics, currentIndex, fontSizeScale, centerCurrent) {
  return useMemo(() => {
    if (lyrics.length === 0) return [];
    const placed = [];
    const result = new Array(lyrics.length);
    const baseSize = 28;

    // When centerCurrent is ON: sort by distance from current, place current at center
    // When centerCurrent is OFF: fixed order (index order), no re-centering
    const order = lyrics.map((_, i) => i);
    if (centerCurrent) {
      order.sort((a, b) => Math.abs(a - currentIndex) - Math.abs(b - currentIndex));
    }

    for (const i of order) {
      const distance = Math.abs(i - currentIndex);
      const sizeMultiplier = Math.max(0.25, 1 - distance * 0.06);
      const size = baseSize * sizeMultiplier * fontSizeScale;
      const opacity = Math.max(0.1, 1 - distance * 0.04);
      const textLen = lyrics[i].text.length;
      const boxH = size * 1.4;
      const boxW = textLen * size * 0.55;

      const blur = Math.max(0, distance * 0.5);

      // Only center current lyric when centerCurrent is ON
      if (centerCurrent && distance === 0) {
        result[i] = { x: 0, y: 0, size, opacity, blur, isCurrent: true, boxW, boxH };
        placed.push(result[i]);
        continue;
      }

      let found = false;
      const angleStep = 0.3;
      const radiusStep = 3;

      for (let r = size * 2; r < 2000; r += radiusStep) {
        for (let a = 0; a < Math.PI * 2; a += angleStep / Math.max(1, r * 0.02)) {
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          let collides = false;
          const padding = 6;
          for (const p of placed) {
            const overlapX = Math.abs(x - p.x) < (boxW + p.boxW) / 2 + padding;
            const overlapY = Math.abs(y - p.y) < (boxH + p.boxH) / 2 + padding;
            if (overlapX && overlapY) { collides = true; break; }
          }
          if (!collides) {
            result[i] = { x, y, size, opacity, blur, isCurrent: i === currentIndex, boxW, boxH };
            placed.push(result[i]);
            found = true;
            break;
          }
        }
        if (found) break;
      }

      if (!found) {
        const a = i * 137.508 * (Math.PI / 180);
        const r = 800 + i * 20;
        result[i] = { x: Math.cos(a) * r, y: Math.sin(a) * r, size, opacity, blur, isCurrent: i === currentIndex, boxW, boxH };
        placed.push(result[i]);
      }
    }
    return result;
  }, [lyrics, currentIndex, fontSizeScale, centerCurrent]);
}

// ─── Nebula Layout (无序星云) ───
// Small lyrics centered, large lyrics at periphery
function useNebulaLayout(lyrics, currentIndex, fontSizeScale) {
  return useMemo(() => {
    if (lyrics.length === 0) return [];
    const positions = [];
    const baseSize = 20;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    const maxRadius = Math.max(screenW, screenH) * 0.45;

    for (let i = 0; i < lyrics.length; i++) {
      const distance = Math.abs(i - currentIndex);
      // Close to current = large, far = small
      const sizeMultiplier = Math.max(0.2, 1 - distance * 0.02);
      const size = baseSize * sizeMultiplier * fontSizeScale;
      const opacity = Math.max(0.1, 1 - distance * 0.025);

      // Inverted: small (far) → center, large (close) → periphery
      const normalizedDist = lyrics.length > 1 ? distance / (lyrics.length - 1) : 0;
      const radius = (1 - normalizedDist) * maxRadius * sizeMultiplier;

      const angle = i * 137.508 * (Math.PI / 180);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      positions[i] = {
        x, y, size, opacity,
        isCurrent: i === currentIndex,
        boxW: lyrics[i].text.length * size * 0.55,
        boxH: size * 1.4,
        blur: Math.max(0, (1 - sizeMultiplier) * 3)
      };
    }
    return positions;
  }, [lyrics, currentIndex, fontSizeScale]);
}

// ─── Vertical Layout (纵向排列) ───
function useVerticalLayout(lyrics, currentIndex, fontSizeScale) {
  return useMemo(() => {
    if (lyrics.length === 0) return [];
    const positions = [];
    const baseSize = 22;
    const lineHeight = 48;
    let yOffset = 0;

    for (let i = 0; i < lyrics.length; i++) {
      const distance = Math.abs(i - currentIndex);
      const sizeMultiplier = Math.max(0.35, 1 - distance * 0.04);
      const size = baseSize * sizeMultiplier * fontSizeScale;
      const opacity = Math.max(0.12, 1 - distance * 0.04);
      const blur = Math.max(0, distance * 0.4);

      const x = 0;
      const y = (i - currentIndex) * lineHeight * fontSizeScale;

      positions[i] = {
        x, y, size, opacity, blur,
        isCurrent: i === currentIndex,
        boxW: lyrics[i].text.length * size * 0.55,
        boxH: size * 1.4,
      };
    }
    return positions;
  }, [lyrics, currentIndex, fontSizeScale]);
}

// ─── LyricCloud Component ───
function LyricCloud({ lyrics, currentTime, onSeek, effectMode, followFocus, centerCurrent, blurEffect, edgeTrack, stopSort }) {
  const [fontSizeScale, setFontSizeScale] = useState(2.6);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragOffset = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);

  const currentIndex = useMemo(() => {
    let idx = 0;
    for (let i = 0; i < lyrics.length; i++) {
      if (currentTime >= lyrics[i].time) idx = i;
      else break;
    }
    return idx;
  }, [lyrics, currentTime]);

  // Select layout based on effect mode
  const tilePositions = useTileLayout(lyrics, currentIndex, fontSizeScale, stopSort);
  const wordcloudPositions = useWordcloudLayout(lyrics, currentIndex, fontSizeScale, centerCurrent);
  const nebulaPositions = useNebulaLayout(lyrics, currentIndex, fontSizeScale);
  const verticalPositions = useVerticalLayout(lyrics, currentIndex, fontSizeScale);

  const positions = useMemo(() => {
    switch (effectMode) {
      case EFFECT_MODES.TILE: return tilePositions;
      case EFFECT_MODES.WORDCLOUD: return wordcloudPositions;
      case EFFECT_MODES.NEBULA: return nebulaPositions;
      case EFFECT_MODES.VERTICAL: return verticalPositions;
      default: return wordcloudPositions;
    }
  }, [effectMode, tilePositions, wordcloudPositions, nebulaPositions, verticalPositions]);

  // Auto-follow focus for tile and vertical modes
  useEffect(() => {
    if ((effectMode === EFFECT_MODES.TILE || effectMode === EFFECT_MODES.VERTICAL) && followFocus && positions[currentIndex]) {
      const pos = positions[currentIndex];
      setOffset({ x: -pos.x, y: -pos.y });
    }
  }, [currentIndex, effectMode, followFocus, positions]);

  // Reset view to center when toggling centerCurrent ON in wordcloud mode
  useEffect(() => {
    if (effectMode === EFFECT_MODES.WORDCLOUD && centerCurrent) {
      setOffset({ x: 0, y: 0 });
    }
  }, [centerCurrent, effectMode]);

  // Edge tracking: nudge view so current lyric stays visible
  useEffect(() => {
    if (effectMode !== EFFECT_MODES.NEBULA || !edgeTrack || !positions[currentIndex] || !containerRef.current) return;
    const pos = positions[currentIndex];
    const container = containerRef.current;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const margin = 60;

    // Current lyric screen position = pos + offset + container center
    const screenX = pos.x + offset.x + cw / 2;
    const screenY = pos.y + offset.y + ch / 2;

    let dx = 0, dy = 0;
    if (screenX < margin) dx = margin - screenX;
    else if (screenX > cw - margin) dx = cw - margin - screenX;
    if (screenY < margin) dy = margin - screenY;
    else if (screenY > ch - margin) dy = ch - margin - screenY;

    if (dx !== 0 || dy !== 0) {
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    }
  }, [currentIndex, effectMode, edgeTrack, positions]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setFontSizeScale((s) => Math.max(0.3, Math.min(3, s - e.deltaY * 0.001)));
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.target.closest(".lyric-line")) return;
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragOffset.current = { x: offset.x, y: offset.y };
  }, [offset]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffset({ x: dragOffset.current.x + dx, y: dragOffset.current.y + dy });
  }, []);

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return React.createElement("div", {
      ref: containerRef,
      className: `lyric-cloud-container effect-${effectMode}`,
      onWheel: handleWheel,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp,
    },
    React.createElement("div", {
      className: "lyric-cloud",
      style: {
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        transition: ((effectMode === EFFECT_MODES.TILE || effectMode === EFFECT_MODES.VERTICAL) && followFocus)
          || (effectMode === EFFECT_MODES.NEBULA && edgeTrack)
          ? 'transform 0.6s cubic-bezier(0.25, 0.1, 0.25, 1)'
          : 'none',
      },
    },
      lyrics.map((line, i) => {
        const pos = positions[i];
        if (!pos) return null;
        const blurValue = blurEffect && pos.blur ? pos.blur : 0;
        return React.createElement("div", {
          key: i,
          className: `lyric-line ${pos.isCurrent ? "current" : ""}`,
          style: {
            fontSize: `${pos.size}px`,
            opacity: pos.opacity,
            fontWeight: pos.isCurrent ? 800 : 400,
            transform: `translate(${pos.x}px, ${pos.y}px)`,
            filter: blurValue > 0 ? `blur(${blurValue}px)` : 'none',
          },
          onClick: () => onSeek(line.time),
        }, line.text);
      })
    )
  );
}


function icon(paths) {
  return React.createElement(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: 24,
      height: 24,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      className: "player-icon",
    },
    ...paths.map((d) =>
      React.createElement("path", d)
    )
  );
}


const LOOP_ICONS = {
  list: icon([
    { stroke: "none", d: "M0 0h24v24H0z", fill: "none" },
    { d: "M4 12v-3a3 3 0 0 1 3 -3h13m-3 -3l3 3l-3 3" },
    { d: "M20 12v3a3 3 0 0 1 -3 3h-13m3 3l-3 -3l3 -3" },
  ]),

  single: icon([
    { stroke: "none", d: "M0 0h24v24H0z", fill: "none" },
    { d: "M4 12v-3a3 3 0 0 1 3 -3h13m-3 -3l3 3l-3 3" },
    { d: "M20 12v3a3 3 0 0 1 -3 3h-13m3 3l-3 -3l3 -3" },
    { d: "M11 11l1 -1v4" },
  ]),

  shuffle: icon([
    { stroke: "none", d: "M0 0h24v24H0z", fill: "none" },
    { d: "M18 4l3 3l-3 3" },
    { d: "M18 20l3 -3l-3 -3" },
    { d: "M3 7h3a5 5 0 0 1 5 5a5 5 0 0 0 5 5h5" },
    { d: "M21 7h-5a4.978 4.978 0 0 0 -3 1m-4 8a4.984 4.984 0 0 1 -3 1h-3" },
  ]),

  play: icon([
    { stroke: "none", d: "M0 0h24v24H0z", fill: "none" },
    { d: "M7 4v16l13 -8l-13 -8" },
  ]),

  pause: icon([
    { stroke: "none", d: "M0 0h24v24H0z", fill: "none" },
    {
      d: "M6 6a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -12"
    },
    {
      d: "M14 6a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -12"
    },
  ]),

  prev: icon([
    { stroke: "none", d: "M0 0h24v24H0z", fill: "none" },
    { d: "M21 5v14l-8 -7l8 -7" },
    { d: "M10 5v14l-8 -7l8 -7" },
  ]),

  next: icon([
    { stroke: "none", d: "M0 0h24v24H0z", fill: "none" },
    { d: "M3 5v14l8 -7l-8 -7" },
    { d: "M14 5v14l8 -7l-8 -7" },
  ]),

  fullscreen: icon([
    { stroke: "none", d: "M0 0h24v24H0z", fill: "none" },
    { d: "M4 8v-2a2 2 0 0 1 2 -2h2" },
    { d: "M4 16v2a2 2 0 0 0 2 2h2" },
    { d: "M16 4h2a2 2 0 0 1 2 2v2" },
    { d: "M16 20h2a2 2 0 0 0 2 -2v-2" },
  ]),

  volume: icon([
    { stroke: "none", d: "M0 0h24v24H0z", fill: "none" },
    { d: "M15 8a5 5 0 0 1 0 8" },
    { d: "M17.7 5a9 9 0 0 1 0 14" },
    {
      d: "M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5"
    },
  ]),

  volume2: icon([
    { stroke: "none", d: "M0 0h24v24H0z", fill: "none" },
    { d: "M15 8a5 5 0 0 1 0 8" },
    {
      d: "M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5"
    },
  ]),

  mute: icon([
    { stroke: "none", d: "M0 0h24v24H0z", fill: "none" },
    { d: "M15 8a5 5 0 0 1 1.912 4.934m-1.377 2.602a5 5 0 0 1 -.535 .464" },
    { d: "M17.7 5a9 9 0 0 1 2.362 11.086m-1.676 2.299a9 9 0 0 1 -.686 .615" },
    {
      d: "M9.069 5.054l.431 -.554a.8 .8 0 0 1 1.5 .5v2m0 4v8a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l1.294 -1.664"
    },
    { d: "M3 3l18 18" },
  ]),

  playlist: icon([
    { stroke: "none", d: "M0 0h24v24H0z", fill: "none" },
    { d: "M11 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" },
    { d: "M17 17v-13h4" },
    { d: "M13 5h-10" },
    { d: "M3 9l10 0" },
    { d: "M9 13h-6" },
  ]),

  effect: icon([
    { stroke: "none", d: "M0 0h24v24H0z", fill: "none" },
    {
      d: "M14.504 8.522l-1.758 -4.032a.814 .814 0 0 0 -1.492 0l-1.759 4.032c-.19 .436 -.537 .784 -.973 .973l-4.032 1.759a.814 .814 0 0 0 0 1.492l4.033 1.758c.436 .19 .784 .538 .973 .974l1.759 4.033a.814 .814 0 0 0 1.492 0l1.758 -4.033c.19 -.436 .538 -.784 .974 -.974l4.033 -1.758a.814 .814 0 0 0 0 -1.492l-4.033 -1.759a1.88 1.88 0 0 1 -.974 -.973"
    },
    { d: "M3 3l2 2" },
    { d: "M21 3l-2 2" },
    { d: "M3 21l2 -2" },
    { d: "M21 21l-2 -2" },
  ]),
};

// ─── Player Component ───
// const LOOP_ICONS = { single: "🔂", list: "🔁", shuffle: "🔀" };
const LOOP_LABELS = { single: "单曲循环", list: "列表循环", shuffle: "随机播放" };

function Player({
  songs, currentIndex, isPlaying, currentTime, duration, loopMode, volume,
  onPlayPause, onPrev, onNext, onSeek, onLoopModeChange, onVolumeChange, onSelectSong,
  effectMode, onEffectModeChange, followFocus, onFollowFocusChange,
  centerCurrent, onCenterCurrentChange, blurEffect, onBlurEffectChange,
  edgeTrack, onEdgeTrackChange, stopSort, onStopSortChange,
  playerHidden, playerHoverRef,
}) {
  const [showList, setShowList] = useState(false);
  const [showEffects, setShowEffects] = useState(false);
  const barRef = useRef(null);
  const dragging = useRef(false);
  const volumeBarRef = useRef(null);
  const volumeDragging = useRef(false);
  const listRef = useRef(null);
  const effectsRef = useRef(null);

  const currentSong = songs[currentIndex];

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showList && listRef.current && !listRef.current.contains(e.target)) {
        setShowList(false);
      }
      if (showEffects && effectsRef.current && !effectsRef.current.contains(e.target)) {
        setShowEffects(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showList, showEffects]);

  const cycleLoop = () => {
    const modes = ["list", "single", "shuffle"];
    onLoopModeChange(modes[(modes.indexOf(loopMode) + 1) % 3]);
  };

  const handleBarClick = useCallback((e) => {
    const bar = barRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  }, [duration, onSeek]);

  const handleBarDown = (e) => {
    dragging.current = true;
    handleBarClick(e);
  };

  const handleBarMove = (e) => {
    if (!dragging.current) return;
    handleBarClick(e);
  };

  const handleBarUp = () => { dragging.current = false; };

  // const volumeIcon = volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊";
  const volumeIcon = volume === 0 ? LOOP_ICONS.mute : volume < 0.5 ? LOOP_ICONS.volume2 : LOOP_ICONS.volume;

  const handleVolumeBarClick = useCallback((e) => {
    const bar = volumeBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onVolumeChange(ratio);
  }, [onVolumeChange]);

  const handleVolumeDown = (e) => {
    volumeDragging.current = true;
    handleVolumeBarClick(e);
  };

  const handleVolumeMove = (e) => {
    if (!volumeDragging.current) return;
    handleVolumeBarClick(e);
  };

  const handleVolumeUp = () => { volumeDragging.current = false; };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Effect options panel
  const effectOptions = React.createElement("div", { className: "effect-panel" },
    React.createElement("div", { className: "effect-header" }, "效果切换"),
    Object.entries(EFFECT_LABELS).map(([mode, label]) =>
      React.createElement("div", {
        key: mode,
        className: `effect-item ${effectMode === mode ? "active" : ""}`,
        onClick: () => { onEffectModeChange(mode); },
      }, label)
    ),
    // Effect-specific toggles
    (effectMode === EFFECT_MODES.TILE || effectMode === EFFECT_MODES.VERTICAL) && React.createElement("label", { className: "effect-toggle" },
      React.createElement("input", {
        type: "checkbox",
        checked: followFocus,
        onChange: (e) => onFollowFocusChange(e.target.checked),
      }),
      "焦点跟随"
    ),
    effectMode === EFFECT_MODES.WORDCLOUD && React.createElement("label", { className: "effect-toggle" },
      React.createElement("input", {
        type: "checkbox",
        checked: centerCurrent,
        onChange: (e) => onCenterCurrentChange(e.target.checked),
      }),
      "居中"
    ),
    (effectMode === EFFECT_MODES.TILE || effectMode === EFFECT_MODES.NEBULA || effectMode === EFFECT_MODES.VERTICAL || effectMode === EFFECT_MODES.WORDCLOUD) && React.createElement("label", { className: "effect-toggle" },
      React.createElement("input", {
        type: "checkbox",
        checked: blurEffect,
        onChange: (e) => onBlurEffectChange(e.target.checked),
      }),
      "模糊"
    ),
    effectMode === EFFECT_MODES.NEBULA && React.createElement("label", { className: "effect-toggle" },
      React.createElement("input", {
        type: "checkbox",
        checked: edgeTrack,
        onChange: (e) => onEdgeTrackChange(e.target.checked),
      }),
      "边缘跟踪"
    ),
    effectMode === EFFECT_MODES.TILE && React.createElement("label", { className: "effect-toggle" },
      React.createElement("input", {
        type: "checkbox",
        checked: stopSort,
        onChange: (e) => onStopSortChange(e.target.checked),
      }),
      "停止排序"
    )
  );

  return React.createElement("div", {
    className: "player",
    style: {
      height: playerHidden ? "0px" : "80px",
      opacity: playerHidden ? 0 : 1,
      transition: "height 0.4s cubic-bezier(0.25, 0.1, 0.25, 1), opacity 0.3s ease",
    },
    onMouseEnter: () => { playerHoverRef.current = true; },
    onMouseLeave: () => { playerHoverRef.current = false; handleBarUp(); handleVolumeUp(); },
    onMouseUp: () => { handleBarUp(); handleVolumeUp(); },
  },
    // Playlist panel
    showList && React.createElement("div", { className: "playlist-panel", ref: listRef },
      React.createElement("div", { className: "playlist-header" }, `播放列表 (${songs.length})`),
      React.createElement("div", { className: "playlist-items" },
        songs.map((song, i) =>
          React.createElement("div", {
            key: i,
            className: `playlist-item ${i === currentIndex ? "active" : ""}`,
            onClick: () => { onSelectSong(i); setShowList(false); },
          }, song.name)
        )
      )
    ),
    // Progress bar
    React.createElement("div", {
      className: "progress-bar",
      ref: barRef,
      onMouseDown: handleBarDown,
      onMouseMove: handleBarMove,
    },
      React.createElement("div", { className: "progress-fill", style: { width: `${progress}%` } }),
      React.createElement("div", { className: "progress-thumb", style: { left: `${progress}%` } })
    ),
    // Controls
    React.createElement("div", { className: "player-controls" },
      React.createElement("div", { className: "player-left" },
        React.createElement("button", { className: "player-btn", onClick: () => setShowList(!showList) }, LOOP_ICONS.playlist),
        React.createElement("span", { className: "song-title" }, currentSong?.name || "未选择歌曲")
      ),
      React.createElement("div", { className: "player-center" },

  React.createElement(
    "button",
    {
      className: "player-btn",
      onClick: onPrev
    },
    LOOP_ICONS.prev
  ),

  React.createElement(
    "button",
    {
      className: "player-btn play-btn",
      onClick: onPlayPause
    },
    isPlaying ? LOOP_ICONS.pause : LOOP_ICONS.play
  ),

  React.createElement(
    "button",
    {
      className: "player-btn",
      onClick: onNext
    },
    LOOP_ICONS.next
  )

),
      React.createElement("div", { className: "player-right" },
        React.createElement("div", { className: "volume-control" },
          React.createElement("button", { className: "player-btn loop-btn", onClick: () => onVolumeChange(volume > 0 ? 0 : 1) }, volumeIcon),
          React.createElement("div", {
            className: "volume-bar",
            ref: volumeBarRef,
            onMouseDown: handleVolumeDown,
            onMouseMove: handleVolumeMove,
          },
            React.createElement("div", { className: "volume-fill", style: { width: `${volume * 100}%` } }),
            React.createElement("div", { className: "volume-thumb", style: { left: `${volume * 100}%` } })
          )
        ),
        React.createElement("span", { className: "time-label" }, `${formatTime(currentTime)} / ${formatTime(duration)}`),
        React.createElement("button", {
          className: "player-btn loop-btn",
          onClick: cycleLoop,
          title: LOOP_LABELS[loopMode],
        }, LOOP_ICONS[loopMode]),
        // Effect mode button
        React.createElement("div", { ref: effectsRef, style: { position: "relative" } },
          React.createElement("button", {
            className: "player-btn effect-btn",
            onClick: () => setShowEffects(!showEffects),
            title: "效果切换",
          }, LOOP_ICONS.effect),
          showEffects && effectOptions
        ),
        // Fullscreen button
        React.createElement("button", {
          className: "player-btn fullscreen-btn",
          onClick: toggleFullscreen,
          title: "全屏",
        }, LOOP_ICONS.fullscreen)
      )
    )
  );
}

// ─── App Component ───
function App() {
  const [songs, setSongs] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [lyrics, setLyrics] = useState([]);
  const [loopMode, setLoopMode] = useState("list");
  const [volume, setVolume] = useState(1);
  const audioRef = useRef(null);
  const [bgColor, setBgColor] = useState("#0a0a0a");
  const [effectMode, setEffectMode] = useState(EFFECT_MODES.WORDCLOUD);
  const [followFocus, setFollowFocus] = useState(true);
  const [centerCurrent, setCenterCurrent] = useState(false);
  const [blurEffect, setBlurEffect] = useState(true);
  const [edgeTrack, setEdgeTrack] = useState(true);
  const [stopSort, setStopSort] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playerHidden, setPlayerHidden] = useState(false);
  const hideTimerRef = useRef(null);
  const playerHoverRef = useRef(false);

  useEffect(() => {
    fetch("/api/songs").then((r) => r.json()).then(setSongs);
  }, []);

  const currentSong = songs[currentIndex];

  useEffect(() => {
    if (!currentSong?.lrc) { setLyrics([]); return; }
    fetch(currentSong.lrc).then((r) => r.text()).then((t) => setLyrics(parseLrc(t)));
  }, [currentSong?.lrc]);

  useEffect(() => {
    if (!currentSong) return;
    const audio = new Audio(currentSong.music);
    audio.volume = volume;
    audioRef.current = audio;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      if (loopMode === "single") { audio.currentTime = 0; audio.play(); }
      else if (loopMode === "shuffle") { setCurrentIndex(Math.floor(Math.random() * songs.length)); }
      else { setCurrentIndex((i) => (i + 1) % songs.length); }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    if (isPlaying) audio.play().catch(() => {});

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
    };
  }, [currentIndex, currentSong?.music, loopMode]);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      const t = Date.now() / 1000;
      const r = Math.floor(10 + Math.sin(t * 0.3) * 15);
      const g = Math.floor(10 + Math.sin(t * 0.2 + 1) * 10);
      const b = Math.floor(20 + Math.sin(t * 0.4 + 2) * 20);
      setBgColor(`rgb(${r},${g},${b})`);
    }, 100);
    return () => clearInterval(id);
  }, [isPlaying]);

  // Track fullscreen state
  useEffect(() => {
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFSChange);
    return () => document.removeEventListener("fullscreenchange", onFSChange);
  }, []);

  // Auto-hide player in fullscreen after 3s idle
  useEffect(() => {
    if (!isFullscreen) {
      setPlayerHidden(false);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      return;
    }

    const startHideTimer = () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        if (!playerHoverRef.current) setPlayerHidden(true);
      }, 3000);
    };

    const onMouseMove = () => {
      setPlayerHidden(false);
      startHideTimer();
    };

    document.addEventListener("mousemove", onMouseMove);
    startHideTimer();

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isFullscreen]);

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause(); else audio.play().catch(() => {});
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleSeek = useCallback((time) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  const handlePrev = useCallback(() => {
    if (audioRef.current && audioRef.current.currentTime > 3) { audioRef.current.currentTime = 0; return; }
    setCurrentIndex((i) => (i - 1 + songs.length) % songs.length);
  }, [songs.length]);

  const handleNext = useCallback(() => {
    if (loopMode === "shuffle") { setCurrentIndex(Math.floor(Math.random() * songs.length)); }
    else { setCurrentIndex((i) => (i + 1) % songs.length); }
  }, [loopMode, songs.length]);

  const handleVolumeChange = useCallback((v) => {
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  }, []);

  return React.createElement("div", { className: "app", style: { backgroundColor: bgColor, overflow: playerHidden ? "hidden" : "visible" } },
    React.createElement("div", { className: "lyric-area" },
      React.createElement(LyricCloud, {
        lyrics, currentTime, onSeek: handleSeek,
        effectMode, followFocus, centerCurrent, blurEffect, edgeTrack, stopSort
      })
    ),
    React.createElement(Player, {
      songs, currentIndex, isPlaying, currentTime, duration, loopMode, volume,
      onPlayPause: handlePlayPause, onPrev: handlePrev, onNext: handleNext,
      onSeek: handleSeek, onLoopModeChange: setLoopMode, onVolumeChange: handleVolumeChange,
      onSelectSong: (i) => { setCurrentIndex(i); setIsPlaying(true); },
      effectMode, onEffectModeChange: setEffectMode,
      followFocus, onFollowFocusChange: setFollowFocus,
      centerCurrent, onCenterCurrentChange: setCenterCurrent,
      blurEffect, onBlurEffectChange: setBlurEffect,
      edgeTrack, onEdgeTrackChange: setEdgeTrack,
      stopSort, onStopSortChange: setStopSort,
      playerHidden, playerHoverRef,
    })
  );
}

createRoot(document.getElementById("root")).render(React.createElement(App));
