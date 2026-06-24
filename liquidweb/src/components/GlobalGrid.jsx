import React from "react";
export default function GlobalGrid({ bgColor = "var(--color-bg)", className = "" }) {
  const linesLayerStyle = {
    position: "absolute",
    inset: 0,
    opacity: 0.15,
    backgroundImage:
      "linear-gradient(to right, #aaa 1px, transparent 1px), linear-gradient(to bottom, #aaa 1px, transparent 1px)",
    backgroundSize: "40px 40px",
    backgroundPosition: "center center",
    maskImage:
      "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.78) 16%, black 34%, black 74%, rgba(0,0,0,0.58) 90%, rgba(0,0,0,0.35) 100%)",
    WebkitMaskImage:
      "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.78) 16%, black 34%, black 74%, rgba(0,0,0,0.58) 90%, rgba(0,0,0,0.35) 100%)",
  };
  const radialMaskStyle = {
    position: "absolute",
    inset: 0,
    background: `radial-gradient(circle at center, transparent 0%, ${bgColor} 158%)`,
  };
  const topShadeStyle = {
    position: "absolute",
    inset: 0,
    background: `linear-gradient(to bottom, ${bgColor} 0%, ${bgColor} 15%, transparent 46%)`,
  };
  const bottomLiftStyle = {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(to top, rgba(255,255,255,0.02) 0%, transparent 34%)",
  };
  const softGlowStyle = {
    position: "absolute",
    top: "-16px",
    right: 0,
    bottom: 0,
    left: 0,
    background: "radial-gradient(circle at center, rgba(255,255,255,0.03) 0%, transparent 50%)",
  };
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div style={linesLayerStyle} />
      <div style={radialMaskStyle} />
      <div style={topShadeStyle} />
      <div style={bottomLiftStyle} />
      <div style={softGlowStyle} />
    </div>
  );
}
