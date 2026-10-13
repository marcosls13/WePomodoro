import { useState } from "react";
import  SignUpForm  from "../components/SignupForm"
export default function SignUp() {

  return (
      <div className="flex-grow flex flex-col lg:flex-row items-center justify-center gap-12 px-6 lg:px-24 py-12 overflow-hidden bg-gray-50">
	<SignUpForm />
      </div>
  );
}
