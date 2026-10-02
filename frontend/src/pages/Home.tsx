import { Link } from 'react-router'

export default function Home() {
  return (
    <div>
      <h1 className="text-3xl font-bold underline text-red-500">
        Hola! Soy Marcos!
      </h1>
      <Link to="/about" className='text-blue-600 underline hover:text-blue-800'>
        About
      </Link>
    </div>
  )
}
