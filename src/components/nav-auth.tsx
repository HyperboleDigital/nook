"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";

export default function NavAuth() {
  const { isSignedIn } = useAuth();

  if (isSignedIn) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="text-sm bg-[var(--primary)] text-[var(--primary-foreground)] px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
        >
          Dashboard
        </Link>
        <UserButton />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <SignInButton mode="modal">
        <button className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
          Sign in
        </button>
      </SignInButton>
      <SignUpButton mode="modal">
        <button className="text-sm bg-[var(--primary)] text-[var(--primary-foreground)] px-4 py-2 rounded-lg hover:opacity-90 transition-opacity">
          Get started
        </button>
      </SignUpButton>
    </div>
  );
}
