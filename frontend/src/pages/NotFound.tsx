import { Link } from "react-router";

export default function NotFound() {
  return (
    <section className="not-found">
      <p className="eyebrow">404 / A little off track</p>
      <h1>
        Let's find
        <br />
        <span className="accent-text">your way back.</span>
      </h1>
      <p className="lead">
        This page isn't here, but your next focused moment is still ahead.
      </p>
      <Link to="/" className="button">
        Back to home <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
