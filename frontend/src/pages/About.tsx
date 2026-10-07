import { Link } from "react-router";

export default function About() {
  return (
    <section className="section-page">
      <p className="eyebrow">The idea behind WePomodoro</p>
      <h1>
        Better focus.
        <br />
        <span className="accent-text">Better together.</span>
      </h1>
      <p className="lead">
        We're building a shared space for a simple habit: give one task your
        attention, take a breath, and come back refreshed.
      </p>
      <div className="feature-grid">
        <article className="info-card">
          <span className="step-number">01 / FOCUS</span>
          <h2>Start small</h2>
          <p>
            Choose one task and give it 25 minutes of your attention. Progress
            doesn't have to mean doing everything at once.
          </p>
        </article>
        <article className="info-card">
          <span className="step-number">02 / REST</span>
          <h2>Make space</h2>
          <p>
            A short break is part of the rhythm. Step away, stretch, and return
            with a little more energy.
          </p>
        </article>
        <article className="info-card">
          <span className="step-number">03 / CONNECT</span>
          <h2>Grow together</h2>
          <p>
            WePomodoro is a project in progress. Join the community as we shape
            a place for shared focus.
          </p>
        </article>
      </div>
      <Link className="text-link" to="/signup">
        Be part of the beginning <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
