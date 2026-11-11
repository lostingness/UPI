// Global 404: friendly not-found with a way home.
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <div className="card w-full p-6 sm:p-8">
        <h1 className="text-xl font-medium text-slate-50">Page not found</h1>
        <p className="mt-1 text-sm text-slate-400">This page does not exist or was moved.</p>
        <Link href="/" className="btn btn-primary touch-manipulation mt-6 w-full">
          Go home
        </Link>
      </div>
      <p className="mt-6 text-xs text-slate-600">UPI Gateway · Developed by Mohit 🩷</p>
    </div>
  );
}
