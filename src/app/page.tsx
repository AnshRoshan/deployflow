import { getAuth } from "@/lib/auth";
import { HomePage } from "@/components/home-page";
export const dynamic = "force-dynamic";
export default async function RootPage() {
  const auth = await getAuth();
  return <HomePage signedIn={Boolean(auth)} userName={auth?.user.name} />;
}
