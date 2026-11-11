// Global error boundary (app/ segment): friendly retry instead of Next's
// default error page. Dashboard previously threw on null stats with no
// error.tsx at all.
"use client";

import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <div className="card w-full p-6 sm:p-8">
        <h1 className="text-xl font-medium text-slate-50">Something went wrong</h1>
        <p className="mt-1 text-sm text-slate-400">
          This page could not be loaded. Your payments and orders are safe — please try again.
        </p>
        {error?.digest ? <p className="meta mt-3">Error {error.digest}</p> : null}
        <div className="mt-6 flex flex-col gap-2">
          <button type="button" onClick={() => reset()} className="btn btn-primary touch-manipulation w-full">
            Try again
          </button>
          <Link href="/" className="btn btn-secondary touch-manipulation w-full">
            Go home
          </Link>
        </div>
      </div>
      <p className="mt-6 text-xs text-slate-600">UPI Gateway · Developed by Mohit 🩷</p>
    </div>
  );
}
