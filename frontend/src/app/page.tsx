import { NdaBuilder } from "@/components/nda-builder";
import { loadTemplate } from "@/lib/template";

export const dynamic = "force-static";

export default function Home() {
  return <NdaBuilder template={loadTemplate()} />;
}
