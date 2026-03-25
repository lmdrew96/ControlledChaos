import { LegalFooter } from "@/components/layout/legal-footer";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center">{children}</div>
      <footer className="py-6 text-center">
        <LegalFooter className="justify-center" />
      </footer>
    </div>
  );
}
