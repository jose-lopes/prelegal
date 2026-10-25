import { AccountApp } from "@/components/account-app";
import { loadTemplates } from "@/lib/template";

export const dynamic = "force-static";

export default function Home() {
  return <AccountApp templates={loadTemplates()} />;
}
