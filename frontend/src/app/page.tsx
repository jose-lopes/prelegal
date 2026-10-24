import { DemoLogin } from "@/components/demo-login";
import { loadTemplate } from "@/lib/template";

export const dynamic = "force-static";

export default function Home() {
  return <DemoLogin template={loadTemplate()} />;
}
