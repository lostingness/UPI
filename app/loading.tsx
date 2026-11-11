// Global loading state: skeleton while a segment loads.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6" aria-busy="true" aria-label="Loading">
      <div className="skeleton mb-6 h-7 w-56" />
      <div className="skeleton mb-4 h-4 w-80 max-w-full" />
      <div className="card p-5">
        <div className="skeleton h-24 w-full" />
      </div>
    </div>
  );
}
