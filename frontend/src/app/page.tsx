import { DemoLogin } from "@/components/demo-login";
import { loadTemplates } from "@/lib/template";

export const dynamic = "force-static";

export default function Home() {
  return <DemoLogin templates={loadTemplates()} />;
}
