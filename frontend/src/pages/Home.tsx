import { Link } from "react-router";
import Tomato from "../Tomato";

export default function Home() {
  return (
    <section className="home-layout">
      <div className="hero-copy">
        <p className="eyebrow">A little structure. A lot of possibility.</p>
        <h1>
          Make room
          <br />
          for <span className="accent-text">deep focus.</span>
        </h1>
        <p className="lead">
          Big ideas start with small, focused moments. Meet WePomodoro: a space
          we're building to make time for what matters, together.
        </p>
        <div className="actions">
          <Link to="/auth/signup" className="button">
            Join the community <span aria-hidden="true">↗</span>
          </Link>
          <Link to="/about" className="text-link">
            Discover the idea <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="hero-note">
          <span className="status-dot" aria-hidden="true" />
          Growing one focused moment at a time
        </div>
      </div>
      <div
        className="focus-card"
        aria-label="Illustration of a 25 minute Pomodoro session"
      >
        <Tomato size={120} className="tomato-hero" />
        <div className="card-topline">
          <span className="eyebrow">The Pomodoro rhythm</span>
          <span className="pill">A simple idea</span>
        </div>
        <div className="timer-ring">
          <span className="timer-label">TIME TO FOCUS</span>
          <span className="timer-number">25:00</span>
          <span className="timer-caption">One thing at a time.</span>
        </div>
        <div className="rhythm">
          <span>
            <strong>01</strong>Focus
          </span>
          <span>
            <strong>02</strong>Take a break
          </span>
          <span>
            <strong>03</strong>Repeat
          </span>
        </div>
        <p className="card-caption">
          A glimpse of the experience we're building.
        </p>
      </div>
    </section>
  );
}
