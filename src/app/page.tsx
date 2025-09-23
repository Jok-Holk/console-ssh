"use client";
import { useActionState } from "react";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [state, formAction] = useActionState(loginAction, null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black/80 backdrop-blur-sm relative">
      {state?.error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-600 text-white p-4 rounded-lg shadow-lg z-50">
          {state.error}
        </div>
      )}
      <div className="neon-purple p-8 rounded-2xl w-96 text-center">
        <h1 className="text-3xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">
          SSH Console
        </h1>
        <form action={formAction} className="space-y-4">
          <input
            type="text"
            name="key"
            placeholder="Enter Key from App"
            className="neon-input w-full"
            required
          />
          <input
            type="password"
            name="pass"
            placeholder="Enter Generated Pass"
            className="neon-input w-full"
            required
          />
          <button type="submit" className="neon-btn w-full">
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
