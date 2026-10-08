export function isPublicPath(pathname: string): boolean {
  return (
    ["/", "/login", "/register", "/api/auth"].includes(pathname) ||
    pathname.startsWith("/api/auth/")
  );
}
