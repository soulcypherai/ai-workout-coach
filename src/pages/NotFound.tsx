const NotFound = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <h1 className="mb-4 text-4xl font-bold">404</h1>
      <p className="mb-6 text-xl">Page not found</p>
      <a href="/" className="text-blue-600 hover:underline">
        Go back to home
      </a>
    </div>
  );
};

export default NotFound;
