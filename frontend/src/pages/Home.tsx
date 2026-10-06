// import { Link } from "react-router";
import { Link } from "react-router";

export default function Home() {
  return (
    <div>
      <h1 className="home-title">Home Page!</h1>
      <Link to="/UserInfo" className="home-link">
        User Info
      </Link>
      <br />
      <Link to="/signup" className="home-link">
        Sign In
      </Link>
    </div>
  );
}
