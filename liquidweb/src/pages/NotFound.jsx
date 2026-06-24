import React from "react";
import { useNavigate, Link } from "react-router-dom";
import "./NotFound.css";
export default function NotFound() {
  const navigate = useNavigate();
  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };
  return (
    <main className="not-found" role="main">
      <div className="not-found__viewport">
        <section className="not-found__card" aria-labelledby="not-found-title">
          <p className="not-found__eyebrow">Error 404</p>
          <h1 className="not-found__title" id="not-found-title">
            Page not found
          </h1>
          <p className="not-found__description">
            The page you were trying to open was moved to a new address or removed.
          </p>
          <div className="not-found__actions">
            <button
              type="button"
              className="not-found__action not-found__action--ghost"
              onClick={handleGoBack}
            >
              Go Back
            </button>
            <Link to="/" className="not-found__action not-found__action--solid">
              Go Home
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
