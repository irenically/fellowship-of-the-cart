import type { ReactNode } from "react";

export function AppLayout({
  children,
  householdHeader,
}: {
  children: ReactNode;
  householdHeader?: ReactNode;
}) {
  return (
    <>
      {householdHeader && (
        <header className="household-page-header" aria-label="Household">
          <div className="household-header-inner">{householdHeader}</div>
        </header>
      )}
      <main>
        <header className="brand">
          <div className="crest" aria-hidden="true">
            <img
              src={`${import.meta.env.BASE_URL}assets/Golden Cart and Olive Branch Ornament.png`}
              alt=""
              width="2172"
              height="724"
            />
          </div>
          <h1>
            <span>
              The Fellowship
              <br className="mobile-break" /> of the Cart
            </span>
          </h1>
          <p className="tagline">One list to rule them all.</p>
        </header>
        {children}
      </main>
      <footer className="page-footer">
        <div className="footer-content">
          <p className="footer-copyright">
            © {new Date().getFullYear()} The Fellowship of the Cart
          </p>
          <nav aria-label="Footer links">
            <a
              className="github-link"
              href="https://github.com/irenically/fellowship-of-the-cart"
              aria-label="View source on GitHub"
              title="View source on GitHub"
            >
              <span className="github-icon" aria-hidden="true" />
            </a>
          </nav>
          <p className="footer-note">Forged with love, fueled by snacks.</p>
        </div>
      </footer>
    </>
  );
}
