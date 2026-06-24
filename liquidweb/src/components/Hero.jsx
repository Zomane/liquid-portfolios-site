import React from "react";
const Hero = () => {
  return (
    <section className="hero">
      <div className="hero-image-wrap">
        <img
          src="/images/community.svg"
          alt="Liquid Community"
          className="hero-image"
          loading="eager"
          decoding="async"
          draggable="false"
        />
      </div>
      <style>{`
        .hero{
          position: relative;
          min-height: 100vh;
          min-height: 100svh;
          display: grid;
          place-items: center;
          overflow: hidden;
          padding: 24px 16px;
          isolation: isolate;
          z-index: 1;
        }
        .hero-image-wrap{
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 1100px;
          display: flex;
          justify-content: center;
          align-items: center;
          filter: drop-shadow(0 18px 60px rgba(0,0,0,.35));
        }
        .hero-image-wrap::before{
          content:"";
          position:absolute;
          inset:auto 10% -18% 10%;
          height: 60%;
          z-index:-1;
          background: radial-gradient(closest-side, rgba(237,237,255,.16), transparent 70%);
          filter: blur(18px);
          transform: translate3d(0,0,0);
        }
        .hero-image{
          width: 100%;
          height: auto;
          display: block;
          opacity: 0;
          transform: translateY(20px);
          animation: heroImageEnter 760ms cubic-bezier(0.2, 0.8, 0.2, 1) 180ms both;
          backface-visibility: hidden;
          transform-style: preserve-3d;
          user-select: none;
        }
        @keyframes heroImageEnter {
          from { opacity: 0; transform: translateY(20px) translateZ(0); }
          to   { opacity: 1; transform: translateY(0) translateZ(0); }
        }
        @media (min-width: 768px){
          .hero { padding: 32px 24px; }
          .hero-image-wrap { max-width: 1100px; }
        }
        @media (min-width: 1200px){
          .hero-image-wrap { max-width: 1350px; }
        }
        @media (prefers-reduced-motion: reduce){
          .hero-image{ animation: none; opacity: 1; transform: none; }
        }
        [data-theme='light'] .hero-image { filter: invert(1); }
      `}</style>
    </section>
  );
};
export default Hero;
