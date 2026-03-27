import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { LegalFooter } from "@/components/layout/legal-footer";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-foreground/80 hover:text-foreground transition-colors">
          <Logo className="h-7 w-7" />
          ControlledChaos
        </Link>
        {children}
      </div>
      <footer className="py-6 text-center">
        <LegalFooter className="justify-center" />
      </footer>
    </div>
  );
}
