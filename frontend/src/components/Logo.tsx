import Tomato from "./Tomato";

// The logo is the tomato mascot; the size comes from the Tailwind classes.
export default function Logo({ className = "w-10 h-10" }) {
  return <Tomato className={className} />;
}
