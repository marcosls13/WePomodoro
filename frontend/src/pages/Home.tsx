import { Link } from 'react-router'

export default function Home() {
  return (
    <div>
      <h1>
        Hola! Soy Marcos!
      </h1>
      <Link to="/about">About</Link>
    </div>
  )
}
