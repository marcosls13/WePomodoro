import { useEffect, useState } from "react";
import { Link } from "react-router";

const API_URL = import.meta.env.VITE_API_URL as string;

interface User {
    id: number;
    email: string;
    username: string;
}

export default function Info() {
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => {
    void fetch(`${API_URL}/users`)
      .then((res) => res.json() as Promise<User[]>)
      .then(setUsers);
  }, []);

  return (
    <div>
      <ul>
        {users.map((u) => (
          <li key={u.id}>Username: {u.username} <br/> Email: {u.email}</li>
        ))}
      </ul>
	  <Link to="/">Back</Link>
    </div>
  );
}